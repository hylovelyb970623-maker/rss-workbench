"""订阅源接口"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import feed_service

router = APIRouter(prefix="/api/feeds", tags=["订阅源"])


class FeedCreate(BaseModel):
    url: str
    title: str = ""
    category_id: int | None = None
    fetch_interval_minutes: int | None = None


class FeedUpdate(BaseModel):
    title: str | None = None
    category_id: int | None = None
    fetch_interval_minutes: int | None = None
    paused: bool | None = None


@router.get("")
def list_feeds(db: Session = Depends(get_db)):
    return feed_service.list_feeds(db)


@router.post("")
def create_feed(data: FeedCreate, db: Session = Depends(get_db)):
    try:
        return feed_service.create_feed(db, data.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{feed_id}")
def update_feed(feed_id: int, data: FeedUpdate, db: Session = Depends(get_db)):
    try:
        return feed_service.update_feed(db, feed_id, data.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{feed_id}")
def delete_feed(feed_id: int, db: Session = Depends(get_db)):
    try:
        return feed_service.delete_feed(db, feed_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{feed_id}/refresh")
def refresh_feed(feed_id: int, db: Session = Depends(get_db)):
    from app.models import Feed

    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="订阅源不存在")
    result = feed_service.refresh_feed(db, feed)
    if result.get("error"):
        raise HTTPException(status_code=502, detail=f"抓取失败: {result['error']}")
    return result


@router.post("/refresh-all")
def refresh_all(db: Session = Depends(get_db)):
    return feed_service.refresh_all(db, force=True)
