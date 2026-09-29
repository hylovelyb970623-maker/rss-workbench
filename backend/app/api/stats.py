"""统计与元信息"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import config
from app.database import get_db
from app.services import ai_service, stats_service

router = APIRouter(prefix="/api", tags=["统计"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    return stats_service.get_dashboard(db)


@router.get("/meta")
def get_meta():
    """设置页展示的后端配置状态（不泄露具体值）"""
    return {
        "rsshub_configured": bool(config.RSSHUB_BASE),
        "rsshub_base": config.RSSHUB_BASE,
        "freshrss_configured": bool(config.FRESHRSS_BASE and config.FRESHRSS_USER and config.FRESHRSS_TOKEN),
        "llm_configured": ai_service.is_configured(),
        "llm_model": config.LLM_MODEL if ai_service.is_configured() else "",
        "scheduler_enabled": config.SCHEDULER_ENABLED,
        "fetch_interval_minutes": config.FETCH_INTERVAL_MINUTES,
        "retention_days": config.RETENTION_DAYS,
        "auth_required": bool(config.APP_PASSWORD),
    }
