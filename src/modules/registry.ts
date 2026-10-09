import { budgetManifest } from "./budget/manifest";
import { crmManifest } from "./crm/manifest";
import { projectsManifest } from "./projects/manifest";
import type { DeferredModule, ModuleManifest } from "./types";

/**
 * 模块注册表 —— 平台的单一清单。
 * 外壳（layout 的侧栏导航 + 首页入口卡片）只从这里取数。
 * 新增模块：在 src/modules/<id>/manifest.ts 定义，然后在此数组加一行，
 * 导航与首页自动出现，无需改外壳代码。
 */
export const modules: ModuleManifest[] = [
  budgetManifest,
  crmManifest,
  projectsManifest,
].sort((a, b) => a.order - b.order);

/** DEFERRED 占位模块：首页可见、不可点、不进导航。
 *  对齐 docs/PLAN_FULL_SERVICE_V1.md v1.2 的模块清单（budget/crm 已上线，故不在此列）。
 *  顺序即首页展示顺序（驾驶舱 → 项目 → 设计 → 工期 → 质量 → 财务 → 人员）。 */
export const deferredModules: DeferredModule[] = [
  {
    id: "dashboard",
    name: "数据驾驶舱",
    description: "在建项目、签单额、回款率、健康三色灯与全局待办的聚合首页",
  },
  {
    id: "design",
    name: "设计管理",
    description: "设计任务看板、提交审核与退回、设计日历",
  },
  {
    id: "schedule",
    name: "时间管控",
    description: "工序排程、甘特图、按面积档模板与工期预警",
  },
  {
    id: "quality",
    name: "质量管控",
    description: "验收节点、SOP 检查项、质量问题台账与整改闭环",
  },
  {
    id: "finance",
    name: "预算管控",
    description: "合同预算锁定、变更管理、付款计划与收支台账",
  },
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
