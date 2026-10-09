import { budgetManifest } from "./budget/manifest";
import { crmManifest } from "./crm/manifest";
import type { DeferredModule, ModuleManifest } from "./types";

/**
 * 模块注册表 —— 平台的单一清单。
 * 外壳（layout 的侧栏导航 + 首页入口卡片）只从这里取数。
 * 新增模块：在 src/modules/<id>/manifest.ts 定义，然后在此数组加一行，
 * 导航与首页自动出现，无需改外壳代码。
 */
export const modules: ModuleManifest[] = [budgetManifest, crmManifest].sort(
  (a, b) => a.order - b.order
);

/** DEFERRED 占位模块：首页可见、不可点、不进导航。 */
export const deferredModules: DeferredModule[] = [
  {
    id: "pm",
    name: "项目管理系统",
    description: "施工计划、任务分派、现场验收与变更签证",
  },
  {
    id: "design",
    name: "设计管理系统",
    description: "方案版本、材料选型与图纸协同",
  },
];

/** 所有模块按 order 升序；外壳导航与首页共用。 */
export function getModuleById(id: string): ModuleManifest | undefined {
  return modules.find((m) => m.id === id);
}
