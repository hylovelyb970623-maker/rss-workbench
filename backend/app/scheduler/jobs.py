"""后台定时任务：到期抓取、过期清理、AI 批量摘要"""
import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app import config
from app.database import SessionLocal

logger = logging.getLogger(__name__)
scheduler = BackgroundScheduler()


def _with_db(fn_name: str, fn):
    db = SessionLocal()
    try:
        fn(db)
    except Exception as e:
        logger.error(f"[定时任务] {fn_name} 失败: {e}")
    finally:
        db.close()


def _refresh_job():
    from app.services.feed_service import refresh_all

    _with_db("订阅刷新", lambda db: refresh_all(db))


def _cleanup_job():
    from app.services.article_service import cleanup_old_articles

    _with_db("文章清理", cleanup_old_articles)


def _ai_summary_job():
    from app.services.ai_service import is_configured, summarize_pending

    if not is_configured():
        return
    _with_db("AI 摘要", summarize_pending)


def start_scheduler():
    if not config.SCHEDULER_ENABLED:
        logger.info("[调度] 已通过 SCHEDULER_ENABLED=false 关闭")
        return
    scheduler.add_job(
        _refresh_job, "interval", minutes=max(1, config.SCHEDULER_FETCH_MINUTES),
        id="refresh_feeds", next_run_time=datetime.now(),
    )
    scheduler.add_job(
        _cleanup_job, "cron",
        hour=min(23, max(0, config.SCHEDULER_CLEANUP_HOUR)), minute=0, id="cleanup_articles",
    )
    if config.AI_SUMMARY_ENABLED:
        scheduler.add_job(
            _ai_summary_job, "interval",
            minutes=max(1, config.SCHEDULER_AI_SUMMARY_MINUTES), id="ai_summary",
        )
    scheduler.start()
    logger.info(
        f"[调度] 已启动: 抓取每 {config.SCHEDULER_FETCH_MINUTES} 分钟, "
        f"清理每日 {config.SCHEDULER_CLEANUP_HOUR}:00"
        + (f", AI 摘要每 {config.SCHEDULER_AI_SUMMARY_MINUTES} 分钟" if config.AI_SUMMARY_ENABLED else "")
    )
