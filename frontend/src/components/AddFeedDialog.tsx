"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Category, Feed } from "@/types/rss";

interface AddFeedDialogProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onCreated: (feed: Feed) => void;
}

export function AddFeedDialog({ open, categories, onClose, onCreated }: AddFeedDialogProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [interval, setInterval] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setUrl("");
      setTitle("");
      setCategoryId("");
      setInterval("");
      setError("");
      setLoading(false);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!url.trim()) {
      setError("请输入订阅地址");
      return;
    }
    setLoading(true);
    try {
      const feed = await api.createFeed({
        url: url.trim(),
        title: title.trim() || undefined,
        category_id: categoryId ? Number(categoryId) : null,
        fetch_interval_minutes: interval ? Number(interval) : null,
      });
      onCreated(feed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-[#334155] bg-[#1e293b] p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">添加订阅源</h2>
          <button type="button" onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1.5 block text-xs text-[#94a3b8]">订阅地址 *</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/feed.xml 或 rsshub:wallstreetcn/hot"
          autoFocus
          className="mb-1 w-full rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm outline-none placeholder:text-[#475569] focus:border-[#3b82f6]"
        />
        <p className="mb-3 text-[11px] leading-relaxed text-[#64748b]">
          支持 RSS/Atom 地址；普通网页地址会自动发现订阅链接；配置了 RSSHub 时可用 rsshub:路由 简写
        </p>

        <label className="mb-1.5 block text-xs text-[#94a3b8]">名称（留空自动获取）</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：华尔街见闻"
          className="mb-3 w-full rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm outline-none placeholder:text-[#475569] focus:border-[#3b82f6]"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs text-[#94a3b8]">分类</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm outline-none focus:border-[#3b82f6]"
            >
              <option value="">未分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[#94a3b8]">抓取间隔（分钟）</label>
            <input
              value={interval}
              onChange={(e) => setInterval(e.target.value.replace(/\D/g, ""))}
              placeholder="默认全局间隔"
              className="w-full rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm outline-none placeholder:text-[#475569] focus:border-[#3b82f6]"
            />
          </div>
        </div>

        {error && <div className="mb-3 text-sm text-[#f87171]">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#334155] px-4 py-2 text-sm text-[#94a3b8] hover:text-white"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
          >
            {loading ? "添加中…" : "添加"}
          </button>
        </div>
      </form>
    </div>
  );
}
