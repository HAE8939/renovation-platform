/**
 * 财务口径纯函数（core/domain）—— 单一真源。
 *
 * 沿 M4-a `pricing.ts` 上收先例（PLAN §7.3「毛利只出现在单一口径文件」）：
 * projects 与 finance 两个消费方都要用，跨模块禁引；放 core 让两者共用而不产生
 * 跨模块 import（AGENTS §2）。本文件自包含、不 import 任何模块、不查 prisma、
 * 可被 plain node / verify 脚本直接加载。
 *
 * 与 pricing.ts / design/metrics.ts / quality/status.ts / quality/timeline.ts 同范式：
 * 经 plain-node verify 直 import 的纯函数一律自包含（pricing.ts 自定义 round2；
 * 本文件内联同一 round2 公式——同源、不引跨文件运行时 import，否则 plain node
 * 无法解析无扩展名 specifier）。round2 的权威定义仍在 pricing.ts，二者公式一致。
 *
 * 毛利口径与预算灯（`health.budgetLight`，已收 vs 合同额）不同：预算灯是合同执行/
 * 收款进度，毛利是 收入−支出。两者不在同一灯位（TASK_M8 §1-3、§7-12）。
 *
 * 金额一律两位小数（AGENTS §5）。
 */

/** 两位小数；先加 EPSILON 消浮点尾差（与 pricing.round2 同源公式）。 */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 收支记录最小形状（只取 type + amount，不碰整行）。 */
export interface LedgerRecord {
  type: string; // income | expense
  amount: number;
}

/** 毛利率色档返回词汇：复用 health 的 Light 三色 + neutral 哨兵。 */
export type MarginLight = "green" | "yellow" | "red" | "neutral";

/** 毛利计算输入：合同额 + 变更额 + 支出合计。 */
export interface GrossProfitInput {
  contractAmount: number;
  changeTotal: number;
  expenseTotal: number;
}

/** 取一条 amount 的有效正值（脏值/负数/NaN → 0）。 */
function safeAmount(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 已收款 = Σ(type=="income")。按 type 取数、不看符号（amount 恒正），
 * 非数字/负数按 0 计（防御）。返回未舍入的浮点和（round2 留给调用方）。
 */
export function receivedTotal(records: LedgerRecord[]): number {
  if (!records || records.length === 0) return 0;
  return records.reduce(
    (sum, r) => (r?.type === "income" ? sum + safeAmount(r?.amount) : sum),
    0
  );
}

/**
 * 总支出 = Σ(type=="expense")。同 receivedTotal 的取数口径。
 */
export function expenseTotal(records: LedgerRecord[]): number {
  if (!records || records.length === 0) return 0;
  return records.reduce(
    (sum, r) => (r?.type === "expense" ? sum + safeAmount(r?.amount) : sum),
    0
  );
}

/** 净现金流 = round2(已收 − 支出)。 */
export function netCash(records: LedgerRecord[]): number {
  return round2(receivedTotal(records) - expenseTotal(records));
}

/**
 * 毛利 = round2(合同额 + 变更额 − 支出)。
 * changeTotal 恒传 0 直到 M9 变更单上线（TASK_M8 §0 红线 / §7-9）。
 * 合同额未录入（0）+ 支出 0 → 毛利 0（中性，不报红）。
 */
export function grossProfit(input: GrossProfitInput): number {
  const contract = safeAmount(input.contractAmount);
  const change = safeAmount(input.changeTotal);
  const expense = safeAmount(input.expenseTotal);
  return round2(contract + change - expense);
}

/**
 * 毛利率 = 毛利 ÷ (合同额 + 变更额)。
 * 分母 ≤ 0（合同额未录入=不可算）→ 返回 **null**，UI 显「—」，不造 0%。
 * 否则舍入到四位小数（0~1 之间，UI 自行 ×100 格式化）。
 * 注：TASK_M8 §3 原文写作 round2(rate*10000)/10000，但 round2 是两位舍入，
 * 会使 0.2265625 → 0.226563（六位）与「四位小数」声明冲突；此处取标准四位舍入
 * Math.round(rate*10000)/10000，与 §6「四位小数舍入」断言一致。
 */
export function marginRate(input: GrossProfitInput): number | null {
  const contract = safeAmount(input.contractAmount);
  const change = safeAmount(input.changeTotal);
  const expense = safeAmount(input.expenseTotal);
  const denom = contract + change;
  if (denom <= 0) return null;
  const profit = round2(contract + change - expense);
  return Math.round((profit / denom) * 10000) / 10000;
}

/**
 * 毛利率色档（v5.1 §6.7.5「>25% 绿 / 15–25% 黄 / <15% 红」的歧义本卡定死）：
 * - null / undefined → "neutral"（不可算，不报红）
 * - > 0.25 → "green"
 * - 0.25 → "yellow"（临界归黄）
 * - >= 0.15 → "yellow"（0.15 也归黄）
 * - < 0.15 → "red"
 */
export function marginLight(rate: number | null | undefined): MarginLight {
  if (rate === null || rate === undefined) return "neutral";
  if (rate > 0.25) return "green";
  if (rate >= 0.15) return "yellow";
  return "red";
}

// ── M9-a 变更单口径 ──────────────────────────────────────────────
// 与 receivedTotal/expenseTotal 的 safeAmount 不同：变更金额带符号
// （正=增加、负=减少，v5.1 §6.7.2 原文），负数/减项合法保留，仅非有限值按 0。
// 落在此文件是为了让 budget 模块与 finance/projects 读侧共用同一口径而不产生
// 跨模块 import（AGENTS §2），与 grossProfit/marginRate 同源。

/** 变更累计超合同额比例的预警阈值（v5.1 §6.7.2：5%）。 */
export const CHANGE_WATCH_RATIO = 0.05;

/** 变更单行最小形状（只取 amount，不碰整行）。 */
export interface ChangeRow {
  amount: number;
}

/**
 * 变更额合计 = round2(Σ amount)。带符号：正=增加、负=减少。
 * 与 safeAmount 口径不同——负数（减项）合法保留，仅非有限值按 0。
 * 与 grossProfit(input) 的 changeTotal 字段同源，前者给读侧聚合（projects/finance），
 * 后者给毛利计算消费。本函数为单一真源，读侧只调用它，不再各写算式。
 */
export function changeTotal(changes: ChangeRow[] | null | undefined): number {
  if (!changes || changes.length === 0) return 0;
  return round2(
    changes.reduce(
      (sum, c) => (c && Number.isFinite(c.amount) ? sum + c.amount : sum),
      0
    )
  );
}

/**
 * 变更额超合同额 5% 预警（v5.1 §6.7.2）。
 * - 合同额 ≤ 0 → 不预警（{warn:false, ratio:null}）
 * - ratio = round4(change/contract)；warn = change > contract × CHANGE_WATCH_RATIO
 *   （**严格大于**——恰好 == 5% 不预警，留缓冲位给临界单据）
 * - 不输出 emoji，UI 自行决定横幅形态。
 * ratio 四位小数（与 marginRate 同舍入口径，便于 UI 百分比展示）。
 */
export function changeWatch(
  contractAmount: number,
  changeTotal: number
): { warn: boolean; ratio: number | null } {
  const contract = Number.isFinite(contractAmount) ? contractAmount : 0;
  const change = Number.isFinite(changeTotal) ? changeTotal : 0;
  if (contract <= 0) return { warn: false, ratio: null };
  const ratio = Math.round((change / contract) * 10000) / 10000;
  return { warn: change > contract * CHANGE_WATCH_RATIO, ratio };
}
