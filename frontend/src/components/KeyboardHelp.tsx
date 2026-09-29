"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: "j / ↓", desc: "下一篇" },
  { keys: "k / ↑", desc: "上一篇" },
  { keys: "o", desc: "打开原文" },
  { keys: "s", desc: "星标 / 取消星标" },
  { keys: "m", desc: "切换已读状态" },
  { keys: "Shift + A", desc: "当前列表全部已读" },
  { keys: "r", desc: "刷新全部订阅源" },
  { keys: "/", desc: "聚焦搜索框" },
  { keys: "Esc", desc: "关闭弹窗" },
];

export function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-[#334155] bg-[#1e293b] p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">键盘快捷键</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={keys} className="flex items-center justify-between text-sm">
              <span className="text-[#94a3b8]">{desc}</span>
              <kbd className="rounded-md border border-[#475569] bg-[#0f172a] px-2 py-0.5 font-mono text-xs text-[#cbd5e1]">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
