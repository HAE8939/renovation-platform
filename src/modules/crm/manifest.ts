import type { ModuleManifest } from "../types";

/** 商务线索模块清单（M3-a 注册）。 */
export const crmManifest: ModuleManifest = {
  id: "crm",
  name: "商务线索",
  description: "从线索录入、跟进推进到签约建项的商务全链路",
  icon: "线", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 2,
  entryPath: "/crm",
  requiresAuth: false,
  // 不挂项目级/线索级入口：nav 是静态全局清单，拿不到 id 会渲染成死链（STATUS §5）。
};
