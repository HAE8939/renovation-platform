/**
 * /api/client-errors —— 浏览器侧渲染错误转存服务端（M10-a 备料一）
 *
 * 为什么要有它：Next 生产构建把 RSC 渲染错误详情隐去、只给页面一个「错误编号 digest」，
 * 而详情落在服务端 stdout——本机 `next start` 没人盯着 stdout，等于现场丢了。
 * 前端 error.tsx 拿到 digest 后 POST 到这里，digest 与详情就能在同一份 JSONL 里对上。
 *
 * 薄：只收 body、转 telemetry，不查库、不鉴权（错误上报本身不该再产生权限分支）。
 */
import { NextResponse } from "next/server";
import { logClientError } from "@/core/domain/telemetry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 2000) : undefined);
  logClientError({
    digest: str(body.digest),
    message: str(body.message),
    path: str(body.path),
    stack: str(body.stack),
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
