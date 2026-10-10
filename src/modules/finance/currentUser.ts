import prisma from "@/core/db";
import { USER_ROLE } from "@/core/domain/types";

/**
 * 财务管控占位「当前用户」（M8-a）。
 *
 * P4 接登录后替换为 session 取当前用户；本期录入人仅记事实、不做权限
 * （TASK_M8 §0 红线：角色过滤 / 「仅老板可见」一律不做）。
 *
 * 取最早的 boss（老板）；缺则取最早的任意用户；都无 → null（诚实空态）。
 * 不接真登录、不返工历史数据。
 */

export interface FinanceUser {
  id: string;
  name: string;
  role: string;
}

/**
 * 取占位财务用户。
 * - 最早的 role=="boss" 用户；
 * - 缺则最早的任意用户；
 * - 都无 → null。
 */
export async function getFinanceUser(): Promise<FinanceUser | null> {
  const select = { id: true, name: true, role: true } as const;
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
