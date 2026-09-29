"use client";

import { keywordCategoryMeta } from "@/types/rss";

export function CategoryChip({ category, size = "sm" }: { category: string; size?: "sm" | "md" }) {
  const meta = keywordCategoryMeta(category);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
      style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}
    >
      {meta.label}
    </span>
  );
}
