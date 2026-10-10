import type { ModuleManifest } from "../types";

/** 装修预算报价模块清单。 */
export const budgetManifest: ModuleManifest = {
  id: "budget",
  name: "装修预算报价",
  description: "按工程科目编制报价明细，实时汇总直接费、税金与单方造价",
  icon: "¥",
  // order 调为 7（M7-a 对齐 PLAN §6 目标导航顺序 …schedule·quality·budget…，
  // 仅动顺序不动路由；HAE 已知晓）。
  order: 7,
  entryPath: "/budget",
  requiresAuth: false,
  nav: [
    { label: "科目库", href: "/budget/catalog" },
    // 「科目分布」刻意不放这里：nav 是全局静态清单、无法携带 projectId，
    // 写成 /budget/[projectId]/stats 会按字面量渲染成死链（实测 404）。
    // 项目级入口一律从详情页内部用带 id 的链接进入。
  ],
};
