"""OPML 导入导出：与其他阅读器（FreshRSS/Miniflux/Feedly）互通订阅"""
import logging
from xml.sax.saxutils import quoteattr

from defusedxml.ElementTree import fromstring as _defused_fromstring
from sqlalchemy.orm import Session

from app import config
from app.models import Category, Feed

logger = logging.getLogger(__name__)

_MAX_OPML_SIZE = 5 * 1024 * 1024  # 5MB


def _safe_fromstring(xml_text: str):
    """用 defusedxml 解析（防实体扩展），并限制输入大小"""
    if len(xml_text) > _MAX_OPML_SIZE:
        raise ValueError("OPML 文件过大（超过 5MB）")
    return _defused_fromstring(xml_text)


def import_opml(db: Session, xml_text: str) -> dict:
    """解析 OPML 大纲：带 xmlUrl 的是订阅源，外层 outline 是分类文件夹"""
    root = _safe_fromstring(xml_text)
    body = root.find("body")
    if body is None:
        raise ValueError("无效的 OPML 文件（缺少 body）")

    stats = {"categories": 0, "feeds": 0, "skipped": 0}
    # 同时跟踪库内和本批次已加入的 URL，避免同文件重复导致唯一约束崩溃
    seen_urls = {row[0] for row in db.query(Feed.url).all()}

    def _walk(parent, category_id):
        for outline in parent.findall("outline"):
            xml_url = (outline.get("xmlUrl") or outline.get("xmlurl") or "").strip()
            if xml_url:
                # 只接受 http/https 订阅地址，其他协议（file:/javascript: 等）直接跳过
                if not xml_url.lower().startswith(("http://", "https://")):
                    stats["skipped"] += 1
                    continue
                if xml_url[:1000] in seen_urls:
                    stats["skipped"] += 1
                    continue
                title = (outline.get("title") or outline.get("text") or xml_url).strip()
                seen_urls.add(xml_url[:1000])
                db.add(Feed(
                    title=title[:300],
                    url=xml_url[:1000],
                    site_url=(outline.get("htmlUrl") or "")[:1000],
                    category_id=category_id,
                    is_rsshub=bool(config.RSSHUB_BASE) and xml_url.startswith(config.RSSHUB_BASE.rstrip("/") + "/"),
                ))
                stats["feeds"] += 1
            else:
                name = (outline.get("text") or outline.get("title") or "").strip()
                if not name:
                    continue
                cat = db.query(Category).filter(Category.name == name).first()
                if cat is None:
                    cat = Category(name=name[:100])
                    db.add(cat)
                    db.flush()
                    stats["categories"] += 1
                _walk(outline, cat.id)

    _walk(body, None)
    db.commit()
    logger.info(f"[OPML] 导入完成: {stats}")
    return stats


def export_opml(db: Session) -> str:
    """导出为 OPML 2.0，分类作为文件夹层级"""
    categories = db.query(Category).order_by(Category.sort_order, Category.id).all()
    feeds = db.query(Feed).order_by(Feed.id).all()

    grouped: dict = {c.id: [] for c in categories}
    uncategorized: list = []
    for f in feeds:
        if f.category_id in grouped:
            grouped[f.category_id].append(f)
        else:
            uncategorized.append(f)

    def _outline(feed: Feed) -> str:
        attrs = [
            "type=\"rss\"",
            f"text={quoteattr(feed.title)}",
            f"title={quoteattr(feed.title)}",
            f"xmlUrl={quoteattr(feed.url)}",
        ]
        if feed.site_url:
            attrs.append(f"htmlUrl={quoteattr(feed.site_url)}")
        return f'        <outline {" ".join(attrs)}/>'

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0">',
        "  <head>",
        "    <title>RSS 工作台订阅</title>",
        "  </head>",
        "  <body>",
    ]
    for feed in uncategorized:
        lines.append(_outline(feed))
    for cat in categories:
        cat_feeds = grouped[cat.id]
        if not cat_feeds:
            continue
        lines.append(f'      <outline text={quoteattr(cat.name)} title={quoteattr(cat.name)}>')
        lines.extend("  " + _outline(f) for f in cat_feeds)
        lines.append("      </outline>")
    lines.extend(["  </body>", "</opml>"])
    return "\n".join(lines)
