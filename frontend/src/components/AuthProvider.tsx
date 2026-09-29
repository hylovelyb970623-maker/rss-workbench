"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";

type AuthState = "loading" | "login" | "ready";

interface AuthContextValue {
  state: AuthState;
  login: (password: string) => Promise<void>;
  logout: () => void;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  state: "loading",
  login: async () => {},
  logout: () => {},
  retry: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.getAuthStatus();
        if (cancelled) return;
        if (!status.auth_required) {
          setState("ready");
          return;
        }
        if (getToken()) {
          const check = await api.checkToken();
          if (cancelled) return;
          setState(check.ok ? "ready" : "login");
        } else {
          setState("login");
        }
      } catch {
        // 后端不可达时也先展示登录页（附带重试入口），避免白屏
        if (!cancelled) setState("login");
      }
    })();

    const onExpired = () => setState("login");
    window.addEventListener("rss:auth-expired", onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener("rss:auth-expired", onExpired);
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState("loading");
    setAttempt((a) => a + 1);
  }, []);

  const login = useCallback(async (password: string) => {
    const res = await api.login(password);
    if (res.token) localStorage.setItem("rss_token", res.token);
    setState("ready");
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("rss_token");
    setState("login");
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, logout, retry }}>{children}</AuthContext.Provider>
  );
}
