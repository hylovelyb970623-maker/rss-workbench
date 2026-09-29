"use client";

import { CheckCheck, Inbox, Search, Star } from "lucide-react";
import { forwardRef } from "react";
import { CategoryChip } from "@/components/CategoryChip";
import type { Article } from "@/types/rss";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { StatusFilter } from "@/components/FeedPanel";

interface ArticleListProps {
  articles: Article[];
  total: number;
  loading: boolean;
  title: string;
  status: StatusFilter;
  searchValue: string;
  selectedId: number | null;
  canLoadMore: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onSelect: (article: Article) => void;
  onToggleStar: (article: Article) => void;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
  { key: "starred", label: "星标" },
];

export const ArticleList = forwardRef<HTMLInputElement, ArticleListProps>(function ArticleList(
  {
    articles, total, loading, title, status, searchValue, selectedId, canLoadMore,
    onSearchChange, onStatusChange, onSelect, onToggleStar, onLoadMore, onMarkAllRead,
  },
  searchRef
) {
  return (
    <div className="flex h-full flex-col border-x border-[#334155] bg-[#0f172a]">
      {/* 头部：标题 + 状态切换 */}
      <div className="border-b border-[#334155] px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <span className="shrink-0 text-xs text-[#64748b]">{total} 篇</span>
          <button
            onClick={onMarkAllRead}
            title="全部标为已读 (Shift+A)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
          >
            <CheckCheck className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748b]" />
            <input
              ref={searchRef}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索标题 / 正文（按 / 聚焦）"
              className="w-full rounded-lg border border-[#334155] bg-[#131c31] py-1.5 pl-8 pr-3 text-xs outline-none placeholder:text-[#64748b] focus:border-[#3b82f6]"
            />
          </div>
          <div className="flex shrink-0 rounded-lg border border-[#334155] bg-[#131c31] p-0.5">
            {STATUS_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onStatusChange(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs",
                  status === key ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && articles.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-[#64748b]">加载中…</div>
        )}
        {!loading && articles.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-xs text-[#64748b]">
            <Inbox className="h-8 w-8" />
            {searchValue ? "没有匹配的文章" : "暂无文章，试试刷新订阅源"}
          </div>
        )}
        {articles.map((article) => (
          <div
            key={article.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(article)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(article);
              }
            }}
            className={cn(
              "cursor-pointer border-b border-[#1e293b] px-3 py-3 text-left transition-colors outline-none focus-visible:bg-[#1e293b]",
              selectedId === article.id ? "bg-[#1e293b]" : "hover:bg-[#131c31]",
              !article.is_read && "border-l-2 border-l-[#3b82f6]"
            )}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className={cn("min-w-0 flex-1 truncate text-xs", article.is_read ? "text-[#64748b]" : "text-[#94a3b8]")}>
                {article.feed_title}
              </span>
              <CategoryChip category={article.keyword_category} />
            </div>
            <div className="mb-1 flex items-start gap-1.5">
              <h3
                className={cn(
                  "min-w-0 flex-1 text-sm leading-snug",
                  article.is_read ? "font-normal text-[#94a3b8]" : "font-medium text-[#f1f5f9]"
                )}
              >
                {article.title}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(article);
                }}
                className={cn(
                  "shrink-0 p-0.5",
                  article.is_starred ? "text-[#fbbf24]" : "text-[#475569] hover:text-[#94a3b8]"
                )}
                title={article.is_starred ? "取消星标 (s)" : "加星标 (s)"}
              >
                <Star className={cn("h-4 w-4", article.is_starred && "fill-current")} />
              </button>
            </div>
            {article.summary && (
              <p className="mb-1.5 line-clamp-2 text-xs leading-relaxed text-[#64748b]">{article.summary}</p>
            )}
            <div className="text-[11px] text-[#475569]">{formatRelativeTime(article.published_at)}</div>
          </div>
        ))}
        {canLoadMore && articles.length > 0 && (
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="w-full py-3 text-center text-xs text-[#94a3b8] hover:text-white disabled:opacity-50"
          >
            {loading ? "加载中…" : "加载更多"}
          </button>
        )}
      </div>
    </div>
  );
});
