"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderPlus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddFeedDialog } from "@/components/AddFeedDialog";
import { api, opmlExportUrl } from "@/lib/api";
import { formatDateTime, truncate } from "@/lib/utils";
import type { Category, Feed, MetaInfo } from "@/types/rss";

export default function SettingsPage() {
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [message, setMessage] = useState("");
  const [busyFeedId, setBusyFeedId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      const [m, f, c] = await Promise.all([api.getMeta(), api.getFeeds(), api.getCategories()]);
      setMeta(m);
      setFeeds(f);
      setCategories(c);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "加载失败");
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const updateFeed = async (id: number, data: Partial<Feed>) => {
    try {
      await api.updateFeed(id, data);
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "保存失败");
    }
  };

  const refreshFeed = async (id: number) => {
    setBusyFeedId(id);
    try {
      const res = await api.refreshFeed(id);
      flash(`已刷新，新增 ${res.new} 篇`);
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setBusyFeedId(null);
    }
  };

  const deleteFeed = async (feed: Feed) => {
    if (!window.confirm(`删除订阅「${feed.title}」？其下所有文章也会删除。`)) return;
    try {
      await api.deleteFeed(feed.id);
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "删除失败");
    }
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      await api.createCategory(name);
      setNewCategory("");
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "添加失败");
    }
  };

  const deleteCategory = async (cat: Category) => {
    if (!window.confirm(`删除分类「${cat.name}」？其中的订阅源会变为未分类。`)) return;
    try {
      await api.deleteCategory(cat.id);
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "删除失败");
    }
  };

  const importOpml = async (file: File) => {
    try {
      const res = await api.importOpml(file);
      flash(`导入完成：新增 ${res.feeds} 个订阅、${res.categories} 个分类，跳过 ${res.skipped} 个重复`);
      await reload();
    } catch (e) {
      flash(e instanceof Error ? e.message : "导入失败");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 pb-16 md:p-6 md:pb-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-[#3b82f6]" />
          <h1 className="text-lg font-semibold">设置</h1>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563eb]"
        >
          <Plus className="h-3.5 w-3.5" />
          添加订阅
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-[#3b82f6]/40 bg-[#3b82f6]/10 px-3 py-2 text-xs text-[#93c5fd]">
          {message}
        </div>
      )}

      {/* 数据源状态 */}
      {meta && (
        <section className="mb-6 rounded-xl border border-[#334155] bg-[#1e293b] p-4">
          <h2 className="mb-3 text-sm font-medium">数据源与功能状态</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <StatusItem
              ok={meta.freshrss_configured}
              label="FreshRSS 预置源"
              okText="已配置（首次启动自动预置分类源）"
              badText="未配置 FRESHRSS_BASE/USER/TOKEN"
            />
            <StatusItem
              ok={meta.rsshub_configured}
              label={`RSSHub${meta.rsshub_base ? ` (${truncate(meta.rsshub_base, 40)})` : ""}`}
              okText="已配置，支持 rsshub:路由 简写"
              badText="未配置 RSSHUB_BASE"
            />
            <StatusItem
              ok={meta.llm_configured}
              label={`AI 摘要${meta.llm_model ? ` (${meta.llm_model})` : ""}`}
              okText="已配置，可生成文章摘要"
              badText="未配置 LLM_API_KEY/BASE_URL/MODEL"
            />
            <StatusItem
              ok={meta.scheduler_enabled}
              label={`定时抓取（每 ${meta.fetch_interval_minutes} 分钟）`}
              okText={`运行中，文章保留 ${meta.retention_days} 天（星标豁免）`}
              badText="已关闭"
            />
          </div>
        </section>
      )}

      {/* 订阅源管理 */}
      <section className="mb-6 rounded-xl border border-[#334155] bg-[#1e293b] p-4">
        <h2 className="mb-3 text-sm font-medium">订阅源（{feeds.length}）</h2>
        <div className="space-y-2">
          {feeds.map((feed) => (
            <div key={feed.id} className="rounded-lg border border-[#334155]/60 bg-[#0f172a] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={feed.url}>
                  {feed.title}
                  {feed.is_rsshub && (
                    <span className="ml-2 rounded bg-[#fbbf24]/15 px-1.5 py-0.5 text-[10px] text-[#fbbf24]">RSSHub</span>
                  )}
                </span>
                {feed.error_count > 0 && feed.last_error && (
                  <span className="flex items-center gap-1 text-[11px] text-[#f87171]" title={feed.last_error}>
                    <AlertTriangle className="h-3 w-3" />
                    抓取异常
                  </span>
                )}
                <button
                  onClick={() => updateFeed(feed.id, { paused: !feed.paused })}
                  title={feed.paused ? "恢复抓取" : "暂停抓取"}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
                >
                  {feed.paused ? <Play className="h-3.5 w-3.5 text-[#f59e0b]" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => refreshFeed(feed.id)}
                  disabled={busyFeedId === feed.id}
                  title="立即刷新"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#94a3b8] hover:bg-[#1e293b] hover:text-white disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busyFeedId === feed.id ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => deleteFeed(feed)}
                  title="删除"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#94a3b8] hover:bg-[#1e293b] hover:text-[#f87171]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 truncate text-[11px] text-[#64748b]" title={feed.url}>
                {feed.url}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#64748b]">
                <select
                  value={feed.category_id ?? ""}
                  onChange={(e) => updateFeed(feed.id, { category_id: e.target.value ? Number(e.target.value) : null })}
                  className="rounded-md border border-[#334155] bg-[#131c31] px-2 py-1 text-[11px] text-[#cbd5e1] outline-none"
                >
                  <option value="">未分类</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <input
                  defaultValue={feed.fetch_interval_minutes ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    updateFeed(feed.id, { fetch_interval_minutes: v ? Number(v) : null });
                  }}
                  placeholder="默认间隔"
                  className="w-24 rounded-md border border-[#334155] bg-[#131c31] px-2 py-1 text-[11px] text-[#cbd5e1] outline-none"
                  title="抓取间隔（分钟），留空用全局默认"
                />
                <span>
                  {feed.total_count} 篇 · 未读 {feed.unread_count}
                  {feed.last_fetched_at ? ` · 上次抓取 ${formatDateTime(feed.last_fetched_at)}` : " · 未抓取"}
                </span>
              </div>
            </div>
          ))}
          {feeds.length === 0 && <div className="py-6 text-center text-xs text-[#64748b]">还没有订阅源</div>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 分类管理 */}
        <section className="rounded-xl border border-[#334155] bg-[#1e293b] p-4">
          <h2 className="mb-3 text-sm font-medium">分类（{categories.length}）</h2>
          <div className="mb-3 flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="新分类名称"
              className="flex-1 rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-1.5 text-xs outline-none placeholder:text-[#475569] focus:border-[#3b82f6]"
            />
            <button
              onClick={addCategory}
              className="flex items-center gap-1 rounded-lg border border-[#334155] px-3 py-1.5 text-xs text-[#94a3b8] hover:text-white"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              添加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat.id}
                className="flex items-center gap-1.5 rounded-full border border-[#334155] bg-[#0f172a] px-3 py-1 text-xs text-[#cbd5e1]"
              >
                {cat.name}
                <span className="text-[10px] text-[#64748b]">{cat.feed_count ?? 0}</span>
                <button onClick={() => deleteCategory(cat)} className="text-[#64748b] hover:text-[#f87171]">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {categories.length === 0 && <div className="text-xs text-[#64748b]">暂无分类</div>}
          </div>
        </section>

        {/* OPML */}
        <section className="rounded-xl border border-[#334155] bg-[#1e293b] p-4">
          <h2 className="mb-3 text-sm font-medium">OPML 导入导出</h2>
          <p className="mb-3 text-xs leading-relaxed text-[#64748b]">
            与 FreshRSS / Miniflux / Feedly 等阅读器互通订阅列表
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#334155] px-3 py-2 text-xs text-[#94a3b8] hover:border-[#3b82f6] hover:text-[#60a5fa]"
            >
              <Upload className="h-3.5 w-3.5" />
              导入 OPML
            </button>
            <a
              href={opmlExportUrl()}
              download
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#334155] px-3 py-2 text-xs text-[#94a3b8] hover:border-[#3b82f6] hover:text-[#60a5fa]"
            >
              <Download className="h-3.5 w-3.5" />
              导出 OPML
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".opml,.xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importOpml(file);
                e.target.value = "";
              }}
            />
          </div>
        </section>
      </div>

      <AddFeedDialog
        open={addOpen}
        categories={categories}
        onClose={() => setAddOpen(false)}
        onCreated={() => reload()}
      />
    </div>
  );
}

function StatusItem({ ok, label, okText, badText }: { ok: boolean; label: string; okText: string; badText: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#334155]/60 bg-[#0f172a] px-3 py-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#34d399]" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#64748b]" />
      )}
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-[#cbd5e1]">{label}</div>
        <div className="truncate text-[11px] text-[#64748b]">{ok ? okText : badText}</div>
      </div>
    </div>
  );
}
