"""订阅源管理：添加探测、定时抓取、条件请求、文章入库

所有对外请求统一走 _http_get：仅允许 http/https，解析目标主机并阻断
私网/环回/链路本地地址（FETCH_ALLOW_PRIVATE=true 时放行，用于内网 RSSHub），
重定向手动逐跳校验，防 SSRF。
"""
import ipaddress
import logging
import re
import socket
import threading
from datetime import datetime, timedelta, timezone as dt_timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlparse

import feedparser
import requests
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import config
from app.models import Article, Category, Feed
from app.services.classifier import classify, clean_text
from app.utils.timezone import beijing_now, to_beijing_naive

logger = logging.getLogger(__name__)

UA = "rss-workbench/1.0"
_MAX_REDIRECTS = 3
# 串行化单源刷新：防止「定时任务 + 手动刷新」并发抓同一源时
# 双方都判定 guid 不存在而重复插入，撞 (feed_id, guid) 唯一约束
_refresh_lock = threading.Lock()


# ---------------------------------------------------------------- 请求安全

def _reject_ip(addr: str) -> bool:
    ip = ipaddress.ip_address(addr)
    return (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    )


def _validate_url(url: str) -> str:
    """校验协议与目标主机：非 http(s)、解析失败或指向内网地址均拒绝"""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"仅支持 http/https 地址: {url}")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f"地址缺少主机名: {url}")
    if config.FETCH_ALLOW_PRIVATE:
        return url
    try:
        ipaddress.ip_address(hostname)  # 本身就是 IP 字面量
    except ValueError:
        try:
            infos = socket.getaddrinfo(hostname, None)
        except OSError as e:
            raise ValueError(f"主机名解析失败: {hostname} ({e})")
        for info in infos:
            if _reject_ip(info[4][0]):
                raise ValueError(f"目标主机指向内网/保留地址，已被安全策略拦截: {hostname}")
    else:
        if _reject_ip(hostname):
            raise ValueError(f"内网/保留地址已被安全策略拦截: {hostname}")
    return url


def _http_get(url: str, headers: dict | None = None) -> requests.Response:
    """带 SSRF 校验的 GET，手动逐跳跟随重定向"""
    _validate_url(url)
    resp = requests.get(url, timeout=config.FETCH_TIMEOUT, headers=headers or {"User-Agent": UA},
                        allow_redirects=False)
    hops = 0
    while resp.status_code in (301, 302, 303, 307, 308) and hops < _MAX_REDIRECTS:
        location = resp.headers.get("Location")
        if not location:
            break
        next_url = urljoin(resp.url, location)
        _validate_url(next_url)
        resp = requests.get(next_url, timeout=config.FETCH_TIMEOUT,
                            headers=headers or {"User-Agent": UA}, allow_redirects=False)
        hops += 1
    if resp.status_code in (301, 302, 303, 307, 308):
        raise ValueError(f"重定向次数超过 {_MAX_REDIRECTS} 次")
    return resp


# 供其他服务（如 AI 发现）复用的安全请求入口
http_get = _http_get


# ---------------------------------------------------------------- 地址处理

def normalize_feed_url(url: str) -> str:
    """支持 rsshub:路由 简写，展开为完整 RSSHub 地址"""
    url = (url or "").strip()
    if url.lower().startswith("rsshub:"):
        if not config.RSSHUB_BASE:
            raise ValueError("后端未配置 RSSHUB_BASE，无法解析 rsshub: 简写地址")
        route = url.split(":", 1)[1].strip().lstrip("/")
        if not route:
            raise ValueError("rsshub: 后面需要跟路由，例如 rsshub:wallstreetcn/hot")
        return f"{config.RSSHUB_BASE.rstrip('/')}/{route}"
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError("地址必须以 http(s):// 开头，或使用 rsshub:路由 简写")
    return url


_LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)


def _attr(tag: str, name: str) -> str:
    m = re.search(rf'{name}\s*=\s*["\']([^"\']*)["\']', tag, re.IGNORECASE)
    return (m.group(1) if m else "").strip()


def discover_feed_url(url: str) -> str:
    """如果给的是普通网页地址，尝试自动发现页面里的 RSS/Atom 链接"""
    try:
        resp = _http_get(url)
        resp.raise_for_status()
        ctype = resp.headers.get("content-type", "")
    except Exception:
        return url  # 探测失败按原地址处理，交给后续抓取暴露真实错误
    if "html" not in ctype.lower():
        return url
    for m in _LINK_TAG_RE.finditer(resp.text):
        tag = m.group(0)
        rel, type_ = _attr(tag, "rel").lower(), _attr(tag, "type").lower()
        href = _attr(tag, "href")
        if href and rel == "alternate" and ("rss" in type_ or "atom" in type_):
            return urljoin(url, href)
    return url


# ---------------------------------------------------------------- 抓取解析

