import type { ModuleManifest } from "../types";

/** 财务管控模块清单（M8-a 注册）。
 *  v5.1 称"预算管控"，但本平台 budget 已独立成模块叫"装修预算报价"，
 *  沿用会撞名误导——finance 只管钱、不管预算编制（TASK_M8 §7-1）。 */
export const financeManifest: ModuleManifest = {
  id: "finance",
  name: "财务管控",
  description: "项目收支台账、付款计划与毛利粗算",
  icon: "财", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 8, // 排在 quality(6) / budget(7) 之后
  entryPath: "/finance",
  requiresAuth: false,
  // 二级导航指向占位页（防死链）。项目级入口只能放页面内带 ?projectId= 的深链。
  nav: [{ label: "付款计划", href: "/finance/payments" }],
};
