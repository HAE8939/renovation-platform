/**
 * 变更单类型纯常量与守卫（M9-a，仿 crm/stages.ts + quality/status.ts）。
 * 不依赖 prisma，客户端可安全 import；服务层与门禁共用同一份定义。
 *
 * 四类 kind（v5.1 §6.7.2）：
 * - add：增项（金额须为正）
 * - deduct：减项（金额须为负）
 * - upgrade：材料升级（非零即可）
 * - process：工艺变更（非零即可）
 *
 * 金额方向守卫集中在 isValidAmountForKind —— 服务层与门禁共用，
 * 避免在多处各写一套符号判定。
 */

/** 变更类型枚举（字符串常量，落库即为字面值）。 */
export const CHANGE_KIND = {
  add: "add",
  deduct: "deduct",
  upgrade: "upgrade",
  process: "process",
} as const;

export type ChangeKind = (typeof CHANGE_KIND)[keyof typeof CHANGE_KIND];

/** 变更类型中文标签（非 emoji）。 */
export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  add: "增项",
  deduct: "减项",
  upgrade: "材料升级",
  process: "工艺变更",
};

/** 有序序列（界面下拉按此顺序，增项在前减项在后便于录入）。 */
export const CHANGE_KIND_ORDER = [
  CHANGE_KIND.add,
  CHANGE_KIND.deduct,
  CHANGE_KIND.upgrade,
  CHANGE_KIND.process,
] as const;

/** 是否合法 kind（谓词，纯函数）。 */
export function isChangeKind(v: unknown): v is ChangeKind {
  return typeof v === "string" && v in CHANGE_KIND;
}

/**
 * 金额方向守卫（v5.1 §6.7.2，§3-3）：
 * - deduct：须 < 0（减项必须为负数）
 * - add：须 > 0（增项必须为正数）
 * - upgrade / process：须 ≠ 0 且为有限数（方向不限，但不可为零）
 * 服务层 createChange/updateChange 调用此谓词做输入校验，门禁 verify-quote.mjs 也复用。
 */
export function isValidAmountForKind(kind: string, amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  switch (kind) {
    case CHANGE_KIND.deduct:
      return amount < 0;
    case CHANGE_KIND.add:
      return amount > 0;
    case CHANGE_KIND.upgrade:
    case CHANGE_KIND.process:
      return amount !== 0;
    default:
      return false;
  }
}