def _entry_datetime(entry) -> datetime:
    """优先用 feedparser 解析好的 struct_time（UTC），其次 RFC822 字符串"""
    st = entry.get("published_parsed") or entry.get("updated_parsed")
    if st:
        try:
            return to_beijing_naive(datetime(*st[:6], tzinfo=dt_timezone.utc))
        except Exception:
            pass
    for key in ("published", "updated"):
        raw = entry.get(key)
        if raw:
            try:
                return to_beijing_naive(parsedate_to_datetime(raw))
            except Exception:
                continue
    return beijing_now()


def _entry_guid(entry) -> str:
    guid = (entry.get("id") or entry.get("link") or entry.get("title") or "").strip()
    return guid[:1000]


def refresh_feed(db: Session, feed: Feed) -> dict:
    """抓取单个订阅源，按 (feed_id, guid) 去重新增文章（加锁防并发重复插入）"""
    with _refresh_lock:
        return _refresh_feed_locked(db, feed)


def _refresh_feed_locked(db: Session, feed: Feed) -> dict:
    headers = {"User-Agent": UA}
    if feed.etag:
        headers["If-None-Match"] = feed.etag
    if feed.last_modified:
        headers["If-Modified-Since"] = feed.last_modified
    try:
        resp = _http_get(feed.url, headers)
        if resp.status_code == 304:
            feed.last_fetched_at = beijing_now()
            feed.last_error = ""
            db.commit()
            return {"feed_id": feed.id, "new": 0, "total": 0, "not_modified": True}
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)
        # 格式非法且一条都解析不出来时视为抓取失败，而不是静默成功
        if getattr(parsed, "bozo", False) and not parsed.entries:
            raise ValueError(f"不是有效的 RSS/Atom 源: {parsed.get('bozo_exception', '内容解析失败')}")
        channel = parsed.feed or {}

        if not feed.site_url and channel.get("link"):
            feed.site_url = channel.get("link", "")
        if not feed.description and channel.get("description"):
            feed.description = clean_text(channel.get("description"))[:1000]

        new_count = 0
        for entry in parsed.entries or []:
            guid = _entry_guid(entry)
            title = (entry.get("title") or "").strip()
            if not guid or not title:
                continue
            exists = (
                db.query(Article.id)
                .filter(Article.feed_id == feed.id, Article.guid == guid)
                .first()
            )
            if exists:
                continue
            raw_summary = entry.get("summary") or ""
            raw_content = ""
            content_list = entry.get("content") or []
            if content_list:
                raw_content = content_list[0].get("value") or ""
            if not raw_content:
                raw_content = raw_summary
            db.add(Article(
                feed_id=feed.id,
                guid=guid,
                title=title[:500],
                url=(entry.get("link") or "")[:1000],
                author=(entry.get("author") or "")[:200],
                summary=clean_text(raw_summary)[:2000],
                content=raw_content,
                keyword_category=classify(title, clean_text(raw_summary)),
                published_at=_entry_datetime(entry),
            ))
            new_count += 1

        feed.etag = resp.headers.get("ETag") or ""
        feed.last_modified = resp.headers.get("Last-Modified") or ""
        feed.last_fetched_at = beijing_now()
        feed.last_error = ""
        feed.error_count = 0
        db.commit()
        return {"feed_id": feed.id, "new": new_count, "total": len(parsed.entries or []), "not_modified": False}
    except Exception as e:
        feed.last_error = str(e)[:1000]
        feed.error_count = (feed.error_count or 0) + 1
        feed.last_fetched_at = beijing_now()
        db.commit()
        logger.error(f"[抓取] 源「{feed.title}」失败: {e}")
        return {"feed_id": feed.id, "new": 0, "total": 0, "error": str(e)}


def refresh_all(db: Session, force: bool = False) -> dict:
    """刷新所有未暂停且到期的订阅源；force=True 时全部刷新"""
    now = beijing_now()
    feeds = db.query(Feed).filter(Feed.paused == False).all()  # noqa: E712
    results = []
    for feed in feeds:
        interval = feed.fetch_interval_minutes or config.FETCH_INTERVAL_MINUTES
        due = not feed.last_fetched_at or feed.last_fetched_at <= now - timedelta(minutes=interval)
        if not force and not due:
            continue
        results.append(refresh_feed(db, feed))
    total_new = sum(r.get("new", 0) for r in results)
    errors = [r for r in results if r.get("error")]
    logger.info(f"[抓取] 刷新 {len(results)} 个源，新增 {total_new} 篇，{len(errors)} 个失败")
    return {"refreshed": len(results), "new_articles": total_new, "errors": len(errors), "results": results}


# ---------------------------------------------------------------- CRUD

