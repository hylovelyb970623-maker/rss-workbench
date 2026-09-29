"""文章查询与阅读状态管理"""
import logging
from datetime import timedelta

from sqlalchemy import or_
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app import config
from app.models import Article, Feed
from app.utils.timezone import beijing_now

logger = logging.getLogger(__name__)


def article_to_dict(a: Article, feed_title: str = "") -> dict:
    return {
        "id": a.id,
        "feed_id": a.feed_id,
        "feed_title": feed_title,
        "title": a.title,
        "url": a.url or "",
        "author": a.author or "",
        "summary": a.summary or "",
        "content": a.content or "",
        "keyword_category": a.keyword_category or "market",
        "ai_summary": a.ai_summary or "",
        "ai_tags": a.ai_tags or [],
        "ai_status": a.ai_status or "none",
        "published_at": a.published_at.isoformat() if a.published_at else None,
        "is_read": bool(a.is_read),
        "is_starred": bool(a.is_starred),
    }


def _base_query(db: Session, feed_id=None, category_id=None, keyword_category=None, status="all", q=""):
    query = db.query(Article)
    if feed_id:
        query = query.filter(Article.feed_id == feed_id)
    if category_id:
        # 用子查询避免 join + update 的兼容问题
        feed_ids = [row[0] for row in db.query(Feed.id).filter(Feed.category_id == category_id).all()]
        query = query.filter(Article.feed_id.in_(feed_ids or [-1]))
    if keyword_category:
        query = query.filter(Article.keyword_category == keyword_category)
    if status == "unread":
        query = query.filter(Article.is_read == False)  # noqa: E712
    elif status == "starred":
        query = query.filter(Article.is_starred == True)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Article.title.like(like),
            Article.summary.like(like),
            Article.content.like(like),
        ))
    return query


def _feed_title_map(db: Session) -> dict:
    return {row[0]: row[1] for row in db.query(Feed.id, Feed.title).all()}


def list_articles(db: Session, feed_id=None, category_id=None, keyword_category=None,
                  status="all", q="", limit=50, offset=0) -> dict:
    query = _base_query(db, feed_id, category_id, keyword_category, status, q)
    total = query.count()
    # 无发布时间的文章按入库时间兜底排序
    order_expr = sa_func.coalesce(Article.published_at, Article.created_at).desc()
    items = query.order_by(order_expr).offset(offset).limit(limit).all()
    titles = _feed_title_map(db)
    return {"total": total, "items": [article_to_dict(a, titles.get(a.feed_id, "")) for a in items]}


def get_article(db: Session, article_id: int) -> dict:
    a = db.query(Article).filter(Article.id == article_id).first()
    if not a:
        raise ValueError("文章不存在")
    titles = _feed_title_map(db)
    return article_to_dict(a, titles.get(a.feed_id, ""))


def set_article_state(db: Session, article_id: int, is_read=None, is_starred=None) -> dict:
    a = db.query(Article).filter(Article.id == article_id).first()
    if not a:
        raise ValueError("文章不存在")
    if is_read is not None:
        a.is_read = bool(is_read)
        a.read_at = beijing_now() if is_read else None
    if is_starred is not None:
        a.is_starred = bool(is_starred)
        a.starred_at = beijing_now() if is_starred else None
    db.commit()
    titles = _feed_title_map(db)
    return article_to_dict(a, titles.get(a.feed_id, ""))


def mark_all_read(db: Session, feed_id=None, category_id=None) -> dict:
    query = db.query(Article).filter(Article.is_read == False)  # noqa: E712
    if feed_id:
        query = query.filter(Article.feed_id == feed_id)
    if category_id:
        feed_ids = [row[0] for row in db.query(Feed.id).filter(Feed.category_id == category_id).all()]
        query = query.filter(Article.feed_id.in_(feed_ids or [-1]))
    count = query.update({Article.is_read: True, Article.read_at: beijing_now()}, synchronize_session=False)
    db.commit()
    return {"marked": count}


def cleanup_old_articles(db: Session) -> dict:
    """删除超过保留期的文章，星标文章豁免"""
    cutoff = beijing_now() - timedelta(days=config.RETENTION_DAYS)
    count = (
        db.query(Article)
        .filter(Article.is_starred == False)  # noqa: E712
        .filter(sa_func.coalesce(Article.published_at, Article.created_at) < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    logger.info(f"[清理] 删除 {count} 篇超过 {config.RETENTION_DAYS} 天的未星标文章")
    return {"deleted": count}
