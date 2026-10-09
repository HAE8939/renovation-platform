import type { ModuleManifest } from "../types";

/** 项目管理模块清单（M4-a 注册）。 */
export const projectsManifest: ModuleManifest = {
  id: "projects",
  name: "项目管理",
  description: "签约后项目的全生命周期管理台：列表、筛选与六合一详情",
  icon: "▤", // 单字符非 emoji（V0.3：禁用彩色 icon 库 / emoji）
  order: 3, // 排在 crm(2) 之后、budget(1) 之后（生命周期视角：线索→项目→报价）
  entryPath: "/projects",
  requiresAuth: false,
  // 不挂项目级入口：nav 是静态全局清单，拿不到 id 会渲染成死链（STATUS §5）。
};
