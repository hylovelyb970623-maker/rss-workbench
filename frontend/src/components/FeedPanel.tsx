"use client";

import { Folder, Inbox, Plus, RefreshCw, Rss, Sparkles, Star, PauseCircle } from "lucide-react";
import type { Category, Feed } from "@/types/rss";
import { cn } from "@/lib/utils";

export type Scope =
  | { type: "all" }
  | { type: "feed"; id: number; title: string }
  | { type: "category"; id: number; title: string };

export type StatusFilter = "all" | "unread" | "starred";

interface FeedPanelProps {
  feeds: Feed[];
  categories: Category[];
  totals: { articles: number; unread: number; starred: number };
  scope: Scope;
  status: StatusFilter;
  refreshing: boolean;
  onSelectScope: (scope: Scope) => void;
  onSetStatus: (status: StatusFilter) => void;
  onRefreshAll: () => void;
  onAddFeed: () => void;
  onDiscover: () => void;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full bg-[#334155] px-1.5 py-0.5 text-[10px] font-medium text-[#e2e8f0]">
      {count > 999 ? "999+" : count}
    </span>
  );
}

export function FeedPanel({
  feeds, categories, totals, scope, status, refreshing,
  onSelectScope, onSetStatus, onRefreshAll, onAddFeed, onDiscover,
}: FeedPanelProps) {
  const quickItems: { key: StatusFilter; label: string; icon: typeof Inbox; count: number }[] = [
    { key: "all", label: "全部文章", icon: Inbox, count: totals.articles },
    { key: "unread", label: "未读", icon: Rss, count: totals.unread },
    { key: "starred", label: "星标", icon: Star, count: totals.starred },
  ];

  const uncategorized = feeds.filter((f) => !f.category_id);
  const byCategory = categories.map((cat) => ({
    cat,
    feeds: feeds.filter((f) => f.category_id === cat.id),
  })).filter((g) => g.feeds.length > 0);

  const isActive = (s: Scope) =>
    scope.type === s.type && (s.type === "all" || (scope as any).id === (s as any).id);

  return (
    <div className="flex h-full flex-col bg-[#131c31]">
      {/* 顶部操作 */}
      <div className="flex items-center gap-2 border-b border-[#334155] px-3 py-2.5">
        <button
          onClick={onAddFeed}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563eb]"
        >
          <Plus className="h-3.5 w-3.5" />
          添加订阅
        </button>
        <button
          onClick={onDiscover}
          title="AI 发现新订阅源"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#334155] text-[#a78bfa] hover:border-[#a78bfa]"
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <button
          onClick={onRefreshAll}
          disabled={refreshing}
          title="刷新全部订阅源"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#334155] text-[#94a3b8] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* 快捷过滤 */}
        <div className="mb-3 space-y-0.5">
          {quickItems.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => {
                onSetStatus(key);
                onSelectScope({ type: "all" });
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                scope.type === "all" && status === key
                  ? "bg-[#1e293b] text-white"
                  : "text-[#94a3b8] hover:bg-[#1e293b]/60 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
              <UnreadBadge count={key === "unread" ? count : key === "all" ? 0 : count} />
              {key === "all" && <span className="ml-auto shrink-0 text-[10px] text-[#64748b]">{count}</span>}
            </button>
          ))}
        </div>

        {/* 未分类订阅源 */}
        {uncategorized.length > 0 && (
          <div className="mb-3 space-y-0.5">
            {uncategorized.map((feed) => (
              <button
                key={feed.id}
                onClick={() => onSelectScope({ type: "feed", id: feed.id, title: feed.title })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                  isActive({ type: "feed", id: feed.id, title: "" })
                    ? "bg-[#1e293b] text-white"
                    : "text-[#94a3b8] hover:bg-[#1e293b]/60 hover:text-white"
                )}
                title={feed.last_error ? `抓取出错: ${feed.last_error}` : feed.title}
              >
                <Rss className="h-4 w-4 shrink-0 text-[#64748b]" />
                <span className="truncate">{feed.title}</span>
                {feed.paused && <PauseCircle className="h-3.5 w-3.5 shrink-0 text-[#f59e0b]" />}
                {feed.error_count > 0 && !feed.paused && (
                  <span className="shrink-0 text-[10px] text-[#f87171]" title={feed.last_error}>!</span>
                )}
                <UnreadBadge count={feed.unread_count} />
              </button>
            ))}
          </div>
        )}

        {/* 分类分组 */}
        {byCategory.map(({ cat, feeds: catFeeds }) => (
          <div key={cat.id} className="mb-3">
            <button
              onClick={() => onSelectScope({ type: "category", id: cat.id, title: cat.name })}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium",
                isActive({ type: "category", id: cat.id, title: "" })
                  ? "bg-[#1e293b] text-white"
                  : "text-[#cbd5e1] hover:bg-[#1e293b]/60"
              )}
            >
              <Folder className="h-4 w-4 shrink-0 text-[#64748b]" />
              <span className="truncate">{cat.name}</span>
              <UnreadBadge count={cat.unread_count ?? 0} />
            </button>
            <div className="mt-0.5 space-y-0.5 pl-3">
              {catFeeds.map((feed) => (
                <button
                  key={feed.id}
                  onClick={() => onSelectScope({ type: "feed", id: feed.id, title: feed.title })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                    isActive({ type: "feed", id: feed.id, title: "" })
                      ? "bg-[#1e293b] text-white"
                      : "text-[#94a3b8] hover:bg-[#1e293b]/60 hover:text-white"
                  )}
                  title={feed.last_error ? `抓取出错: ${feed.last_error}` : feed.title}
                >
                  <Rss className="h-4 w-4 shrink-0 text-[#64748b]" />
                  <span className="truncate">{feed.title}</span>
                  {feed.paused && <PauseCircle className="h-3.5 w-3.5 shrink-0 text-[#f59e0b]" />}
                  {feed.error_count > 0 && !feed.paused && (
                    <span className="shrink-0 text-[10px] text-[#f87171]" title={feed.last_error}>!</span>
                  )}
                  <UnreadBadge count={feed.unread_count} />
                </button>
              ))}
            </div>
          </div>
        ))}

        {feeds.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-[#64748b]">
            还没有订阅源
            <br />
            点击上方「添加订阅」开始
          </div>
        )}
      </div>
    </div>
  );
}
