import type { ModuleManifest } from "../types";

/** 装修预算报价模块清单。 */
export const budgetManifest: ModuleManifest = {
  id: "budget",
  name: "装修预算报价",
  description: "按工程科目编制报价明细，实时汇总直接费、税金与单方造价",
  icon: "¥",
  order: 1,
  entryPath: "/budget",
  requiresAuth: false,
};
