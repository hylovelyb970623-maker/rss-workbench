"""统计：仪表盘数据（总量、每日发文、分类分布、各源未读排行）"""
from datetime import timedelta

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models import Article, Category, Feed
from app.services.classifier import CATEGORY_LABELS
from app.utils.timezone import beijing_now


def _count(query) -> int:
    return query.count()


def get_dashboard(db: Session) -> dict:
    now = beijing_now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    sort_time = func.coalesce(Article.published_at, Article.created_at)

    article_total = _count(db.query(Article))
    unread_total = _count(db.query(Article).filter(Article.is_read == False))  # noqa: E712
    starred_total = _count(db.query(Article).filter(Article.is_starred == True))  # noqa: E712
    feed_total = _count(db.query(Feed))
    paused_total = _count(db.query(Feed).filter(Feed.paused == True))  # noqa: E712
    category_total = _count(db.query(Category))
    today_new = _count(db.query(Article).filter(sort_time >= today_start))
    read_ratio = round((article_total - unread_total) / article_total, 4) if article_total else 0

    # 近 14 天每日发文量与已读量（缺日期补 0）
    since = today_start - timedelta(days=13)
    rows = (
        db.query(
            func.date(sort_time),
            func.count(Article.id),
            func.sum(case((Article.is_read == True, 1), else_=0)),  # noqa: E712
        )
        .filter(sort_time >= since)
        .group_by(func.date(sort_time))
        .all()
    )
    by_date = {str(r[0]): (r[1], r[2] or 0) for r in rows}
    daily = []
    for i in range(14):
        day = (since + timedelta(days=i)).date().isoformat()
        total, read = by_date.get(day, (0, 0))
        daily.append({"date": day, "total": total, "read": read})

    # 关键词分类分布
    kw_rows = (
        db.query(Article.keyword_category, func.count(Article.id))
        .group_by(Article.keyword_category)
        .all()
    )
    keyword_distribution = [
        {
            "key": key or "market",
            "label": CATEGORY_LABELS.get(key or "market", key),
            "count": count,
        }
        for key, count in kw_rows
    ]
    keyword_distribution.sort(key=lambda x: x["count"], reverse=True)

    # 各源未读排行（前 10）
    rank_rows = (
        db.query(Feed.title, func.count(Article.id))
        .join(Article, Article.feed_id == Feed.id)
        .filter(Article.is_read == False)  # noqa: E712
        .group_by(Feed.id, Feed.title)
        .order_by(func.count(Article.id).desc())
        .limit(10)
        .all()
    )
    feed_unread_rank = [{"title": t, "unread": c} for t, c in rank_rows]

    return {
        "totals": {
            "articles": article_total,
            "unread": unread_total,
            "starred": starred_total,
            "feeds": feed_total,
            "paused_feeds": paused_total,
            "categories": category_total,
            "today_new": today_new,
            "read_ratio": read_ratio,
        },
        "daily": daily,
        "keyword_distribution": keyword_distribution,
        "feed_unread_rank": feed_unread_rank,
    }
