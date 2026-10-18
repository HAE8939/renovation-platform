import { USER_ROLE, type UserRole } from "./types";

/**
 * 权限骨架（M3-a，纯函数、不查库、不接认证）。
 *
 * 本期只覆盖 crm 模块的 view/create/edit，且只落地两类角色的真实规则：
 *   - boss     老板：全权（看/建/改）
 *   - biz_mgr  商务经理：可看/建/改自己的线索
 *
 * 其余角色（designer / pm / inspector / budget_mgr / ops / viewer 等）
 * 暂不臆造规则 —— 留 TODO，等 P4 接入真实认证与更细粒度视角再补。
 * 这是“视角过滤 + 按钮显隐”层级，非安全边界（AGENTS §7 RBAC DEFERRED）。
 */

/** crm 模块用到的动作。后续可加 sign / export 等。 */
export type CrmAction = "view" | "create" | "edit";

export type Role = UserRole;

const CRM_RULES: Record<Role, CrmAction[]> = {
  // 老板：crm 全权
  [USER_ROLE.boss]: ["view", "create", "edit"],
  // 商务经理：可看 / 建 / 改线索
  [USER_ROLE.biz_mgr]: ["view", "create", "edit"],

  // TODO(M3): 以下角色规则待 P4 接入认证后按业务线补充，先不臆造
  [USER_ROLE.ops]: [],
  [USER_ROLE.designer]: [],
  [USER_ROLE.design_asst]: [],
  [USER_ROLE.floor_plan]: [],
  [USER_ROLE.construction]: [],
  [USER_ROLE.rendering]: [],
  [USER_ROLE.budget_mgr]: [],
  [USER_ROLE.pm]: [],
  [USER_ROLE.inspector]: [],
  [USER_ROLE.viewer]: [],
};

/** 角色是否可对 crm 执行某动作。未知角色默认 false（保守）。 */
export function can(role: Role, action: CrmAction): boolean {
  return (CRM_RULES[role] ?? []).includes(action);
}
