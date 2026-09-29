"use client";

import { Rss } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { state, login, retry } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f172a]">
        <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
          <Rss className="h-8 w-8 animate-pulse text-[#3b82f6]" />
          <div className="text-sm">加载中…</div>
        </div>
      </div>
    );
  }

  if (state === "login") {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);
      try {
        await login(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : "登录失败");
      } finally {
        setLoading(false);
      }
    };
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f172a] px-4">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-xl border border-[#334155] bg-[#1e293b] p-8 shadow-xl"
        >
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#3b82f6]">
              <Rss className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-lg font-semibold">RSS 工作台</h1>
            <p className="text-sm text-[#94a3b8]">请输入访问密码</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoFocus
            className="mb-4 w-full rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2.5 text-sm outline-none focus:border-[#3b82f6]"
          />
          {error && <div className="mb-3 text-sm text-[#f87171]">{error}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-[#3b82f6] py-2.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
          >
            {loading ? "登录中…" : "登录"}
          </button>
          <button
            type="button"
            onClick={retry}
            className="mt-3 w-full text-center text-xs text-[#64748b] hover:text-[#94a3b8]"
          >
            后端连不上？点此重试
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
