"use client";

import { CheckCircle2, CircleX, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Category, DiscoverSuggestion } from "@/types/rss";

interface DiscoverDialogProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onAdded: () => void;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  valid: { label: "已验证可用", className: "text-[#34d399]" },
  invalid: { label: "无法访问", className: "text-[#f87171]" },
  duplicate: { label: "已在订阅中", className: "text-[#64748b]" },
};

export function DiscoverDialog({ open, categories, onClose, onAdded }: DiscoverDialogProps) {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<DiscoverSuggestion[]>([]);
  const [addedUrls, setAddedUrls] = useState<string[]>([]);
  const [addingUrl, setAddingUrl] = useState("");

  useEffect(() => {
    if (open) {
      setTopic("");
      setLoading(false);
      setError("");
      setSuggestions([]);
      setAddedUrls([]);
      setAddingUrl("");
    }
  }, [open]);

  // Esc 关闭（组件自身处理，不依赖父级）
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const generate = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.suggestFeeds(topic.trim());
      setSuggestions(res.suggestions);
      if (res.suggestions.length === 0) {
        setError("模型没有返回有效推荐，请调整方向后重试");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "推荐失败");
    } finally {
      setLoading(false);
    }
  };

  const matchCategoryId = (name: string): number | null => {
    const hit = categories.find((c) => c.name === name);
    return hit ? hit.id : null;
  };

  const addOne = async (s: DiscoverSuggestion) => {
    setAddingUrl(s.url);
    try {
      await api.createFeed({
        url: s.url,
        title: s.verified_title || s.title,
        category_id: matchCategoryId(s.category),
      });
      setAddedUrls((prev) => [...prev, s.url]);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAddingUrl("");
    }
  };

  const addAllValid = async () => {
    const targets = suggestions.filter((s) => s.status === "valid" && !addedUrls.includes(s.url));
    for (const s of targets) {
      // 逐个串行添加，避免并发写库冲突
      // eslint-disable-next-line no-await-in-loop
      await addOne(s);
    }
  };

  const validLeft = suggestions.filter((s) => s.status === "valid" && !addedUrls.includes(s.url)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[#334155] bg-[#1e293b]"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#a78bfa]" />
            <h2 className="text-base font-semibold">AI 发现新订阅源</h2>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 输入区 */}
        <div className="border-b border-[#334155] px-5 py-4">
          <div className="flex gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
              placeholder="感兴趣的方向（可选），如：美股财报、AI 芯片、宏观策略"
              className="flex-1 rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm outline-none placeholder:text-[#475569] focus:border-[#a78bfa]"
            />
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50"
            >
              <Sparkles className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
              {loading ? "发现中…" : "生成推荐"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#64748b]">
            基于现有订阅、阅读分类和近期文章生成推荐，并自动验证每个地址可访问后才会标记为可用。
            全程约 1-2 分钟，需要在 .env 中配置 LLM。
          </p>
          {error && <div className="mt-3 text-sm leading-relaxed text-[#f87171]">{error}</div>}
        </div>

        {/* 推荐列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-[#94a3b8]">
              <Sparkles className="h-8 w-8 animate-pulse text-[#a78bfa]" />
              模型正在结合你的订阅生成推荐，并逐个验证地址…
            </div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="py-6 text-center text-sm text-[#64748b]">输入方向后点击「生成推荐」</div>
          )}
          {!loading &&
            suggestions.map((s, idx) => {
              const meta = STATUS_META[s.status] ?? STATUS_META.invalid;
              const added = addedUrls.includes(s.url);
              return (
                <div key={s.url || `suggestion-${idx}`} className="mb-3 rounded-lg border border-[#334155]/70 bg-[#0f172a] p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {s.verified_title || s.title || s.url}
                    </span>
                    <span className={cn("flex shrink-0 items-center gap-1 text-[11px]", meta.className)}>
                      {s.status === "valid" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
                      {meta.label}
                    </span>
                    {s.status === "valid" && !added && (
                      <button
                        onClick={() => addOne(s)}
                        disabled={addingUrl === s.url}
                        className="flex shrink-0 items-center gap-1 rounded-md bg-[#3b82f6] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" />
                        {addingUrl === s.url ? "添加中" : "添加"}
                      </button>
                    )}
                    {added && <span className="shrink-0 text-[11px] text-[#34d399]">已添加</span>}
                  </div>
                  {s.reason && <div className="mb-1 text-xs text-[#94a3b8]">{s.reason}</div>}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#64748b]">
                    {s.category && (
                      <span className="rounded bg-[#1e293b] px-1.5 py-0.5 text-[#a78bfa]">{s.category}</span>
                    )}
                    {s.status === "valid" && s.entry_count > 0 && <span>当前 {s.entry_count} 篇文章</span>}
                    {s.error && <span className="text-[#f87171]" title={s.error}>验证失败：{s.error.slice(0, 60)}</span>}
                    <span className="truncate" title={s.url}>{s.url}</span>
                  </div>
                </div>
              );
            })}
        </div>

        {/* 底部操作 */}
        {validLeft > 0 && !loading && (
          <div className="border-t border-[#334155] px-5 py-3">
            <button
              onClick={addAllValid}
              disabled={addingUrl !== ""}
              className="w-full rounded-lg border border-[#7c3aed] py-2 text-sm text-[#c4b5fd] hover:bg-[#7c3aed]/10 disabled:opacity-50"
            >
              一键添加全部可用源（{validLeft} 个）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
