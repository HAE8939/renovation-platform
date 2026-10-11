import type { ModuleManifest } from "../types";

/**
 * 数据驾驶舱（M9-b）：只读聚合首页。
 *
 * - order 0 排最前：现有模块 order 最小为 crm 的 2，驾驶舱作为聚合首页
 *   置于导航与平台首页第一位。
 * - 不给 nav：manifest.nav 是全局静态清单，拿不到 projectId（各项目的
 *   二级页无法静态枚举），且二级页尚未建——页面落地后再一并补充。
 */
export const dashboardManifest: ModuleManifest = {
  id: "dashboard",
  name: "数据驾驶舱",
  description: "在建项目、签单与回款、风险与待办的聚合首页",
  icon: "舱", // 单字符汉字，非 emoji
  order: 0, // 排 crm(2) 之前，导航与首页最前
  entryPath: "/dashboard",
  requiresAuth: false,
};
