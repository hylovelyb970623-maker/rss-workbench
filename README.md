# RSS 工作台（rss-workbench）

自托管的 RSS 阅读器 + 资讯仪表盘。自主管理订阅（任意 RSS/Atom 源，支持 RSSHub 路由简写），定时抓取入库，关键词自动分类，三栏阅读工作台 + 数据仪表盘，OPML 导入导出，可选 AI 摘要与 AI 发现新订阅源。

技术栈：FastAPI + SQLAlchemy(SQLite) + APScheduler / Next.js 14 + Tailwind 暗色主题 / docker-compose + nginx 部署。开源协议：[MIT](./LICENSE)。

## 功能

- **订阅管理**：增删改订阅源、分类文件夹、单独抓取间隔、暂停/恢复；添加时自动探测网页里的 RSS 链接；支持 `rsshub:wallstreetcn/hot` 简写（自动拼 RSSHUB_BASE）
- **AI 发现新订阅源**：输入感兴趣的方向（如"美股财报"），AI 根据现有订阅、关键词分类分布和近期文章生成候选源，并**逐个实际请求验证**（SSRF 同套防护），只把确认可用的标为绿色，支持单个添加或一键添加全部；接口 `POST /api/discover/suggest`
- **预置源**：首次启动按环境变量自动预置 FreshRSS 分类源（财经/AI/综合/财报）与 4 条 RSSHub 路由（华尔街见闻/彭博/Finviz），全部地址由 `.env` 拼出，不内置任何凭据
- **阅读工作台**：三栏布局（订阅源 → 文章列表 → 阅读面板），全部/未读/星标过滤、全文搜索、关键词分类色签
- **关键词自动分类**：8 组财经关键词打分（公司财报/宏观政策/AI科技/资本动向/市场热点/行业动态/全球市场/风险预警）
- **键盘快捷键**：`j/k` 切换、`o` 原文、`s` 星标、`m` 已读、`Shift+A` 全部已读、`r` 刷新、`/` 搜索、`?` 帮助
- **仪表盘**：未读/今日新文/已读比、近 14 天发文与已读图表、分类分布、各源未读排行
- **OPML 导入导出**：与 FreshRSS/Miniflux/Feedly 互通
- **AI 摘要**（可选）：OpenAI 兼容接口，逐篇生成中文摘要与标签，可定时批量补摘要；同一套 LLM 配置也驱动「AI 发现新订阅源」
- **定时任务**：到期自动抓取（ETag/Last-Modified 条件请求）、过期文章清理（星标豁免）
- **登录**（可选）：设置 `APP_PASSWORD` 后启用，HMAC 无状态 token

## 快速开始（本地开发）

```bash
# 1. 配置（可选，直接跑也行）
cp .env.example .env   # 按需填 RSSHUB_BASE / FRESHRSS_* / LLM_* 等

# 2. 安装依赖
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# 3. 启动（两个终端，或用启动脚本）
python run_backend.py    # 后端 http://127.0.0.1:8000，接口文档 /docs
python run_frontend.py   # 前端 http://localhost:3000
```

打开 http://localhost:3000 即可使用。

## Docker 部署

```bash
cp .env.example .env   # 按需修改
docker compose up -d --build
```

访问 `http://<服务器IP>:2455`。SQLite 数据持久化在 `rss-data` 卷。

## 配置说明（.env）

