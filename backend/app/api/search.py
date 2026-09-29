"""全文搜索：标题+摘要+正文 LIKE 匹配"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import article_service

router = APIRouter(prefix="/api/search", tags=["搜索"])


@router.get("")
def search(q: str = "", limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 100)
    return article_service.list_articles(db, q=q.strip(), limit=limit, offset=max(offset, 0))