def feed_to_dict(feed: Feed, unread: int = 0, total: int = 0, category_name: str = "") -> dict:
    return {
        "id": feed.id,
        "title": feed.title,
        "url": feed.url,
        "site_url": feed.site_url or "",
        "description": feed.description or "",
        "category_id": feed.category_id,
        "category_name": category_name,
        "is_rsshub": bool(feed.is_rsshub),
        "fetch_interval_minutes": feed.fetch_interval_minutes,
        "paused": bool(feed.paused),
        "last_fetched_at": feed.last_fetched_at.isoformat() if feed.last_fetched_at else None,
        "last_error": feed.last_error or "",
        "error_count": feed.error_count or 0,
        "unread_count": unread,
        "total_count": total,
    }


def list_feeds(db: Session) -> list[dict]:
    feeds = db.query(Feed).order_by(Feed.category_id.asc(), Feed.id.asc()).all()
    cat_names = {c.id: c.name for c in db.query(Category).all()}
    unread_map = dict(
        db.query(Article.feed_id, func.count(Article.id))
        .filter(Article.is_read == False)  # noqa: E712
        .group_by(Article.feed_id)
        .all()
    )
    total_map = dict(
        db.query(Article.feed_id, func.count(Article.id)).group_by(Article.feed_id).all()
    )
    return [
        feed_to_dict(
            f,
            unread=unread_map.get(f.id, 0),
            total=total_map.get(f.id, 0),
            category_name=cat_names.get(f.category_id, ""),
        )
        for f in feeds
    ]


def list_feeds_by_id(db: Session, feed_id: int) -> dict:
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise ValueError("订阅源不存在")
    cat_name = ""
    if feed.category_id:
        cat = db.query(Category).filter(Category.id == feed.category_id).first()
        cat_name = cat.name if cat else ""
    unread = (
        db.query(func.count(Article.id))
        .filter(Article.feed_id == feed_id, Article.is_read == False)  # noqa: E712
        .scalar()
    ) or 0
    total = (db.query(func.count(Article.id)).filter(Article.feed_id == feed_id).scalar()) or 0
    return feed_to_dict(feed, unread=unread, total=total, category_name=cat_name)


def _clean_interval(value) -> int | None:
    """抓取间隔钳位：1 分钟 ~ 365 天"""
    if value is None:
        return None
    try:
        return min(max(1, int(value)), 525600)
    except (TypeError, ValueError):
        return None


def _check_category(db: Session, category_id) -> None:
    if category_id is not None and not db.query(Category.id).filter(Category.id == category_id).first():
        raise ValueError("分类不存在")


def create_feed(db: Session, data: dict) -> dict:
    url = discover_feed_url(normalize_feed_url(data.get("url", "")))
    if db.query(Feed).filter(Feed.url == url).first():
        raise ValueError("该订阅源已存在")
    category_id = data.get("category_id")
    _check_category(db, category_id)
    feed = Feed(
        title=(data.get("title") or "").strip(),
        url=url,
        category_id=category_id,
        fetch_interval_minutes=_clean_interval(data.get("fetch_interval_minutes")),
        is_rsshub=bool(config.RSSHUB_BASE) and url.startswith(config.RSSHUB_BASE.rstrip("/") + "/"),
    )
    # 探测频道信息（标题/站点链接/描述）
    try:
        resp = _http_get(url)
        resp.raise_for_status()
        channel = feedparser.parse(resp.content).feed or {}
        if not feed.title:
            feed.title = (channel.get("title") or url)[:300]
        feed.site_url = (channel.get("link") or "")[:1000]
        feed.description = clean_text(channel.get("description") or "")[:1000]
    except Exception as e:
        if not feed.title:
            feed.title = url[:300]
        feed.last_error = str(e)[:1000]
    db.add(feed)
    try:
        db.commit()
    except IntegrityError:
        # 并发添加同一地址时唯一约束兜底
        db.rollback()
        raise ValueError("该订阅源已存在")
    refresh_feed(db, feed)  # 添加后立即抓一次文章
    return list_feeds_by_id(db, feed.id)


def update_feed(db: Session, feed_id: int, data: dict) -> dict:
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise ValueError("订阅源不存在")
    # router 已用 exclude_unset；显式 null 表示清空可空字段（分类/间隔），
    # 不可空字段（标题/暂停）收到 null 时忽略，避免写坏数据
    if "title" in data and data["title"]:
        feed.title = str(data["title"]).strip()[:300] or feed.title
    if "category_id" in data:
        _check_category(db, data["category_id"])
        feed.category_id = data["category_id"]
    if "fetch_interval_minutes" in data:
        feed.fetch_interval_minutes = _clean_interval(data["fetch_interval_minutes"])
    if "paused" in data and data["paused"] is not None:
        feed.paused = bool(data["paused"])
    db.commit()
    return list_feeds_by_id(db, feed_id)


def delete_feed(db: Session, feed_id: int) -> dict:
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise ValueError("订阅源不存在")
    db.delete(feed)
    db.commit()
    return {"deleted": feed_id}
