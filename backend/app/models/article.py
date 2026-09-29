"""文章"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.timezone import beijing_now


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (UniqueConstraint("feed_id", "guid", name="uq_article_feed_guid"),)

    id = Column(Integer, primary_key=True, index=True)
    feed_id = Column(Integer, ForeignKey("feeds.id", ondelete="CASCADE"), nullable=False, index=True)
    guid = Column(String(1000), nullable=False)  # 订阅源内的唯一标识，用于去重

    title = Column(String(500), nullable=False)
    url = Column(String(1000), default="")
    author = Column(String(200), default="")
    summary = Column(Text, default="")   # 纯文本摘要（去 HTML）
    content = Column(Text, default="")   # 原始内容（阅读面板渲染）

    keyword_category = Column(String(30), default="market", index=True)  # 关键词分类
    ai_summary = Column(Text, default="")
    ai_tags = Column(JSON, default=list)
    ai_status = Column(String(20), default="none")  # none/pending/done/failed

    published_at = Column(DateTime, nullable=True, index=True)
    is_read = Column(Boolean, default=False, index=True)
    read_at = Column(DateTime, nullable=True)
    is_starred = Column(Boolean, default=False, index=True)
    starred_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=beijing_now)

    feed = relationship("Feed", back_populates="articles")
