"use client";

import { ExternalLink, Sparkles, Star, RotateCcw } from "lucide-react";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useState } from "react";
import { CategoryChip } from "@/components/CategoryChip";
import type { Article } from "@/types/rss";
import { cn, formatDateTime, safeUrl } from "@/lib/utils";

interface ArticleReaderProps {
  article: Article | null;
  onBack?: () => void; // 移动端返回列表
  onToggleStar: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onSummarize: (article: Article) => Promise<void>;
}

export function ArticleReader({ article, onBack, onToggleStar, onToggleRead, onSummarize }: ArticleReaderProps) {
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState("");

  // 切换文章时清掉上一篇的摘要错误与进行中状态
  useEffect(() => {
    setSummarizeError("");
    setSummarizing(false);
  }, [article?.id]);

  const content = article?.content ?? "";
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);
  // 正文 HTML 来自不可信的订阅源，渲染前统一消毒（剥离脚本/事件处理器/危险协议）
  const sanitizedHtml = useMemo(
    () => (hasHtml ? DOMPurify.sanitize(content, { USE_PROFILES: { html: true } }) : ""),
    [content, hasHtml]
  );

  if (!article) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0b1120] text-[#64748b]">
        <Sparkles className="h-10 w-10" />
        <div className="text-sm">选择一篇文章开始阅读</div>
        <div className="text-xs">快捷键：j/k 切换 · o 原文 · s 星标 · m 已读 · ? 帮助</div>
      </div>
    );
  }

  const linkUrl = safeUrl(article.url);

  const doSummarize = async () => {
    setSummarizing(true);
    setSummarizeError("");
    try {
      await onSummarize(article);
    } catch (err) {
      setSummarizeError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#0b1120]">
      {/* 操作栏 */}
      <div className="flex items-center gap-1 border-b border-[#334155] px-4 py-2">
        {onBack && (
          <button
            onClick={onBack}
            className="mr-1 rounded-md px-2 py-1 text-xs text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
          >
            ← 返回
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onToggleRead(article)}
          title={article.is_read ? "标为未读 (m)" : "标为已读 (m)"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            article.is_read ? "text-[#64748b] hover:text-white" : "text-[#3b82f6]"
          )}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => onToggleStar(article)}
          title={article.is_starred ? "取消星标 (s)" : "加星标 (s)"}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            article.is_starred ? "text-[#fbbf24]" : "text-[#64748b] hover:text-[#94a3b8]"
          )}
        >
          <Star className={cn("h-4 w-4", article.is_starred && "fill-current")} />
        </button>
        {linkUrl && (
          <a
            href={linkUrl}
            target="_blank"
            rel="noreferrer noopener"
            title="打开原文 (o)"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] hover:text-[#60a5fa]"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* 正文 */}
      <article className="flex-1 overflow-y-auto px-6 py-5 md:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
            <span className="font-medium text-[#94a3b8]">{article.feed_title}</span>
            {article.author && <span>· {article.author}</span>}
            <span>· {formatDateTime(article.published_at)}</span>
            <CategoryChip category={article.keyword_category} />
            {article.is_read && <span className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[10px]">已读</span>}
          </div>

          <h1 className="mb-4 text-xl font-semibold leading-snug md:text-2xl">{article.title}</h1>

          {/* AI 摘要 */}
          <div className="mb-6 rounded-xl border border-[#334155] bg-[#131c31] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#a78bfa]">
              <Sparkles className="h-3.5 w-3.5" />
              AI 摘要
            </div>
            {article.ai_summary ? (
              <div>
                <p className="text-sm leading-relaxed text-[#cbd5e1]">{article.ai_summary}</p>
                {article.ai_tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {article.ai_tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[#1e293b] px-2 py-0.5 text-[11px] text-[#94a3b8]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <button
                  onClick={doSummarize}
                  disabled={summarizing}
                  className="flex items-center gap-1.5 rounded-lg border border-[#475569] px-3 py-1.5 text-xs text-[#94a3b8] hover:border-[#a78bfa] hover:text-[#a78bfa] disabled:opacity-50"
                >
                  <Sparkles className={cn("h-3.5 w-3.5", summarizing && "animate-pulse")} />
                  {summarizing ? "生成中…" : article.ai_status === "failed" ? "重试生成" : "生成摘要"}
                </button>
                {summarizeError && <div className="mt-2 text-xs text-[#f87171]">{summarizeError}</div>}
              </div>
            )}
          </div>

          {/* 正文内容（已消毒） */}
          {hasHtml ? (
            <div className="article-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
          ) : article.content || article.summary ? (
            <div className="article-content whitespace-pre-wrap">{article.content || article.summary}</div>
          ) : (
            <p className="text-sm text-[#64748b]">
              该文章没有正文内容，
              {linkUrl && (
                <a href={linkUrl} target="_blank" rel="noreferrer noopener" className="text-[#60a5fa] underline">
                  打开原文
                </a>
              )}
              查看。
            </p>
          )}

          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-8 inline-flex items-center gap-1.5 rounded-lg border border-[#334155] px-4 py-2 text-xs text-[#94a3b8] hover:border-[#3b82f6] hover:text-[#60a5fa]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              阅读原文
            </a>
          )}
        </div>
      </article>
    </div>
  );
}
