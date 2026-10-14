/**
 * /api/health —— 存活探针（M13-c）
 *
 * 存在的理由有两个：
 * ① compose 的 healthcheck 原先打 /api/notifications，每次 30 秒跑一遍全站聚合查询，
 *    只为证明进程活着却给 SQLite 加了真实读负载；这里不查库、不聚合。
 * ② 访问闸（middleware）默认拦全站，探针若走业务路径会在开启 PLATFORM_GATE 后被 401，
 *    容器直接进入 unhealthy 重启循环。健康端点必须在 accessGate.isPublicPath 的放行名单里。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, at: new Date().toISOString() });
}
