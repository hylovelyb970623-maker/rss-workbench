"use client";

import { Menu } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddFeedDialog } from "@/components/AddFeedDialog";
import { ArticleList } from "@/components/ArticleList";
import { ArticleReader } from "@/components/ArticleReader";
import { DiscoverDialog } from "@/components/DiscoverDialog";
import { FeedPanel, type Scope, type StatusFilter } from "@/components/FeedPanel";
import { KeyboardHelp } from "@/components/KeyboardHelp";
import { api, AuthExpiredError } from "@/lib/api";
import { useIsMobile } from "@/lib/useIsMobile";
import { safeUrl } from "@/lib/utils";
import type { Article, Category, Feed } from "@/types/rss";

const PAGE_SIZE = 50;

export function ReadingWorkbench() {
  const isMobile = useIsMobile();
  const searchRef = useRef<HTMLInputElement>(null);

  // 侧栏数据
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totals, setTotals] = useState({ articles: 0, unread: 0, starred: 0 });

  // 当前筛选
  const [scope, setScope] = useState<Scope>({ type: "all" });
  const [status, setStatus] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");

  // 文章列表
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);

  // 弹层 / 移动端
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileReader, setMobileReader] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadSideData = useCallback(async () => {
    try {
      const [feedsRes, catsRes] = await Promise.all([api.getFeeds(), api.getCategories()]);
      setFeeds(feedsRes);
      setCategories(catsRes);
    } catch (e) {
      if (!(e instanceof AuthExpiredError)) console.error(e);
    }
  }, []);

  const loadTotals = useCallback(async () => {
    try {
      const stats = await api.getStats();
      setTotals(stats.totals);
    } catch (e) {
      if (!(e instanceof AuthExpiredError)) console.error(e);
    }
  }, []);

  const loadArticles = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const res = await api.getArticles({
          feed_id: scope.type === "feed" ? scope.id : undefined,
          category_id: scope.type === "category" ? scope.id : undefined,
          status,
          q,
          limit: PAGE_SIZE,
          offset,
        });
        setTotal(res.total);
        setArticles((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
      } catch (e) {
        if (!(e instanceof AuthExpiredError)) console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [scope, status, q]
  );

  // 初始加载
  useEffect(() => {
    loadSideData();
    loadTotals();
  }, [loadSideData, loadTotals]);

  // 筛选变化时重新加载
  useEffect(() => {
    loadArticles(0);
    setSelected(null);
    setMobileReader(false);
  }, [loadArticles]);

  // ------------------------------------------------ 操作

  const patchArticle = useCallback((updated: Article) => {
    setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
  }, []);

  const selectArticle = useCallback(
    (article: Article) => {
      setSelected(article);
      setMobileReader(true);
      if (!article.is_read) {
        api
          .updateArticle(article.id, { is_read: true })
          .then((updated) => {
            patchArticle(updated);
            loadSideData();
            loadTotals();
          })
          .catch(() => {});
      }
    },
    [patchArticle, loadSideData, loadTotals]
  );

  const toggleStar = useCallback(
    (article: Article) => {
      api
        .updateArticle(article.id, { is_starred: !article.is_starred })
        .then((updated) => {
          patchArticle(updated);
          loadTotals();
        })
        .catch(() => {});
    },
    [patchArticle, loadTotals]
  );

  const toggleRead = useCallback(
    (article: Article) => {
      api
        .updateArticle(article.id, { is_read: !article.is_read })
        .then((updated) => {
          patchArticle(updated);
          loadSideData();
          loadTotals();
        })
        .catch(() => {});
    },
    [patchArticle, loadSideData, loadTotals]
  );

  const markAllRead = useCallback(async () => {
    const label = scopeTitle(scope);
    if (!window.confirm(`将「${label}」的所有未读文章标为已读？`)) return;
    try {
      await api.markAllRead({
        feed_id: scope.type === "feed" ? scope.id : undefined,
        category_id: scope.type === "category" ? scope.id : undefined,
      });
      await Promise.all([loadArticles(0), loadSideData(), loadTotals()]);
    } catch (e) {
      if (!(e instanceof AuthExpiredError)) window.alert(e instanceof Error ? e.message : "操作失败");
    }
  }, [scope, loadArticles, loadSideData, loadTotals]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api.refreshAllFeeds();
      await Promise.all([loadArticles(0), loadSideData(), loadTotals()]);
      if (res.errors > 0) {
        window.alert(`刷新完成，新增 ${res.new_articles} 篇，${res.errors} 个源抓取失败（详情见设置页）`);
      }
    } catch (e) {
      if (!(e instanceof AuthExpiredError)) window.alert(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setRefreshing(false);
    }
  }, [loadArticles, loadSideData, loadTotals]);

  const summarize = useCallback(
    async (article: Article) => {
      const res = await api.summarizeArticle(article.id);
      patchArticle({ ...article, ai_summary: res.ai_summary, ai_tags: res.ai_tags, ai_status: "done" });
    },
    [patchArticle]
  );

  const navigate = useCallback(
    (delta: number) => {
      if (articles.length === 0) return;
      const idx = selected ? articles.findIndex((a) => a.id === selected.id) : -1;
      let next = idx + delta;
      if (next < 0) next = 0;
      if (next >= articles.length) {
        if (articles.length < total) {
          loadArticles(articles.length); // 到底部自动加载更多
        }
        return;
      }
      const target = articles[next];
      if (target) {
        selectArticle(target);
        setMobileReader(true);
      }
    },
    [articles, selected, total, loadArticles, selectArticle]
  );

  // ------------------------------------------------ 键盘快捷键

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHelpOpen(false);
        setDialogOpen(false);
        setDrawerOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          navigate(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          navigate(-1);
          break;
        case "o": {
          const url = safeUrl(selected?.url);
          if (url) window.open(url, "_blank", "noopener");
          break;
        }
        case "s":
          if (selected) toggleStar(selected);
          break;
        case "m":
          if (selected) toggleRead(selected);
          break;
        case "r":
          e.preventDefault();
          refreshAll();
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "?":
          setHelpOpen(true);
          break;
        case "A":
          markAllRead();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, articles, navigate, toggleStar, toggleRead, refreshAll, markAllRead]);

  // ------------------------------------------------ 渲染

  const title = useMemo(() => scopeTitle(scope), [scope]);
  const canLoadMore = articles.length < total;

  const feedPanel = (
    <FeedPanel
      feeds={feeds}
      categories={categories}
      totals={totals}
      scope={scope}
      status={status}
      refreshing={refreshing}
      onSelectScope={(s) => {
        setScope(s);
        setDrawerOpen(false);
      }}
      onSetStatus={setStatus}
      onRefreshAll={refreshAll}
      onAddFeed={() => setDialogOpen(true)}
      onDiscover={() => setDiscoverOpen(true)}
    />
  );

  const articleList = (
    <ArticleList
      ref={searchRef}
      articles={articles}
      total={total}
      loading={loading}
      title={title}
      status={status}
      searchValue={searchInput}
      selectedId={selected?.id ?? null}
      canLoadMore={canLoadMore}
      onSearchChange={setSearchInput}
      onStatusChange={setStatus}
      onSelect={selectArticle}
      onToggleStar={toggleStar}
      onLoadMore={() => loadArticles(articles.length)}
      onMarkAllRead={markAllRead}
    />
  );

  const articleReader = (
    <ArticleReader
      article={selected}
      onBack={isMobile ? () => setMobileReader(false) : undefined}
      onToggleStar={toggleStar}
      onToggleRead={toggleRead}
      onSummarize={summarize}
    />
  );

  return (
    <div className="relative h-full">
      {isMobile ? (
        <div className="flex h-full flex-col pt-11 pb-14">
          {/* 移动端顶栏 */}
          <div className="fixed inset-x-0 top-0 z-30 flex h-11 items-center gap-2 border-b border-[#334155] bg-[#131c31] px-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#94a3b8] hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-medium">{mobileReader ? selected?.title ?? "阅读" : title}</span>
          </div>

          <div className="min-h-0 flex-1">
            {mobileReader ? articleReader : articleList}
          </div>

          {/* 订阅抽屉 */}
          {drawerOpen && (
            <div className="fixed inset-0 z-40 flex pt-11 pb-14">
              <div className="w-72 max-w-[80%] border-r border-[#334155]">{feedPanel}</div>
              <div className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full">
          <div className="w-60 shrink-0">{feedPanel}</div>
          <div className="w-[420px] shrink-0">{articleList}</div>
          <div className="min-w-0 flex-1">{articleReader}</div>
        </div>
      )}

      <AddFeedDialog
        open={dialogOpen}
        categories={categories}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          loadArticles(0);
          loadSideData();
          loadTotals();
        }}
      />
      <DiscoverDialog
        open={discoverOpen}
        categories={categories}
        onClose={() => setDiscoverOpen(false)}
        onAdded={() => {
          loadArticles(0);
          loadSideData();
          loadTotals();
        }}
      />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function scopeTitle(scope: Scope): string {
  if (scope.type === "feed") return scope.title;
  if (scope.type === "category") return scope.title;
  return "全部文章";
}
