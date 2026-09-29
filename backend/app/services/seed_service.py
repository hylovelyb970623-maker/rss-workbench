"""首次启动预置订阅：FreshRSS 分类源与 RSSHub 路由（地址全部由环境变量拼出）

所有地址都由环境变量拼出（RSSHUB_BASE / FRESHRSS_*），未配置的部分跳过。
"""
import logging
from urllib.parse import urlencode

from sqlalchemy.orm import Session

from app import config
from app.models import AppMeta, Category, Feed
from app.utils.timezone import beijing_now

logger = logging.getLogger(__name__)

_SEED_MARKER = "seeded_v1"

# (分类名, 源标题, FreshRSS 附加参数)
_FRESHRSS_PRESET = [
    ("综合新闻", "全部资讯（近7天）", {"hours": 168}),
    ("财经资讯", "财经资讯", {"hours": 168, "get": "c_4"}),
    ("AI/科技", "AI/科技", {"hours": 168, "get": "c_5"}),
    ("综合新闻", "综合新闻", {"hours": 168, "get": "c_6"}),
    ("公司财报", "公司财报（近30天）", {"hours": 720, "get": "c_7"}),
]

# (分类名, 源标题, RSSHub 路由)
_RSSHUB_PRESET = [
    ("财经资讯", "华尔街见闻·快讯", "/wallstreetcn/hot"),
    ("财经资讯", "华尔街见闻·直播", "/wallstreetcn/live"),
    ("综合新闻", "彭博社", "/bloomberg"),
    ("综合新闻", "Finviz 美股", "/finviz/news"),
]


def _freshrss_url(extra_params: dict) -> str:
    params = {"a": "rss", "user": config.FRESHRSS_USER, "token": config.FRESHRSS_TOKEN}
    params.update(extra_params)
    return f"{config.FRESHRSS_BASE.rstrip('/')}/?{urlencode(params)}"


def seed_feeds_if_empty(db: Session) -> None:
    """只在「从未种过且没有任何订阅」的全新库上写入预置订阅；用户删光订阅后重启不会再来"""
    if db.query(AppMeta).filter(AppMeta.key == _SEED_MARKER).first():
        return
    if db.query(Feed).count() > 0:
        # 已有订阅（如 OPML 导入）但没有标记：只补标记，不注入预置
        db.add(AppMeta(key=_SEED_MARKER, value=beijing_now().isoformat()))
        db.commit()
        return

    presets: list[tuple[str, str, str, bool]] = []  # (分类, 标题, URL, is_rsshub)

    if config.FRESHRSS_BASE and config.FRESHRSS_USER and config.FRESHRSS_TOKEN:
        for cat_name, title, extra in _FRESHRSS_PRESET:
            presets.append((cat_name, title, _freshrss_url(extra), False))
        logger.info(f"[预置] 检测到 FreshRSS 配置，将预置 {len(_FRESHRSS_PRESET)} 个分类源")
    else:
        logger.info("[预置] 未配置 FreshRSS（FRESHRSS_BASE/USER/TOKEN），跳过 FreshRSS 预置源")

    if config.RSSHUB_BASE:
        base = config.RSSHUB_BASE.rstrip("/")
        for cat_name, title, route in _RSSHUB_PRESET:
            presets.append((cat_name, title, f"{base}{route}", True))
        logger.info(f"[预置] 检测到 RSSHub 配置，将预置 {len(_RSSHUB_PRESET)} 条路由")
    else:
        logger.info("[预置] 未配置 RSSHUB_BASE，跳过 RSSHub 预置源")

    if not presets:
        logger.info("[预置] 无可用预置源，请在页面上手动添加订阅")
        return

    cat_map: dict[str, Category] = {}
    for cat_name, title, url, is_rsshub in presets:
        cat = cat_map.get(cat_name)
        if cat is None:
            cat = db.query(Category).filter(Category.name == cat_name).first()
            if cat is None:
                cat = Category(name=cat_name, sort_order=len(cat_map))
                db.add(cat)
                db.flush()
            cat_map[cat_name] = cat
        db.add(Feed(title=title, url=url, category_id=cat.id, is_rsshub=is_rsshub))
    db.add(AppMeta(key=_SEED_MARKER, value=beijing_now().isoformat()))
    db.commit()
    logger.info(f"[预置] 已写入 {len(presets)} 个预置订阅源")
