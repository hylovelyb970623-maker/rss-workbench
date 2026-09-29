"""AI 摘要与标签：接入 OpenAI 兼容接口，未配置时优雅降级"""
import json
import logging
import re

from sqlalchemy.orm import Session

from app import config
from app.models import Article
from app.services.classifier import clean_text

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(config.LLM_API_KEY and config.LLM_BASE_URL and config.LLM_MODEL)


def get_client():
    """OpenAI 兼容客户端（AI 摘要与 AI 发现共用）"""
    from openai import OpenAI

    return OpenAI(api_key=config.LLM_API_KEY, base_url=config.LLM_BASE_URL, timeout=90)


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("模型输出中未找到 JSON")
    return json.loads(text[start:end + 1])


def summarize_article(db: Session, article: Article) -> dict:
    """对单篇文章生成中文摘要和标签，结果写回文章"""
    if not is_configured():
        raise ValueError("LLM 未配置（需在 .env 中设置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL）")
    content = clean_text(article.content or article.summary or "")[:3000]
    prompt = (
        "你是新闻编辑助手。请阅读下面的新闻，输出简体中文摘要（80字以内）和3-5个中文标签。"
        '只输出 JSON，格式：{"summary": "摘要", "tags": ["标签1", "标签2"]}\n\n'
        f"标题：{article.title}\n正文：{content}"
    )
    article.ai_status = "pending"
    db.commit()
    try:
        resp = get_client().chat.completions.create(
            model=config.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        data = _extract_json(resp.choices[0].message.content or "")
        article.ai_summary = str(data.get("summary") or "")[:2000]
        article.ai_tags = [str(t)[:50] for t in (data.get("tags") or [])][:5]
        article.ai_status = "done"
    except Exception:
        article.ai_status = "failed"
        db.commit()
        raise
    db.commit()
    return {"ai_summary": article.ai_summary, "ai_tags": article.ai_tags}


def summarize_pending(db: Session, limit: int = 0) -> int:
    """定时任务批量补摘要：优先处理最近的未读且未生成过的文章"""
    if not is_configured():
        return 0
    limit = limit or config.AI_SUMMARY_BATCH
    articles = (
        db.query(Article)
        .filter(Article.ai_status == "none")
        .order_by(Article.published_at.desc())
        .limit(limit)
        .all()
    )
    count = 0
    for a in articles:
        try:
            summarize_article(db, a)
            count += 1
        except Exception as e:
            logger.warning(f"[AI] 文章 {a.id} 摘要失败: {e}")
    return count
