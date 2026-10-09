import prisma from "@/core/db";
import { USER_ROLE } from "@/core/domain/types";

/**
 * 占位「当前用户」（M5-a）。
 * P4 接登录后替换为 session 取当前用户；本期用 DB 里第一个 designer 用户
 * 驱动看板「指派给我」视角 —— 只换数据源，不改表、不返工历史数据。
 * 不接真登录。
 */

/** 占位用户 id。null = 未指定，回退到「第一个 designer 用户」解析。 */
export const PLACEHOLDER_USER_ID: string | null = null;

export interface PlaceholderUser {
  id: string;
  name: string;
  role: string;
}

/** 取占位当前用户：显式指定 id 则按 id 查；否则取最早的 designer。无则返回 null（诚实空态）。 */
export async function getPlaceholderUser(): Promise<PlaceholderUser | null> {
  const select = { id: true, name: true, role: true } as const;
  if (PLACEHOLDER_USER_ID) {
    return prisma.user.findUnique({ where: { id: PLACEHOLDER_USER_ID }, select });
  }
  return prisma.user.findFirst({
    where: { role: USER_ROLE.designer },
    orderBy: { createdAt: "asc" },
    select,
  });
}
