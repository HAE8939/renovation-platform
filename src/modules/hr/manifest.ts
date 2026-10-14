import type { ModuleManifest } from "../types";

/** 人员工控模块清单（M12-a）：先从人员档案与项目责任关系开始。 */
export const hrManifest: ModuleManifest = {
  id: "hr",
  name: "人员工控",
  description: "人员档案、项目责任关系与基础工作记录",
  icon: "人",
  order: 9,
  entryPath: "/hr",
  requiresAuth: false,
};
