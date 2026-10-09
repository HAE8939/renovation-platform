import type { ModuleManifest } from "../types";

/** 设计管理模块清单（M5-a 注册）。 */
export const designManifest: ModuleManifest = {
  id: "design",
  name: "设计管理",
  description: "设计任务看板双视角、任务全生命周期与设计日历",
  icon: "✎", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 4, // 排在 projects(3) 之后（生命周期视角：线索→项目→设计→报价…按 order 排序即 crm(2)→projects(3)→design(4)）
  entryPath: "/design",
  requiresAuth: false,
  // 不挂项目级/任务级入口：nav 是静态全局清单，拿不到 id 会渲染成死链（TASK_M5 §5）。
};
