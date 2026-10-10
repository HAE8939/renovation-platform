import prisma from "@/core/db";
import { USER_ROLE } from "@/core/domain/types";

/**
 * 质量管控占位「当前用户」（M7-b）。
 *
 * P4 接登录后替换为 session 取当前用户；本期用 DB 里按角色取最早一行驱动
 * 「谁提交 / 谁审核」的演示视角 —— 只换数据源，不改表、不返工历史数据。
 * 不接真登录。
 *
 * 承 v5.1 §4.1 角色分工：巡检（inspector）提交验收、项目经理（pm）审核。
 * 取不到主角色时回退到另一角色（缺则返回 null，诚实空态，UI 给可读提示）。
 */

export interface PlaceholderUser {
  id: string;
  name: string;
  role: string;
}

/**
 * 取占位当前用户。
 * - kind="submit"：取最早的 inspector（巡检提交）；缺则取最早的 pm；
 * - kind="review"：取最早的 pm（PM 审核）；缺则取最早的 inspector；
 * - 两个角色都不存在 → 返回 null（页面据此禁用提交/审核并提示先跑 seed）。
 */
export async function getPlaceholderUser(
  kind: "submit" | "review" = "submit"
): Promise<PlaceholderUser | null> {
  const select = { id: true, name: true, role: true } as const;

  const primary = kind === "submit" ? USER_ROLE.inspector : USER_ROLE.pm;
  const fallback = kind === "submit" ? USER_ROLE.pm : USER_ROLE.inspector;

  const first =
    (await prisma.user.findFirst({
      where: { role: primary },
      orderBy: { createdAt: "asc" },
      select,
    })) ??
    (await prisma.user.findFirst({
      where: { role: fallback },
      orderBy: { createdAt: "asc" },
      select,
    }));
  return first ?? null;
}
