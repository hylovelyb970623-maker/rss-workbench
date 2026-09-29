"""应用级 KV 元信息（如预置源标记）"""
from sqlalchemy import Column, String

from app.database import Base


class AppMeta(Base):
    __tablename__ = "app_meta"

    key = Column(String(100), primary_key=True)
    value = Column(String(500), default="")
