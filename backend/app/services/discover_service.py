"""AI 发现新订阅源：根据现有订阅与阅读兴趣生成推荐，并逐个验证可用性

安全设计：模型给的每个地址都走与正常抓取相同的 SSRF 校验请求
（仅 http/https、私网拦截、受控重定向），内网地址会被直接拒绝。
"""
import json
import logging
import re

import feedparser
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import config
from app.models import Article, Category, Feed
from app.services.ai_service import get_client, is_configured
from app.services.classifier import CATEGORY_LABELS
from app.services.feed_service import http_get, normalize_feed_url

logger = logging.getLogger(__name__)

MAX_SUGGESTIONS = 10


def _extract_json_array(text: str) -> list:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        data = json.loads(text[start:end + 1])
        return data if isinstance(data, list) else [data]
    # 兼容只输出单个对象的情况
    s2, e2 = text.find("{"), text.rfind("}")
    if s2 != -1 and e2 > s2:
        return [json.loads(text[s2:e2 + 1])]
    raise ValueError("模型输出中未找到 JSON")


def _build_context(db: Session) -> str:
    """现有订阅 + 关键词分布 + 近期文章标题，作为推荐依据"""
    feeds = db.query(Feed).all()
    cat_names = {c.id: c.name for c in db.query(Category).all()}
    lines = ["现有订阅源："]
    lines.extend(f"- {f.title}（分类: {cat_names.get(f.category_id, '未分类')}）" for f in feeds)
    if not feeds:
        lines.append("-（暂无订阅）")

    kw_rows = (
        db.query(Article.keyword_category, func.count(Article.id))
        .group_by(Article.keyword_category)
        .order_by(func.count(Article.id).desc())
        .limit(5)
        .all()
    )
    if kw_rows:
        dist = "、".join(f"{CATEGORY_LABELS.get(k, k)} {c} 篇" for k, c in kw_rows)
        lines.append(f"\n阅读内容的关键词分类分布：{dist}")

    recent = (
        db.query(Article.title)
        .order_by(func.coalesce(Article.published_at, Article.created_at).desc())
        .limit(15)
        .all()
    )
    if recent:
        lines.append("\n近期文章标题样本：")
        lines.extend(f"- {t}" for (t,) in recent)

    return "\n".join(lines)


def _validate_suggestion(url: str) -> dict:
    """实际请求一次，验证地址是可解析的 RSS/Atom 源"""
    resp = http_get(url)
    resp.raise_for_status()
    parsed = feedparser.parse(resp.content)
    if getattr(parsed, "bozo", False) and not parsed.entries:
        raise ValueError("不是有效的 RSS/Atom 源")
    channel = parsed.feed or {}
    return {
        "verified_title": (channel.get("title") or "")[:300],
        "site_url": (channel.get("link") or "")[:1000],
        "entry_count": len(parsed.entries or []),
        "sample_title": (parsed.entries[0].get("title") or "")[:200] if parsed.entries else "",
    }


def suggest_feeds(db: Session, topic: str = "", count: int = 6) -> dict:
    """LLM 生成候选订阅源 -> 去重 -> 逐个验证可用性"""
    if not is_configured():
        raise ValueError("LLM 未配置（需在 .env 中设置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）")
    count = min(max(count, 1), MAX_SUGGESTIONS)
    context = _build_context(db)

    topic_line = f"\n用户本次感兴趣的方向：{topic}" if topic else ""
    rsshub_line = (
        f"当前已部署 RSSHub：{config.RSSHUB_BASE}，有对应路由的源优先填 route 字段（以 / 开头）。"
        if config.RSSHUB_BASE else "未部署 RSSHub，route 字段留空，url 必须是完整 RSS/Atom 地址。"
    )
    prompt = (
        "你是 RSS 订阅发现顾问。根据用户的现有订阅、阅读兴趣和近期关注的主题，"
        f"推荐 {count} 个用户还没有订阅的、高质量且稳定更新的 RSS 订阅源。\n\n"
        f"{context}\n{topic_line}\n{rsshub_line}\n"
        "要求：\n"
        "1. 与用户兴趣相关但避免和现有订阅内容高度重复\n"
        "2. url 必须是 RSS/Atom 订阅地址本身，不能是普通网页首页\n"
        "3. 优先知名、稳定的源；不确定确切地址时宁可不推荐\n"
        "只输出 JSON 数组，不要输出其他内容，元素格式：\n"
        '[{"title": "源名称", "route": "/rsshub路由 或 空字符串", "url": "https://... 或 空字符串", '
        '"reason": "20字以内的推荐理由", "category": "建议分类，如 财经资讯/AI/科技/综合新闻/公司财报 或自定义"}]'
    )

    resp = get_client().chat.completions.create(
        model=config.LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    items = _extract_json_array(resp.choices[0].message.content or "")
    logger.info(f"[AI发现] 模型返回 {len(items)} 个候选")

    existing_urls = {row[0] for row in db.query(Feed.url).all()}
    suggestions = []
    for item in items[:count]:
        if not isinstance(item, dict):
            continue
        route = str(item.get("route") or "").strip()
        raw_url = str(item.get("url") or "").strip()
        title = str(item.get("title") or "").strip()[:300]
        suggestion = {
            "title": title,
            "url": "",
            "reason": str(item.get("reason") or "").strip()[:200],
            "category": str(item.get("category") or "").strip()[:50],
            "status": "invalid",
            "verified_title": "",
            "site_url": "",
            "entry_count": 0,
            "sample_title": "",
            "error": "",
        }
        try:
            url = normalize_feed_url(raw_url or (f"rsshub:{route.lstrip('/')}" if route else ""))
            suggestion["url"] = url
        except ValueError as e:
            suggestion["error"] = str(e)
            suggestions.append(suggestion)
            continue

        if url in existing_urls:
            suggestion["status"] = "duplicate"
            suggestions.append(suggestion)
            continue

        try:
            suggestion.update(_validate_suggestion(url))
            suggestion["status"] = "valid"
            if not suggestion["title"]:
                suggestion["title"] = suggestion["verified_title"] or url
        except Exception as e:
            suggestion["error"] = str(e)[:150]
        suggestions.append(suggestion)

    valid_count = sum(1 for s in suggestions if s["status"] == "valid")
    logger.info(f"[AI发现] 验证完成: {valid_count} 个可用 / {len(suggestions) - valid_count} 个不可用或重复")
    return {"suggestions": suggestions, "valid_count": valid_count, "topic": topic}
