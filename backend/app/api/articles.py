"""文章接口：筛选列表、阅读状态、星标、AI 摘要"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article
from app.services import ai_service, article_service

router = APIRouter(prefix="/api/articles", tags=["文章"])


class ArticleUpdate(BaseModel):
    is_read: bool | None = None
    is_starred: bool | None = None


class MarkAllRead(BaseModel):
    feed_id: int | None = None
    category_id: int | None = None


@router.post("/mark-all-read")
def mark_all_read(data: MarkAllRead, db: Session = Depends(get_db)):
    return article_service.mark_all_read(db, feed_id=data.feed_id, category_id=data.category_id)


@router.get("")
def list_articles(
    feed_id: int | None = None,
    category_id: int | None = None,
    keyword_category: str | None = None,
    status: str = "all",
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    if status not in ("all", "unread", "starred"):
        raise HTTPException(status_code=400, detail="status 只支持 all/unread/starred")
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    return article_service.list_articles(
        db, feed_id=feed_id, category_id=category_id,
        keyword_category=keyword_category, status=status, q=q,
        limit=limit, offset=offset,
    )


@router.get("/{article_id}")
def get_article(article_id: int, db: Session = Depends(get_db)):
    try:
        return article_service.get_article(db, article_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{article_id}")
def update_article(article_id: int, data: ArticleUpdate, db: Session = Depends(get_db)):
    try:
        return article_service.set_article_state(
            db, article_id, is_read=data.is_read, is_starred=data.is_starred
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{article_id}/summarize")
def summarize_article(article_id: int, db: Session = Depends(get_db)):
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")
    try:
        return ai_service.summarize_article(db, article)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI 摘要失败: {e}")
