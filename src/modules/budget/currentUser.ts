import prisma from "@/core/db";
import { USER_ROLE } from "@/core/domain/types";

/**
 * 预算模块占位“当前用户”（M9-a，仿 finance/currentUser.ts）。
 *
 * P4 接登录后替换为 session 取当前用户；本期变更单 createdBy 仅记事实、
 * 不做权限（TASK_M9 §0 红线：审批流/角色过滤一律不做）。
 *
 * 取最早的 budget_mgr（预算员）；缺则最早的 boss（老板）；缺则最早的任意用户；
 * 都无 → null（诚实空态）。优先级比 finance 略细：变更单语义上属预算员职责。
 */

export interface BudgetUser {
  id: string;
  name: string;
  role: string;
}

/**
 * 取占位预算用户。
 * - 最早的 role=="budget_mgr" 用户；
 * - 缺则最早的 role=="boss" 用户；
 * - 缺则最早的任意用户；
 * - 都无 → null。
 */
export async function getBudgetUser(): Promise<BudgetUser | null> {
  const select = { id: true, name: true, role: true } as const;
  const budgetMgr = await prisma.user.findFirst({
    where: { role: USER_ROLE.budget_mgr },
    orderBy: { createdAt: "asc" },
    select,
  });
  if (budgetMgr) return budgetMgr;
  const boss = await prisma.user.findFirst({
    where: { role: USER_ROLE.boss },
    orderBy: { createdAt: "asc" },
    select,
  });
  if (boss) return boss;
  const any = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select,
  });
  return any ?? null;
}
