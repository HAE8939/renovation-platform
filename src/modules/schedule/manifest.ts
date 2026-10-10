import type { ModuleManifest } from "../types";

/** 时间管控模块清单（M6-a 注册）。 */
export const scheduleManifest: ModuleManifest = {
  id: "schedule",
  name: "时间管控",
  description: "工序排程、甘特图、按面积档模板与工期预警",
  icon: "期", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 5, // 排在 design(4) 之后（生命周期：线索→项目→设计→报价→排程…）
  entryPath: "/schedule",
  requiresAuth: false,
  // 工序模板库为全局静态页，可进 nav；项目级/任务级入口不放 nav（拿不到 id 会成死链）。
  nav: [{ label: "工序模板库", href: "/schedule/templates" }],
};
