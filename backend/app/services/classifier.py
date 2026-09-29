"""文章关键词分类（移植自 kanban rss_news_service 的打分逻辑）

分组顺序即平级时的优先级：company_earnings 放在最前，
避免"亏损"之类的财报词被误判到风险预警组。
"""
import html
import re

CATEGORY_KEYWORDS = [
    ("company_earnings", ["财报", "earnings", "业绩", "营收", "利润", "eps", "guidance"]),
    ("macro_policy", ["美联储", "央行", "利率", "通胀", "cpi", "gdp", "政策", "关税"]),
    ("ai_tech", ["ai", "人工智能", "芯片", "openai", "nvidia", "英伟达", "科技", "算力"]),
    ("capital", ["融资", "ipo", "并购", "回购", "减持", "增持", "etf"]),
    ("market_hotspot", ["涨停", "跌停", "板块", "概念", "热点", "领涨", "领跌", "反弹"]),
    ("industry", ["行业", "产业", "供应链", "汽车", "新能源", "医药", "消费", "光伏", "储能"]),
    ("global_market", ["bloomberg", "finviz", "yahoo", "美股", "港股", "纳指", "标普", "道指", "dollar", "oil", "gold"]),
    ("risk_alert", ["风险", "处罚", "调查", "暴跌", "下修", "亏损", "违约", "退市", "lawsuit", "recall"]),
]

CATEGORY_LABELS = {
    "company_earnings": "公司财报",
    "macro_policy": "宏观政策",
    "ai_tech": "AI/科技",
    "capital": "资本动向",
    "market_hotspot": "市场热点",
    "industry": "行业动态",
    "global_market": "全球市场",
    "risk_alert": "风险预警",
    "market": "市场综合",
}

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def clean_text(text: str) -> str:
    """去 HTML 标签、还原实体、压缩空白"""
    if not text:
        return ""
    text = html.unescape(text)
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def classify(title: str = "", content: str = "", extra: str = "") -> str:
    """按关键词命中数打分，返回得分最高的分组，无命中回退 market"""
    text = clean_text(f"{extra} {title} {content}").lower()
    if not text:
        return "market"
    best, best_score = "market", 0
    for name, keywords in CATEGORY_KEYWORDS:
        score = sum(text.count(k) for k in keywords)
        if score > best_score:
            best, best_score = name, score
    return best
