/**
 * 数据驾驶舱共享口径 —— M9-b 只读聚合的单一真源。
 *
 * - 性质：驾驶舱全部指标口径收敛于此（在建三态、日历月键、签单额环比、
 *   回款率与色档、风险红灯计数、带符号百分比），纯函数只读聚合，
 *   不 import prisma、不查库、不做任何 IO。
 * - 为何自包含：门禁脚本 scripts/verify-dashboard.mjs 以 plain node 直接
 *   import 本文件（Node 24 原生跑 .ts），任何无扩展名 specifier 都会解析
 *   失败，故不 import 任何东西，round2/round4 在文件内内联实现，公式与
 *   src/core/domain/pricing.ts 保持一致。
 * - 回款率色档唯一阈值 80% 来自 v5.1 §6.1。
 * - 签单额口径（只计「签约建项」项、按 createdAt 落本地日历月）来自
 *   TASK_M9 §1-10。
 */

/** 两位小数四舍五入；非有限值归 0（与 pricing.ts 同式）。 */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 四位小数四舍五入；非有限值归 0（与 pricing.ts 同式）。 */
function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** 在建三态（不含 draft 筹备中 / completed 已竣工 / archived 已归档）——KPI 与健康矩阵共用这一定义。 */
export const IN_PROGRESS_STATUSES = ["design", "in_progress", "acceptance"] as const;
export type InProgressStatus = (typeof IN_PROGRESS_STATUSES)[number];

/** 字符串是否属在建三态（非在建、非法值、null/undefined 一律 false）。 */
export function isInProgress(status: string): boolean {
  return (IN_PROGRESS_STATUSES as readonly string[]).includes(status);
}

/**
 * 本地日历月键 "YYYY-MM"（月份补零）。
 * 必须用 getFullYear/getMonth（本地时区），禁止 toISOString——UTC 漂移会把
 * 月末签单算进下月。
 */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 上一个日历月键："2026-01" → "2025-12"，"2026-10" → "2026-09"。入参非法（不可解析为 YYYY-MM）→ 返回 ""。 */
export function prevMonthKey(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return "";
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
}

/** 签单额归集的最小输入形状。signed = 该项目是否由「签约建项」而来（调用方用 Project.lead 非空判定）。 */
export interface SignedInput {
  contractAmount: number;
  createdAt: Date;
  signed: boolean;
}

/**
 * 本月 / 上月签单额 + 环比（TASK_M9 §1-10）。
 *
 * 只累计 signed === true 且 createdAt 落在对应日历月的项；contractAmount
 * 非有限值按 0 计（不计入）。
 * 返回 { month, prevMonth, momPct }：month/prevMonth 用 round2；
 * momPct = prevMonth > 0 ? round4((month - prevMonth) / prevMonth) : null
 * （上月为 0 → null，UI 显「上月无签单，不可比」）。
 */
export function signedAmountAt(
  items: SignedInput[],
  now: Date,
): { month: number; prevMonth: number; momPct: number | null } {
  const cur = monthKey(now);
  const prev = prevMonthKey(cur);
  let sumMonth = 0;
  let sumPrev = 0;
  for (const it of items) {
    if (!it.signed) continue;
    if (!Number.isFinite(it.contractAmount)) continue;
    const k = monthKey(it.createdAt);
    if (k === cur) sumMonth += it.contractAmount;
    else if (k === prev) sumPrev += it.contractAmount;
  }
  const month = round2(sumMonth);
  const prevMonth = round2(sumPrev);
  const momPct = prevMonth > 0 ? round4((month - prevMonth) / prevMonth) : null;
  return { month, prevMonth, momPct };
}

/**
 * 回款率 = round4(received / receivable)。
 * receivable 非有限或 <= 0 → null（UI 显「—」，不得造 0%）；
 * received 非有限按 0 参与计算；比值不设上限钳制，超收如实反映（>1）。
 */
export function collectionRate(received: number, receivable: number): number | null {
  if (!Number.isFinite(receivable) || receivable <= 0) return null;
  const recv = Number.isFinite(received) ? received : 0;
  return round4(recv / receivable);
}

