/**
 * 共享核心域的类型与常量（core/domain）。
 * SQLite 没有原生 enum，枚举一律用 string + 常量（AGENTS §1 可移植约束）。
 */

export const PROJECT_STATUS = {
  draft: "draft",
  in_progress: "in_progress",
  completed: "completed",
  archived: "archived",
} as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "筹备中",
  in_progress: "施工中",
  completed: "已竣工",
  archived: "已归档",
};

export const QUOTE_STATUS = {
  draft: "draft",
  confirmed: "confirmed",
} as const;
export type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "草稿",
  confirmed: "已确认",
};

/** 用户角色占位（P4 接入登录时使用），仅定义常量，不落认证逻辑。 */
export const USER_ROLE = {
  owner: "owner",
  designer: "designer",
  pm: "pm",
  viewer: "viewer",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
