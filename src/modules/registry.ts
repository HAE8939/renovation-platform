import { budgetManifest } from "./budget/manifest";
import { crmManifest } from "./crm/manifest";
import { dashboardManifest } from "./dashboard/manifest";
import { projectsManifest } from "./projects/manifest";
import { designManifest } from "./design/manifest";
import { scheduleManifest } from "./schedule/manifest";
import { qualityManifest } from "./quality/manifest";
import { financeManifest } from "./finance/manifest";
import { fieldsManifest } from "./fields/manifest";
import type { DeferredModule, ModuleManifest } from "./types";

/**
 * 模块注册表 —— 平台的单一清单。
 * 外壳（layout 的侧栏导航 + 首页入口卡片）只从这里取数。
 * 新增模块：在 src/modules/<id>/manifest.ts 定义，然后在此数组加一行，
 * 导航与首页自动出现，无需改外壳代码。
 */
export const modules: ModuleManifest[] = [
  dashboardManifest,
  budgetManifest,
  crmManifest,
  projectsManifest,
  designManifest,
  scheduleManifest,
  qualityManifest,
  financeManifest,
  fieldsManifest,
].sort((a, b) => a.order - b.order);

/** DEFERRED 占位模块：首页可见、不可点、不进导航。
 *  对齐 docs/PLAN_FULL_SERVICE_V1.md v1.2 的模块清单（budget/crm 已上线，故不在此列；
 *  驾驶舱已于 M9-b 转实，不再占位）。顺序即首页展示顺序（当前仅剩人员）。 */
export const deferredModules: DeferredModule[] = [
  {
    id: "hr",
    name: "人员管控",
    description: "人员档案、绩效看板与考核算法（项目 / 月度双维度）",
  },
];

/** 所有模块按 order 升序；外壳导航与首页共用。 */
export function getModuleById(id: string): ModuleManifest | undefined {
  return modules.find((m) => m.id === id);
}
