"""订阅源"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.timezone import beijing_now


class Feed(Base):
    __tablename__ = "feeds"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    url = Column(String(1000), nullable=False, unique=True, index=True)
    site_url = Column(String(1000), default="")
    description = Column(Text, default="")
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)

    is_rsshub = Column(Boolean, default=False)              # 是否来自 RSSHub
    fetch_interval_minutes = Column(Integer, nullable=True)  # 空 = 使用全局间隔
    paused = Column(Boolean, default=False)                  # 暂停抓取

    # 条件请求缓存
    etag = Column(String(500), default="")
    last_modified = Column(String(100), default="")

    last_fetched_at = Column(DateTime, nullable=True)
    last_error = Column(String(1000), default="")
    error_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=beijing_now)
    updated_at = Column(DateTime, default=beijing_now, onupdate=beijing_now)

    category = relationship("Category")
    articles = relationship(
        "Article", cascade="all, delete-orphan", passive_deletes=True, back_populates="feed"
    )
