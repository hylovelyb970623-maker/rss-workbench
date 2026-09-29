import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { LoginGate } from "@/components/LoginGate";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "RSS 工作台",
  description: "自托管 RSS 阅读器与资讯仪表盘",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <LoginGate>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </LoginGate>
        </AuthProvider>
      </body>
    </html>
  );
}
