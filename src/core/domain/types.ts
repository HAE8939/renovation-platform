/**
 * 共享核心域的类型与常量（core/domain）。
 * SQLite 没有原生 enum，枚举一律用 string + 常量（AGENTS §1 可移植约束）。
 */

export const PROJECT_STATUS = {
  draft: "draft", // 筹备中
  design: "design", // 设计中
  in_progress: "in_progress", // 施工中
  acceptance: "acceptance", // 验收中
  completed: "completed", // 已竣工
  archived: "archived", // 已归档
} as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "筹备中",
  design: "设计中",
  in_progress: "施工中",
  acceptance: "验收中",
  completed: "已竣工",
  archived: "已归档",
};

/** 状态有序序列：供 stepper / 排序使用（顺序即业务推进次序）。 */
export const PROJECT_STATUS_ORDER = [
  "draft",
  "design",
  "in_progress",
  "acceptance",
  "completed",
  "archived",
] as const;

export const QUOTE_STATUS = {
  draft: "draft",
  confirmed: "confirmed",
  locked: "locked", // 签约锁单（schema 仍是 String）
} as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "草稿",
  confirmed: "已确认",
  locked: "已锁定",
};

/**
 * 用户角色常量（对齐 v5.1 §4.1 装修公司 11 角色，分属 4 条业务线）。
 * 仅定义常量、不落认证逻辑（RBAC 真接 DEFERRED 到 P4）。
 * viewer = DB role 默认值/未鉴权占位（P4 登录时再收敛），非 v5.1 业务角色。
 */
export const USER_ROLE = {
  // management
  boss: "boss", // 老板
  ops: "ops", // 运营
  // business
  biz_mgr: "biz_mgr", // 商务经理
  // design
  designer: "designer", // 项目设计师
  design_asst: "design_asst", // 设计助理
  floor_plan: "floor_plan", // 平面深化
  construction: "construction", // 施工深化
  rendering: "rendering", // 效果图设计师
  budget_mgr: "budget_mgr", // 预算员
  // engineering
  pm: "pm", // 项目经理
  inspector: "inspector", // 工程巡检
  // 占位（默认值/未登录只读）
  viewer: "viewer",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  boss: "老板",
  ops: "运营",
  biz_mgr: "商务经理",
  designer: "项目设计师",
  design_asst: "设计助理",
  floor_plan: "平面深化",
  construction: "施工深化",
  rendering: "效果图设计师",
  budget_mgr: "预算员",
  pm: "项目经理",
  inspector: "工程巡检",
  viewer: "只读(占位)",
};

/** 部门分组（User.department 取值）。 */
export const DEPARTMENT = {
  management: "management",
  business: "business",
  design: "design",
  engineering: "engineering",
} as const;
export type Department = (typeof DEPARTMENT)[keyof typeof DEPARTMENT];

export const DEPARTMENT_LABEL: Record<Department, string> = {
  management: "管理",
  business: "业务",
  design: "设计",
  engineering: "工程",
};
