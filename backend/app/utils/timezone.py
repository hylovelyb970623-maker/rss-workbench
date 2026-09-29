"""北京时间工具（数据库统一存 naive 北京时间）"""
from datetime import datetime
from zoneinfo import ZoneInfo

BEIJING_TZ = ZoneInfo("Asia/Shanghai")


def beijing_now() -> datetime:
    return datetime.now(BEIJING_TZ).replace(tzinfo=None)


def to_beijing_naive(dt: datetime) -> datetime:
    if dt is None:
        return dt
    if dt.tzinfo is not None:
        dt = dt.astimezone(BEIJING_TZ).replace(tzinfo=None)
    return dt
