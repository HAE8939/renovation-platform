/**
 * /api/notifications —— 通知中心按需取数（M10-a UI-12）
 * 薄：只调 dashboard 模块服务并转 JSON。铃铛每页都挂在顶栏，故不在服务端渲染时预取，
 * 由客户端首次点开才请求（省掉全站一次的聚合查询）。
 */
import { NextResponse } from "next/server";
import { getNotificationSummary } from "@/modules/dashboard/server/notifications";
import { logAppError } from "@/core/domain/telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await getNotificationSummary();
    return NextResponse.json(summary);
  } catch (e) {
    logAppError("[notificationsApi]", e);
    // 通知取数失败不该在铃铛里弹红字：给空态，让页面照常可用。
    return NextResponse.json({ total: 0, groups: [], at: new Date().toISOString(), error: "暂不可用" });
  }
}
