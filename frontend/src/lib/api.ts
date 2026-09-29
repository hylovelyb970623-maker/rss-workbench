// 统一的 API 封装：原生 fetch + Bearer token + 401 全局登出
import type {
  Article,
  ArticleListResponse,
  AuthStatus,
  Category,
  DashboardStats,
  DiscoverResponse,
  Feed,
  MetaInfo,
  OpmlImportResult,
} from "@/types/rss";

const BASE = "/api";
const TOKEN_KEY = "rss_token";

export class AuthExpiredError extends Error {
  constructor() {
    super("登录已过期");
    this.name = "AuthExpiredError";
  }
}

function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new CustomEvent("rss:auth-expired"));
}

async function fetchJSON<T>(url: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60000);
  try {
    const res = await fetch(`${BASE}${url}`, { ...options, headers, signal: controller.signal });
    if (res.status === 401) {
      handleUnauthorized();
      throw new AuthExpiredError();
    }
    if (!res.ok) {
      let detail = `请求失败 (${res.status})`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
      } catch {
        /* 忽略解析失败 */
      }
      throw new Error(detail);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function opmlExportUrl(): string {
  const token = getToken();
  return `${BASE}/opml/export${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export const api = {
  // ----- 认证 -----
  getAuthStatus: () => fetchJSON<AuthStatus>("/auth/status"),
  checkToken: () =>
    fetchJSON<{ ok: boolean }>("/auth/check", { timeoutMs: 10000 }).catch((e) => {
      if (e instanceof AuthExpiredError) return { ok: false };
      throw e;
    }),
  login: (password: string) =>
    fetchJSON<{ token: string; expires_at: number }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // ----- 订阅源 -----
  getFeeds: () => fetchJSON<Feed[]>("/feeds"),
  createFeed: (data: { url: string; title?: string; category_id?: number | null; fetch_interval_minutes?: number | null }) =>
    fetchJSON<Feed>("/feeds", { method: "POST", body: JSON.stringify(data), timeoutMs: 120000 }),
  updateFeed: (id: number, data: Partial<Pick<Feed, "title" | "category_id" | "fetch_interval_minutes" | "paused">>) =>
    fetchJSON<Feed>(`/feeds/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFeed: (id: number) => fetchJSON<{ deleted: number }>(`/feeds/${id}`, { method: "DELETE" }),
  refreshFeed: (id: number) =>
    fetchJSON<{ feed_id: number; new: number }>(`/feeds/${id}/refresh`, { method: "POST", timeoutMs: 120000 }),
  refreshAllFeeds: () =>
    fetchJSON<{ refreshed: number; new_articles: number; errors: number }>("/feeds/refresh-all", {
      method: "POST",
      timeoutMs: 300000,
    }),

  // ----- 分类 -----
  getCategories: () => fetchJSON<Category[]>("/categories"),
  createCategory: (name: string) =>
    fetchJSON<Category>("/categories", { method: "POST", body: JSON.stringify({ name }) }),
  updateCategory: (id: number, name: string) =>
    fetchJSON<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteCategory: (id: number) => fetchJSON<{ deleted: number }>(`/categories/${id}`, { method: "DELETE" }),

  // ----- 文章 -----
  getArticles: (params: {
    feed_id?: number;
    category_id?: number;
    keyword_category?: string;
    status?: "all" | "unread" | "starred";
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const search = new URLSearchParams();
    if (params.feed_id) search.set("feed_id", String(params.feed_id));
    if (params.category_id) search.set("category_id", String(params.category_id));
    if (params.keyword_category) search.set("keyword_category", params.keyword_category);
    if (params.status && params.status !== "all") search.set("status", params.status);
    if (params.q) search.set("q", params.q);
    search.set("limit", String(params.limit ?? 50));
    search.set("offset", String(params.offset ?? 0));
    return fetchJSON<ArticleListResponse>(`/articles?${search.toString()}`);
  },
  getArticle: (id: number) => fetchJSON<Article>(`/articles/${id}`),
  updateArticle: (id: number, data: { is_read?: boolean; is_starred?: boolean }) =>
    fetchJSON<Article>(`/articles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  markAllRead: (data: { feed_id?: number; category_id?: number } = {}) =>
    fetchJSON<{ marked: number }>("/articles/mark-all-read", { method: "POST", body: JSON.stringify(data) }),
  summarizeArticle: (id: number) =>
    fetchJSON<{ ai_summary: string; ai_tags: string[] }>(`/articles/${id}/summarize`, {
      method: "POST",
      timeoutMs: 120000,
    }),

  // ----- 搜索 / 统计 / 元信息 -----
  searchArticles: (q: string, limit = 50) =>
    fetchJSON<ArticleListResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getStats: () => fetchJSON<DashboardStats>("/stats"),
  getMeta: () => fetchJSON<MetaInfo>("/meta"),

  // ----- AI 发现 -----
  suggestFeeds: (topic: string = "", count = 6) =>
    fetchJSON<DiscoverResponse>("/discover/suggest", {
      method: "POST",
      body: JSON.stringify({ topic, count }),
      timeoutMs: 300000,
    }),

  // ----- OPML -----
  importOpml: async (file: File): Promise<OpmlImportResult> => {
    const form = new FormData();
    form.append("file", file);
    const headers: Record<string, string> = {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}/opml/import`, { method: "POST", body: form, headers });
    if (res.status === 401) {
      handleUnauthorized();
      throw new AuthExpiredError();
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.detail ?? `导入失败 (${res.status})`);
    }
    return res.json();
  },
};
