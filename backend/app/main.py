"""RSS 工作台 API 入口"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app import config
from app.api import articles, auth, categories, discover, feeds, opml, search, stats
from app.api.auth import verify_token
from app.database import SessionLocal, init_db
from app.scheduler.jobs import start_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

WHITE_PREFIXES = ("/api/auth", "/api/health")
WHITE_PATHS = ("/docs", "/redoc", "/openapi.json")


class AuthMiddleware(BaseHTTPMiddleware):
    """可选的全局密码认证：设置 APP_PASSWORD 后，除白名单外都需要 token"""

    async def dispatch(self, request: Request, call_next):
        if not config.APP_PASSWORD:
            return await call_next(request)
        path = request.url.path
        if path.startswith(WHITE_PREFIXES) or path in WHITE_PATHS:
            return await call_next(request)
        token = ""
        header = request.headers.get("authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
        if not token:
            token = request.query_params.get("token", "")
        if not token:
            token = request.cookies.get("rss_token", "")
        if verify_token(token):
            return await call_next(request)
        return JSONResponse({"detail": "未登录或登录已过期"}, status_code=401)


app = FastAPI(title="RSS 工作台 API", version="1.0.0")
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(feeds.router)
app.include_router(categories.router)
app.include_router(articles.router)
app.include_router(search.router)
app.include_router(opml.router)
app.include_router(stats.router)
app.include_router(discover.router)


@app.on_event("startup")
def _startup():
    init_db()
    from app.services.seed_service import seed_feeds_if_empty

    db = SessionLocal()
    try:
        seed_feeds_if_empty(db)
    finally:
        db.close()
    start_scheduler()
    logger.info("RSS 工作台后端已启动")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "rss-workbench"}
