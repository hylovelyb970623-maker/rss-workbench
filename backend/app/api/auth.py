"""认证：可选的全局密码登录，HMAC 无状态 token（同 kanban 模式）+ 登录限流"""
import hashlib
import hmac
import time
from collections import defaultdict

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from app import config

router = APIRouter(prefix="/api/auth", tags=["认证"])

# 登录限流：每个 IP 在窗口内最多失败 N 次，超过则临时锁定
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300
_LOCK_SECONDS = 600
_LOGIN_ATTEMPTS: dict = defaultdict(list)


def _rate_limited(ip: str) -> bool:
    now = time.time()
    attempts = [t for t in _LOGIN_ATTEMPTS[ip] if now - t < _WINDOW_SECONDS]
    _LOGIN_ATTEMPTS[ip] = attempts
    return len(attempts) >= _MAX_ATTEMPTS


def _prune_stale(now: float) -> None:
    """字典过大时清理过期条目，防慢内存泄漏"""
    if len(_LOGIN_ATTEMPTS) <= 1000:
        return
    for ip in list(_LOGIN_ATTEMPTS):
        attempts = [t for t in _LOGIN_ATTEMPTS[ip] if now - t < _WINDOW_SECONDS]
        if attempts:
            _LOGIN_ATTEMPTS[ip] = attempts
        else:
            _LOGIN_ATTEMPTS.pop(ip, None)


def _record_fail(ip: str) -> None:
    now = time.time()
    _prune_stale(now)
    _LOGIN_ATTEMPTS[ip].append(now)


def _clear(ip: str) -> None:
    _LOGIN_ATTEMPTS.pop(ip, None)


def _secret() -> bytes:
    return (config.AUTH_SECRET or config.APP_PASSWORD or "rss-workbench").encode()


def _sign(msg: str) -> str:
    return hmac.new(_secret(), msg.encode(), hashlib.sha256).hexdigest()


def make_token() -> tuple:
    exp = int(time.time()) + config.AUTH_TOKEN_TTL_DAYS * 86400
    return f"{exp}.{_sign(str(exp))}", exp


def verify_token(token: str) -> bool:
    if not token or not config.APP_PASSWORD:
        return False
    try:
        exp_str, sig = token.split(".", 1)
        if not hmac.compare_digest(_sign(exp_str), sig):
            return False
        return int(exp_str) > int(time.time())
    except Exception:
        return False


class LoginIn(BaseModel):
    password: str


@router.get("/status")
def status():
    """前端据此判断是否需要展示登录页"""
    return {"auth_required": bool(config.APP_PASSWORD)}


@router.post("/login")
def login(data: LoginIn, request: Request):
    if not config.APP_PASSWORD:
        return {"token": "", "expires_at": 0, "auth_required": False}
    ip = request.client.host if request.client else "unknown"
    if _rate_limited(ip):
        raise HTTPException(
            status_code=429,
            detail=f"尝试次数过多，请 {_LOCK_SECONDS // 60} 分钟后再试",
        )
    if not hmac.compare_digest(data.password.encode(), config.APP_PASSWORD.encode()):
        _record_fail(ip)
        raise HTTPException(status_code=401, detail="密码错误")
    _clear(ip)
    token, exp = make_token()
    return {"token": token, "expires_at": exp, "auth_required": True}


@router.get("/check")
def check(authorization: str = Header(default="")):
    if not config.APP_PASSWORD:
        return {"ok": True}
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    if verify_token(token):
        return {"ok": True}
    raise HTTPException(status_code=401, detail="token 无效或已过期")
