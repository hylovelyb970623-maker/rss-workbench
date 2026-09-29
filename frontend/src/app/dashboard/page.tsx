"use client";

import { BarChart3, FileText, Inbox, Percent, Rss, Star } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { keywordCategoryMeta, type DashboardStats } from "@/types/rss";

const PIE_COLORS = ["#3b82f6", "#a78bfa", "#fbbf24", "#34d399", "#fb7185", "#38bdf8", "#fb923c", "#f87171", "#94a3b8"];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <div className="p-8 text-sm text-[#f87171]">加载失败: {error}</div>;
  }
  if (!stats) {
    return <div className="p-8 text-sm text-[#64748b]">加载中…</div>;
  }

  const { totals } = stats;
  const cards = [
    { label: "订阅源", value: totals.feeds, sub: `${totals.paused_feeds} 个已暂停`, icon: Rss, color: "#3b82f6" },
    { label: "未读文章", value: totals.unread, sub: `共 ${totals.articles} 篇`, icon: Inbox, color: "#fbbf24" },
    { label: "今日新文", value: totals.today_new, sub: `${totals.categories} 个分类`, icon: FileText, color: "#34d399" },
    { label: "已读比例", value: `${Math.round(totals.read_ratio * 100)}%`, sub: `${totals.starred} 篇星标`, icon: Percent, color: "#a78bfa" },
  ];

  const daily = stats.daily.map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }));

  return (
    <div className="h-full overflow-y-auto p-4 pb-16 md:p-6 md:pb-6">
      <div className="mb-5 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[#3b82f6]" />
        <h1 className="text-lg font-semibold">仪表盘</h1>
      </div>

      {/* 指标卡片 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-[#334155] bg-[#1e293b] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-[#94a3b8]">{label}</span>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div className="text-2xl font-semibold" style={{ color }}>
              {value}
            </div>
            <div className="mt-1 text-[11px] text-[#64748b]">{sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 每日发文量 */}
        <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-4 lg:col-span-3">
          <h2 className="mb-3 text-sm font-medium">近 14 天发文与已读</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#334155" }} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#f1f5f9" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" name="发文" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="read" name="已读" fill="#34d399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 分类分布 */}
        <div className="rounded-xl border border-[#334155] bg-[#1e293b] p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">关键词分类分布</h2>
          {stats.keyword_distribution.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-[#64748b]">暂无数据</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.keyword_distribution}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {stats.keyword_distribution.map((entry, i) => (
                      <Cell key={entry.key} fill={keywordCategoryMeta(entry.key).color || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 各源未读排行 */}
      <div className="mt-4 rounded-xl border border-[#334155] bg-[#1e293b] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Star className="h-4 w-4 text-[#fbbf24]" />
          <h2 className="text-sm font-medium">各订阅源未读排行</h2>
        </div>
        {stats.feed_unread_rank.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#64748b">全部读完啦</div>
        ) : (
          <div className="space-y-2">
            {stats.feed_unread_rank.map((item, i) => {
              const max = stats.feed_unread_rank[0].unread || 1;
              return (
                <div key={item.title} className="flex items-center gap-3 text-xs">
                  <span className="w-4 shrink-0 text-right text-[#64748b]">{i + 1}</span>
                  <span className="w-40 shrink-0 truncate text-[#cbd5e1] md:w-56" title={item.title}>
                    {item.title}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#0f172a]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa]"
                      style={{ width: `${(item.unread / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-medium text-[#fbbf24]">{item.unread}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
