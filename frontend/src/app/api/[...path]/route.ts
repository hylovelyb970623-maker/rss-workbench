import { NextRequest, NextResponse } from "next/server";

// 开发环境把 /api/* 代理到后端（生产由 nginx 直接转发）
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
]);

async function proxy(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname.replace(/^\/api/, "");
  const url = `${BACKEND_URL}/api${path}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== "host" && !HOP_BY_HOP.has(lower)) headers.set(key, value);
  });

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, {
        method: req.method,
        headers,
        body: body ? Buffer.from(body) : undefined,
        redirect: "manual",
      });
      const respHeaders = new Headers();
      resp.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower !== "content-encoding" && !HOP_BY_HOP.has(lower)) respHeaders.set(key, value);
      });
      return new NextResponse(resp.body, { status: resp.status, headers: respHeaders });
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  console.error(`[代理] ${req.method} ${path} 失败:`, lastError);
  return NextResponse.json({ detail: "后端服务暂不可用" }, { status: 502 });
}

export async function GET(req: NextRequest) {
  return proxy(req);
}
export async function POST(req: NextRequest) {
  return proxy(req);
}
export async function PUT(req: NextRequest) {
  return proxy(req);
}
export async function PATCH(req: NextRequest) {
  return proxy(req);
}
export async function DELETE(req: NextRequest) {
  return proxy(req);
}
