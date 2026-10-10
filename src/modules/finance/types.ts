/**
 * 财务管控模块共享类型与常量（M8-a）。纯类型 + 纯函数，无 prisma，客户端可安全 import。
 * 标签与 tone 见 status.ts。
 *
 * 防错账第一道闸：收入侧与支出侧科目互斥（categoriesFor），收入不给选材料、
 * 支出不给选合同款（TASK_M8 §3）。
 */

/** 收支类型：收入 / 支出。方向由 type 决定，amount 恒正（免符号歧义）。 */
export type FinanceType = "income" | "expense";

/**
 * 收支科目：
 * - income: contract 合同款 / change 变更款（M9 留位，seed 不造假）/ refund 退款
 * - expense: material 材料费 / labor 人工费 / other 其他支出（含分包，§7-8）
 */
export type FinanceCategory =
  | "contract"
  | "change"
  | "refund"
  | "material"
  | "labor"
  | "other";

/** 付款段解锁依赖的验收条件类型（与 schema PaymentNode.trigger 同字面）。 */
export type TriggerKind = "none" | "stages" | "all";

/**
 * 收支科目常量映射（防错账：收入侧与支出侧互斥无交集）。
 * - income: contract / change / refund
 * - expense: material / labor / other
 */
export const RECORD_CATEGORIES: Record<FinanceType, readonly FinanceCategory[]> = {
  income: ["contract", "change", "refund"] as const,
  expense: ["material", "labor", "other"] as const,
};

/**
 * 按 type 取该侧可选科目（互斥，防错账）。
 * 收入侧不给选材料、支出侧不给选合同款；未知 type → 空数组。
 */
export function categoriesFor(type: string): readonly FinanceCategory[] {
  if (type === "income" || type === "expense") {
    return RECORD_CATEGORIES[type];
  }
  return [];
}
