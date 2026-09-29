"use client";

import { BarChart3, Newspaper, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useIsMobile";

const NAV_ITEMS = [
  { href: "/", label: "阅读", icon: Newspaper },
  { href: "/dashboard", label: "仪表盘", icon: BarChart3 },
  { href: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  if (isMobile) {
    // 移动端：底部标签栏
    return (
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#334155] bg-[#1e293b] pb-safe">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px]",
                active ? "text-[#60a5fa]" : "text-[#94a3b8]"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  // 桌面端：左侧图标导航栏
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[#334155] bg-[#131c31] py-4">
      <Link href="/" className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-[#3b82f6]" title="RSS 工作台">
        <Newspaper className="h-5 w-5 text-white" />
      </Link>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              active ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:bg-[#1e293b] hover:text-white"
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </nav>
  );
}
