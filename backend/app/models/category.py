"""订阅分类"""
from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base
from app.utils.timezone import beijing_now


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=beijing_now)
