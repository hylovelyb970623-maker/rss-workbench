// 与后端接口对应的数据类型

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  feed_count?: number;
  unread_count?: number;
}

export interface Feed {
  id: number;
  title: string;
  url: string;
  site_url: string;
  description: string;
  category_id: number | null;
  category_name: string;
  is_rsshub: boolean;
  fetch_interval_minutes: number | null;
  paused: boolean;
  last_fetched_at: string | null;
  last_error: string;
  error_count: number;
  unread_count: number;
  total_count: number;
}

export interface Article {
  id: number;
  feed_id: number;
  feed_title: string;
  title: string;
  url: string;
  author: string;
  summary: string;
  content: string;
  keyword_category: string;
  ai_summary: string;
  ai_tags: string[];
  ai_status: "none" | "pending" | "done" | "failed";
  published_at: string | null;
  is_read: boolean;
  is_starred: boolean;
}

export interface ArticleListResponse {
  total: number;
  items: Article[];
}

export interface DashboardStats {
  totals: {
    articles: number;
    unread: number;
    starred: number;
    feeds: number;
    paused_feeds: number;
    categories: number;
    today_new: number;
    read_ratio: number;
  };
  daily: { date: string; total: number; read: number }[];
  keyword_distribution: { key: string; label: string; count: number }[];
  feed_unread_rank: { title: string; unread: number }[];
}

export interface MetaInfo {
  rsshub_configured: boolean;
  rsshub_base: string;
  freshrss_configured: boolean;
  llm_configured: boolean;
  llm_model: string;
  scheduler_enabled: boolean;
  fetch_interval_minutes: number;
  retention_days: number;
  auth_required: boolean;
}

export interface AuthStatus {
  auth_required: boolean;
}

export interface OpmlImportResult {
  categories: number;
  feeds: number;
  skipped: number;
}

export interface DiscoverSuggestion {
  title: string;
  url: string;
  reason: string;
  category: string;
  status: "valid" | "invalid" | "duplicate";
  verified_title: string;
  site_url: string;
  entry_count: number;
  sample_title: string;
  error: string;
}

export interface DiscoverResponse {
  suggestions: DiscoverSuggestion[];
  valid_count: number;
  topic: string;
}

// 关键词分类的展示样式
export const KEYWORD_CATEGORY_META: Record<string, { label: string; color: string }> = {
  company_earnings: { label: "公司财报", color: "#fbbf24" },
  macro_policy: { label: "宏观政策", color: "#38bdf8" },
  ai_tech: { label: "AI/科技", color: "#a78bfa" },
  capital: { label: "资本动向", color: "#34d399" },
  market_hotspot: { label: "市场热点", color: "#fb7185" },
  industry: { label: "行业动态", color: "#fb923c" },
  global_market: { label: "全球市场", color: "#60a5fa" },
  risk_alert: { label: "风险预警", color: "#f87171" },
  market: { label: "市场综合", color: "#94a3b8" },
};

export function keywordCategoryMeta(key: string): { label: string; color: string } {
  return KEYWORD_CATEGORY_META[key] ?? { label: key, color: "#94a3b8" };
}
