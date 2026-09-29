"""分类接口"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Article, Category, Feed

router = APIRouter(prefix="/api/categories", tags=["分类"])


class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 0


def _to_dict(cat: Category, feed_count: int = 0, unread: int = 0) -> dict:
    return {
        "id": cat.id,
        "name": cat.name,
        "sort_order": cat.sort_order or 0,
        "feed_count": feed_count,
        "unread_count": unread,
    }


def _query_categories(db: Session) -> list[dict]:
    categories = db.query(Category).order_by(Category.sort_order, Category.id).all()
    feed_map = dict(db.query(Feed.category_id, func.count(Feed.id)).group_by(Feed.category_id).all())
    unread_map = dict(
        db.query(Feed.category_id, func.count(Article.id))
        .join(Article, Article.feed_id == Feed.id)
        .filter(Article.is_read == False)  # noqa: E712
        .group_by(Feed.category_id)
        .all()
    )
    return [
        _to_dict(c, feed_map.get(c.id, 0), unread_map.get(c.id, 0))
        for c in categories
    ]


@router.get("")
def list_categories(db: Session = Depends(get_db)):
    return _query_categories(db)


@router.post("")
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="分类名不能为空")
    if db.query(Category).filter(Category.name == name).first():
        raise HTTPException(status_code=400, detail="分类已存在")
    cat = Category(name=name, sort_order=data.sort_order)
    db.add(cat)
    db.commit()
    return _to_dict(cat)


@router.put("/{category_id}")
def update_category(category_id: int, data: CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="分类名不能为空")
    dup = db.query(Category).filter(Category.name == name, Category.id != category_id).first()
    if dup:
        raise HTTPException(status_code=400, detail="分类名已被使用")
    cat.name = name
    cat.sort_order = data.sort_order
    db.commit()
    return _to_dict(cat)


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    db.delete(cat)  # 订阅源 category_id 置空（SET NULL）
    db.commit()
    return {"deleted": category_id}