| 变量 | 默认 | 说明 |
|------|------|------|
| `APP_PASSWORD` | 空 | 访问密码；留空完全开放 |
| `AUTH_SECRET` / `AUTH_TOKEN_TTL_DAYS` | 派生 / 7 天 | token 签名与有效期 |
| `RSSHUB_BASE` | 空 | RSSHub 地址，启用 `rsshub:` 简写与预置路由 |
| `FRESHRSS_BASE` / `FRESHRSS_USER` / `FRESHRSS_TOKEN` | 空 | FreshRSS RSS 输出（`.../i/`），启用预置分类源 |
| `FETCH_TIMEOUT` / `FETCH_INTERVAL_MINUTES` | 10s / 15min | 抓取超时与默认间隔（每源可覆盖） |
| `RETENTION_DAYS` | 30 | 文章保留天数，星标豁免 |
| `FETCH_ALLOW_PRIVATE` | false | RSSHub/FreshRSS 在内网时改为 true（放行私网地址抓取） |
| `CORS_ORIGINS` | * | 允许的跨域来源，逗号分隔；公网部署建议收紧为站点域名 |
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | 空 | OpenAI 兼容接口，启用 AI 摘要 |
| `AI_SUMMARY_ENABLED` / `AI_SUMMARY_BATCH` | false / 5 | 定时批量补摘要 |
| `SCHEDULER_ENABLED` / `SCHEDULER_FETCH_MINUTES` / `SCHEDULER_CLEANUP_HOUR` | true / 15 / 4 | 调度 |

## 项目结构

```
backend/app/
├── api/         # 路由：feeds / categories / articles / search / opml / stats / auth
├── models/      # Feed / Category / Article（SQLAlchemy，SQLite WAL）
├── services/    # feed_service（抓取解析）/ classifier（关键词分类）/ article_service
│                # opml_service / ai_service / stats_service / seed_service（预置源）
├── scheduler/   # APScheduler：到期抓取、每日清理、可选 AI 摘要
└── main.py      # FastAPI 入口 + 可选认证中间件

frontend/src/
├── app/         # page（三栏阅读工作台）/ dashboard / settings
├── components/  # FeedPanel / ArticleList / ArticleReader / AddFeedDialog / KeyboardHelp ...
├── lib/         # api.ts（fetch+Bearer 封装）/ utils / useIsMobile
└── types/rss.ts
```

## 说明

- 文章去重按 `(订阅源, guid)`，同源同 guid 不会重复入库
- 抓取做了 SSRF 防护：仅允许 http/https，私网/环回地址默认拦截（内网 RSSHub 场景开 `FETCH_ALLOW_PRIVATE`）
- 正文直接渲染订阅源提供的 HTML（个人自用场景）；无正文的条目可一键跳原文
- 与现有 FreshRSS 的关系：本项目自主管理订阅；FreshRSS 只作为初始订阅的来源之一（按其分类 RSS 输出预置），后续订阅变化互不影响

## 安全设计

- **SSRF 防护**：所有对外抓取（订阅刷新、添加探测、AI 发现验证）统一走安全请求层——仅允许 http/https、DNS 解析后拦截私网/环回/链路本地地址、重定向逐跳校验（≤3 次）。RSSHub 部署在内网时用 `FETCH_ALLOW_PRIVATE=true` 放行
- **XSS 防护**：文章正文来自不可信的订阅源，渲染前经 DOMPurify 白名单消毒（剥离 script/事件属性/危险协议）；文章链接统一 `safeUrl` 校验，`javascript:` 等协议的"打开原文"直接隐藏（双层防护：feedparser 解析时也会剥离大部分危险标记）
- **登录限流**：`/api/auth/login` 每 IP 5 次失败后锁定 10 分钟；token 为 HMAC 签名（恒定时间比较）
- **上传防护**：OPML 上传读取前校验大小（≤5MB）、解析用 defusedxml（防实体扩展）、只接受 http/https 的订阅地址
- **输入校验**：分类引用存在性校验、抓取间隔钳位（1 分钟~365 天）、同文件重复 URL 去重（防唯一约束崩溃）
- **响应头**：nginx 隐藏版本号并附加 `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy`
- **CORS**：默认 `*` 便于本地开发，公网部署建议用 `CORS_ORIGINS` 收紧
- 注意：设置了 `APP_PASSWORD` 时 `/docs` 仍对外开放（仅接口文档，数据接口照样需要 token）；token 存于 localStorage，公网部署请务必启用密码并使用 HTTPS

## 参考的市面项目

- Miniflux：极简三栏、快捷键操作
- FreshRSS：分类过滤、扩展生态
- Follow：现代暗色 UI、AI 摘要
