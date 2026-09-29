"""应用配置：从项目根目录 .env 读取，未配置时使用默认值"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
ROOT_DIR = BASE_DIR.parent  # 项目根
load_dotenv(ROOT_DIR / ".env", override=False)

# 数据库（默认 SQLite，放在 backend/data/ 下）
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'data' / 'rss.db').as_posix()}")

# 登录（可选）：设置 APP_PASSWORD 后所有接口需要登录
APP_PASSWORD = os.getenv("APP_PASSWORD", "")
AUTH_SECRET = os.getenv("AUTH_SECRET", "")
AUTH_TOKEN_TTL_DAYS = int(os.getenv("AUTH_TOKEN_TTL_DAYS", "7"))

# RSSHub 地址（用于 rsshub:路由 简写和预置源），例如 http://host:1200
RSSHUB_BASE = os.getenv("RSSHUB_BASE", "")

# FreshRSS 输出地址（用于预置源），形如 http://host:8088/i/
FRESHRSS_BASE = os.getenv("FRESHRSS_BASE", "")
FRESHRSS_USER = os.getenv("FRESHRSS_USER", "")
FRESHRSS_TOKEN = os.getenv("FRESHRSS_TOKEN", "")

# 抓取
FETCH_TIMEOUT = int(os.getenv("FETCH_TIMEOUT", "10"))          # 单个源请求超时（秒）
FETCH_INTERVAL_MINUTES = int(os.getenv("FETCH_INTERVAL_MINUTES", "15"))  # 默认抓取间隔（分钟）
RETENTION_DAYS = int(os.getenv("RETENTION_DAYS", "30"))        # 文章保留天数（星标豁免）
# 是否允许抓取私网/环回地址（RSSHub 部署在内网时打开；默认关闭防 SSRF）
FETCH_ALLOW_PRIVATE = os.getenv("FETCH_ALLOW_PRIVATE", "false").lower() == "true"

# LLM（AI 摘要，可选）
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
AI_SUMMARY_ENABLED = os.getenv("AI_SUMMARY_ENABLED", "false").lower() == "true"
AI_SUMMARY_BATCH = int(os.getenv("AI_SUMMARY_BATCH", "5"))     # 定时任务每轮补摘要的篇数

# 调度
SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "true").lower() == "true"
SCHEDULER_FETCH_MINUTES = int(os.getenv("SCHEDULER_FETCH_MINUTES", "15"))
SCHEDULER_CLEANUP_HOUR = int(os.getenv("SCHEDULER_CLEANUP_HOUR", "4"))    # 每日清理时刻
SCHEDULER_AI_SUMMARY_MINUTES = int(os.getenv("SCHEDULER_AI_SUMMARY_MINUTES", "30"))

# CORS 允许的来源，逗号分隔；默认 *（自用/反代同源场景），公网部署建议收紧
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