/** 回款率色档（v5.1 §6.1 唯一阈值 80%）：null → "neutral"；rate < 0.8 → "yellow"；否则 "green"（0.8 恰等归 green）。返回语义 token，不输出 emoji。 */
export type CollectionLight = "green" | "yellow" | "neutral";
export function collectionLight(rate: number | null): CollectionLight {
  if (rate === null) return "neutral";
  if (rate < 0.8) return "yellow";
  return "green";
}

/** 四类红灯信号计数（TASK_M9 §1-11：只数红灯，黄灯属预警不计入）。 */
export interface RiskCounts {
  scheduleRed: number;
  qualityRed: number;
  budgetRed: number;
  changeWarn: number;
}

/** 总数 = 四项相加；任一非有限值（含缺失字段）按 0 计。 */
export function riskItemCount(c: RiskCounts): number {
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  return num(c.scheduleRed) + num(c.qualityRed) + num(c.budgetRed) + num(c.changeWarn);
}

/**
 * 带符号百分比（环比展示专用）：0.124 → "+12.4%"；-0.081 → "−8.1%"
 * （负号是 U+2212 MINUS SIGN，不是 ASCII 连字符）；0 → "0.0%"（无符号）；
 * 非有限 → "—"（U+2014 EM DASH）。
 */
export function formatSignedPercent(n: number): string {
  if (!Number.isFinite(n)) return "\u2014";
  if (n === 0) return "0.0%";
  const abs = Math.abs(n * 100).toFixed(1);
  return n > 0 ? `+${abs}%` : `\u2212${abs}%`;
}

/**
 * 商务漏斗阶段顺序（M9-b-2a）。
 *
 * 与 `src/modules/crm/stages.ts` 的 `LEAD_STAGE_ORDER` 同序同值。两处不互相 import
 * （驾驶舱不得引模块内部，AGENTS §2），改由 `scripts/verify-dashboard.mjs` 断言二者
 * 一致——crm 若加阶段而忘了驾驶舱，门禁直接红，不会静默漏计线索。
 */
export const FUNNEL_STAGE_ORDER = [
  "leads",
  "contacted",
  "confirmed",
  "quoted",
  "signed",
] as const;

/**
 * 商务漏斗阶段存量计数（TASK_M9 §7-1）。
 *
 * 只画当前 `Lead.stage` 的存量分布，**不画相邻阶段转化率**——本平台没有阶段
 * 流水表，`stage` 只有现值，「到达过某阶段」的累计数算不出来；用存量冒充转化率
 * ＝造假日指标（违反 §0 禁 mock 完成准则）。唯一真指标是签约率（见 leadConversion）。
 *
 * 按传入 `order` 顺序输出；`pct = count / total`（total = rows.length，含 order 外
 * 的行也计入分母，因为它们是真实存量；total 0 → 各 pct 0）。`order` 外的 stage 不
 * 出现在结果里（不冒泡未知值）。pct 为 0–1 小数，四位舍入（与 collectionRate 同式）。
 * count 为非负整数。
 *
 * 中文标签不进 core：调用方传 stage 串，页面用本地常量映射中文
 * （站内 ProjectTabs/finance 各自本地映射是既有先例，crm/stages.ts 属模块私有禁区）。
 */
export interface FunnelRow {
  stage: string;
  count: number;
  pct: number;
}
export function funnelCounts(
  rows: { stage: string }[],
  order: readonly string[],
): FunnelRow[] {
  const total = rows.length;
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);
  }
  const out: FunnelRow[] = [];
  for (const stage of order) {
    const count = counts.get(stage) ?? 0;
    const pct = total > 0 ? round4(count / total) : 0;
    out.push({ stage, count, pct });
  }
  return out;
}

/**
 * 签约率 = signed 线索数 / 全部线索数（TASK_M9 §7-1 唯一真指标）。
 *
 * 分母 0 → `null`（UI 显「—」）；分子按 `stage === "signed"` 计数；四位舍入。
 * 与 `funnelCounts` 中 signed 阶段的 `pct` 同值，但语义独立（一个画存量条、
 * 一个作真指标），口径单点收敛在此函数，页面不得各写算式。
 */
export function leadConversion(rows: { stage: string }[]): number | null {
  if (rows.length === 0) return null;
  let signed = 0;
  for (const r of rows) {
    if (r.stage === "signed") signed++;
  }
  return round4(signed / rows.length);
}
