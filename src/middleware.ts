/**
 * middleware.ts —— 内测期最小访问保护的应用层闸（M13-c）
 *
 * 定位：这是**深度防御的第二层**，第一层是 Caddy 的 basic auth。
 * 平时请求经 Caddy 进来时已带 X-Platform-User，这里只做存在性校验；
 * 一旦有人把 compose 的 ports 改回 "3000:3000" 绕过反代直连，这层会直接把全站业务路径
 * 挡成 401，而不是让 HR 与财务数据裸奔。两层口径见 core/domain/accessGate.ts 顶部注释。
 *
 * 开关：PLATFORM_GATE=on 才生效。本机 `pnpm dev` 默认不开，不打断开发。
 * 不设开关会让"忘了开＝没保护"，但也保证"开了就是真拦"——取后者，
 * 并在启动日志里对未开启状态留一条显式告警（见下 gateWarnOnce）。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  GATE_USER_HEADER,
  gateEnabled,
  needsGate,
  readGateUser,
} from "@/core/domain/accessGate";

const DENY_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>需要访问口令</title>
<style>
html,body{margin:0;background:#F4F1EA;color:#23201C;font-family:system-ui,"Microsoft YaHei",sans-serif}
main{max-width:32em;margin:18vh auto 0;padding:0 24px}
h1{font-size:17px;font-weight:600;margin:0 0 12px}
p{font-size:13px;line-height:1.7;color:#5A544C;margin:0 0 8px}
code{font-size:12px;background:#EAE6DE;padding:2px 6px;border-radius:2px}
</style></head><body><main>
<h1>需要访问口令</h1>
<p>本平台含经营与人事数据，须经反向代理的口令入口访问。</p>
<p>请从部署说明里的地址进入，或在浏览器地址栏直接访问后输入账号口令。</p>
<p>若你确信自己是经反代进来的，说明代理未注入 <code>x-platform-user</code>，请检查 Caddyfile 的 <code>header_up</code> 配置。</p>
</main></body></html>`;

let warned = false;

export function middleware(req: NextRequest) {
  // 未开启闸＝整站内网裸奔，留一次显式告警，别让它成为静默的默认态
  if (!gateEnabled()) {
    if (!warned) {
      warned = true;
      console.warn(
        "[accessGate] PLATFORM_GATE 未置为 on —— 当前无应用层访问保护，任何可达 3000 端口的人都能读写经营与人事数据。内网部署必须经 Caddy 口令入口，或显式设 PLATFORM_GATE=on。"
      );
    }
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  if (!needsGate(pathname)) return NextResponse.next();

  if (readGateUser(req.headers.get(GATE_USER_HEADER))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "unauthorized", hint: "须经反代口令入口访问" },
      { status: 401 }
    );
  }
  return new NextResponse(DENY_HTML, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const config = {
  // 排除 Next 静态产物；其余全进闸（公开路径由 needsGate 单点判定）
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
