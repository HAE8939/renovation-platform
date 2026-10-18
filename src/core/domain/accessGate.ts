/**
 * accessGate.ts —— 内测期最小访问保护的口径单点（M13-c）
 *
 * 为什么走反代口令而不是平台内登录：契约 §7 明写“不在第一个模块阶段做重型权限中台”，
 * 而平台即将交给内部员工真实使用，零鉴权已从零成本留位变成现实风险
 * （docs/DEPLOYMENT_INTERNAL_AND_CLOUD.md 自己就要求"正式内测前需补最小访问保护"）。
 * 所以这里只做一道闸，不建会话、不建角色体系、不碰 P4 的 RBAC 计划。
 *
 * 信任边界（关键，改动前先读）：
 * 应用只绑 127.0.0.1（见 compose.internal.yml 的 ports），外部**无法直连 3000**，
 * 唯一入口是 Caddy；Caddy 在 basic auth 之后用 `header_up` **覆盖**同名请求头
 * （Set 语义，非追加），所以客户端自带的 X-Platform-User 进不来。
 * 一旦有人把 ports 改回 "3000:3000" 绕过反代直连，这套身份就等同无保护——
 * 这条不变量由 compose 与下面的 gateEnabled 说明共同守护，勿单独放宽任一处。
 */

/** 反代在 basic auth 通过后注入的操作人头名。值＝通过认证的用户名。 */
export const GATE_USER_HEADER = "x-platform-user";

/** 开关：仅当显式置为 "on" 时启用应用层闸。本机 dev 默认关，不打断开发。 */
const GATE_ENV = "PLATFORM_GATE";

/** 应用层闸是否生效。 */
export function gateEnabled(): boolean {
  return process.env[GATE_ENV] === "on";
}

/**
 * 受保护路径判定。默认**整站都保护**，只放行下列公开项——
 * 因为经营数据没有"不敏感的那一页"：驾驶舱有毛利、项目中心有合同额、预算有报价。
 * 只挑 /hr 与 /finance 上闸会给人虚假的安全感。
 */
export function isPublicPath(pathname: string): boolean {
  // /about 是公开“门面页”：只放不敏感的定位介绍 + 指向 /docs。完整文档站 /docs/* 含内部经营口径，
  // 刻意不进白名单 → 随全站受口令保护。/docs 不公开，故 /about 也不直连 /docs 的正文，只做引路。
  if (pathname === "/" || pathname === "/about") return true;
  // 错误上报必须可达，否则 app/error.tsx 的 digest 反查链路会被自己的闸掐断
  if (pathname.startsWith("/api/client-errors")) return true;
  if (pathname.startsWith("/api/health")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/uploads/")) return true; // 已按 uuid 命名，非枚举；登录不在此层
  return false;
}

/** 需要闸拦的路径 = 非公开。拆成函数便于中间件与测试共用同一判定。 */
export function needsGate(pathname: string): boolean {
  return !isPublicPath(pathname);
}

/** 从请求头里取反代认证过的用户名；未认证（缺失/空）返回 null。 */
export function readGateUser(headerValue: string | null | undefined): string | null {
  const name = (headerValue ?? "").trim();
  return name === "" ? null : name;
}
