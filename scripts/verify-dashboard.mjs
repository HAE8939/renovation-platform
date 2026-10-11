/**
 * verify-dashboard.mjs —— 数据驾驶舱纯函数回归门禁（只读，纯函数，不碰库）
 *
 * 为什么存在：M9-b-1 把驾驶舱的共享口径（在建三态、日历月键、签单额环比、
 * 回款率与色档、风险红灯计数、带符号百分比）抽成自包含纯函数
 * src/core/domain/dashboard.ts（不碰 DB、可被脚本直接 import 测）。
 * 本脚本把口径契约变成可重跑门禁：直接 import 生产 TS（Node 24 原生跑 .ts），
 * 再用独立预言机复算对照。
 *
 * 跑法：node scripts/verify-dashboard.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const dash = await import(
  pathToFileURL(join(ROOT, "src/core/domain/dashboard.ts")).href
);
const {
  IN_PROGRESS_STATUSES,
  isInProgress,
  monthKey,
  prevMonthKey,
  signedAmountAt,
  collectionRate,
  collectionLight,
  riskItemCount,
  formatSignedPercent,
} = dash;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

/* ── IN_PROGRESS_STATUSES / isInProgress ────────────────────────── */
{
  check("IN_PROGRESS_STATUSES: 恰为 design/in_progress/acceptance 三态",
    JSON.stringify(IN_PROGRESS_STATUSES) ===
      JSON.stringify(["design", "in_progress", "acceptance"]),
    JSON.stringify(IN_PROGRESS_STATUSES));

  check("isInProgress: 在建三态全 true",
    isInProgress("design") && isInProgress("in_progress") && isInProgress("acceptance"),
    "design/in_progress/acceptance 均 true");

  check("isInProgress: draft 筹备中 → false", isInProgress("draft") === false,
    "返回 false");
  check("isInProgress: completed 已竣工 → false", isInProgress("completed") === false,
    "返回 false");
  check("isInProgress: archived 已归档 → false", isInProgress("archived") === false,
    "返回 false");
  check("isInProgress: 非法值全 false",
    isInProgress("") === false && isInProgress("unknown") === false
      && isInProgress(null) === false && isInProgress(undefined) === false,
    "空串/未知串/null/undefined 均 false");
}

/* ── monthKey ───────────────────────────────────────────────────── */
{
  check("monthKey: 常规月补零（2026-09）",
    monthKey(new Date(2026, 8, 5)) === "2026-09", monthKey(new Date(2026, 8, 5)));
  check("monthKey: 12 月", monthKey(new Date(2026, 11, 31)) === "2026-12",
    monthKey(new Date(2026, 11, 31)));
  check("monthKey: 1 月", monthKey(new Date(2026, 0, 1)) === "2026-01",
    monthKey(new Date(2026, 0, 1)));
  check("monthKey: 月末 23:00 本地时区不漂移（禁 toISOString）",
    monthKey(new Date(2026, 9, 31, 23, 0, 0)) === "2026-10",
    monthKey(new Date(2026, 9, 31, 23, 0, 0)));
}

/* ── prevMonthKey ───────────────────────────────────────────────── */
{
  check("prevMonthKey: 2026-10 → 2026-09", prevMonthKey("2026-10") === "2026-09",
    prevMonthKey("2026-10"));
  check("prevMonthKey: 2026-01 → 2025-12（跨年）", prevMonthKey("2026-01") === "2025-12",
    prevMonthKey("2026-01"));
  check("prevMonthKey: 非法入参 → 空串",
    prevMonthKey("2026-1") === "" && prevMonthKey("abc") === ""
      && prevMonthKey("2026-13") === "" && prevMonthKey("2026-00") === ""
      && prevMonthKey("") === "",
    "缺补零/乱串/越界月份/空串均返回空串");
}

/* ── signedAmountAt ─────────────────────────────────────────────── */
{
  const now = new Date(2026, 9, 15); // 固定「本月」= 2026-10

  // 场景一：本月计入、unsigned 不计、上月计入、更早月份不计
  const r1 = signedAmountAt([
    { contractAmount: 100000, createdAt: new Date(2026, 9, 6), signed: true },
    { contractAmount: 50000, createdAt: new Date(2026, 9, 8), signed: false },
    { contractAmount: 80000, createdAt: new Date(2026, 8, 21), signed: true },
    { contractAmount: 999999, createdAt: new Date(2026, 7, 2), signed: true },
  ], now);
  check("signedAmountAt: 本月只计 signed 项（100000，unsigned 50000 不计）",
    r1.month === 100000, `month=${r1.month}`);
  check("signedAmountAt: 上月只计 signed 项（80000，更早月份不计）",
    r1.prevMonth === 80000, `prevMonth=${r1.prevMonth}`);
  check("signedAmountAt: 环比整值 (100000-80000)/80000=0.25",
    r1.momPct === 0.25, `momPct=${r1.momPct}`);

  // 场景二：跨月边界（上月末 23:30 与本月初 00:30 分属两月）
  const r2 = signedAmountAt([
    { contractAmount: 12345.67, createdAt: new Date(2026, 8, 30, 23, 30), signed: true },
    { contractAmount: 22222.22, createdAt: new Date(2026, 9, 1, 0, 30), signed: true },
  ], now);
  check("signedAmountAt: 跨月边界（上月末 23:30 归上月）",
    r2.prevMonth === 12345.67, `prevMonth=${r2.prevMonth}`);
  check("signedAmountAt: 跨月边界（本月初 00:30 归本月）",
    r2.month === 22222.22, `month=${r2.month}`);

  // 场景三：contractAmount 非有限不计入
  const r3 = signedAmountAt([
    { contractAmount: NaN, createdAt: new Date(2026, 9, 3), signed: true },
    { contractAmount: -Infinity, createdAt: new Date(2026, 9, 4), signed: true },
  ], now);
  check("signedAmountAt: NaN / 负无穷不计入（month 与 prevMonth 均为 0）",
    r3.month === 0 && r3.prevMonth === 0, `month=${r3.month} prevMonth=${r3.prevMonth}`);

  // 场景四：上月为 0 → momPct=null（上月无签单，不可比）
  const r4 = signedAmountAt(
    [{ contractAmount: 80000, createdAt: new Date(2026, 9, 9), signed: true }], now);
  check("signedAmountAt: 上月为 0 → momPct=null（上月无签单不可比）",
    r4.momPct === null && r4.month === 80000, `momPct=${r4.momPct}`);

  // 场景五：整数分（两位小数）预言机复算，期望值独立硬编码
  const r5 = signedAmountAt([
    { contractAmount: 100000.1, createdAt: new Date(2026, 9, 2), signed: true },
    { contractAmount: 5000.02, createdAt: new Date(2026, 9, 28), signed: true },
    { contractAmount: 80000.04, createdAt: new Date(2026, 8, 17), signed: true },
  ], now);
  check("signedAmountAt: 整数分复算 month=100000.10+5000.02=105000.12",
    r5.month === 105000.12, `month=${r5.month}`);
  check("signedAmountAt: 整数分复算 prevMonth=80000.04",
    r5.prevMonth === 80000.04, `prevMonth=${r5.prevMonth}`);
  check("signedAmountAt: 整数分复算 momPct=25000.08/80000.04=0.3125（四位舍入）",
    r5.momPct === 0.3125, `momPct=${r5.momPct}`);

  // 场景六：momPct 四位舍入（整值例 + 非整值例）
  const r6 = signedAmountAt([
    { contractAmount: 160000, createdAt: new Date(2026, 9, 5), signed: true },
    { contractAmount: 128000, createdAt: new Date(2026, 8, 5), signed: true },
  ], now);
  check("signedAmountAt: momPct 整值例 (160000-128000)/128000=0.25",
    r6.momPct === 0.25, `momPct=${r6.momPct}`);
  const r7 = signedAmountAt([
    { contractAmount: 130000, createdAt: new Date(2026, 9, 5), signed: true },
    { contractAmount: 90000, createdAt: new Date(2026, 8, 5), signed: true },
  ], now);
  check("signedAmountAt: momPct 非整值例 40000/90000=0.4444（四位舍入）",
    r7.momPct === 0.4444, `momPct=${r7.momPct}`);
}

/* ── collectionRate ─────────────────────────────────────────────── */
{
  check("collectionRate: 130600/183000 四位舍入 = 0.7137",
    collectionRate(130600, 183000) === 0.7137,
    `rate=${collectionRate(130600, 183000)}`);
  check("collectionRate: 分母 0 → null", collectionRate(100, 0) === null,
    `rate=${collectionRate(100, 0)}`);
  check("collectionRate: 分母负 → null", collectionRate(100, -50) === null,
    `rate=${collectionRate(100, -50)}`);
  check("collectionRate: 分子非有限按 0 参与计算（期望 0）",
    collectionRate(NaN, 183000) === 0 && collectionRate(-Infinity, 100) === 0,
    `NaN=${collectionRate(NaN, 183000)} 负无穷=${collectionRate(-Infinity, 100)}`);
  check("collectionRate: 超收不钳制（220000/100000=2.2，如实大于 1）",
    collectionRate(220000, 100000) === 2.2,
    `rate=${collectionRate(220000, 100000)}`);
}

/* ── collectionLight ────────────────────────────────────────────── */
{
  check("collectionLight: null → neutral", collectionLight(null) === "neutral",
    collectionLight(null));
  check("collectionLight: 0.7999 → yellow（阈值下）",
    collectionLight(0.7999) === "yellow", collectionLight(0.7999));
  check("collectionLight: 0.8 → green（恰等临界归绿）",
    collectionLight(0.8) === "green", collectionLight(0.8));
  check("collectionLight: 1.2 → green（超收仍绿）",
    collectionLight(1.2) === "green", collectionLight(1.2));
}

/* ── riskItemCount ──────────────────────────────────────────────── */
{
  check("riskItemCount: 四项相加 2+1+0+3=6",
    riskItemCount({ scheduleRed: 2, qualityRed: 1, budgetRed: 0, changeWarn: 3 }) === 6,
    `count=${riskItemCount({ scheduleRed: 2, qualityRed: 1, budgetRed: 0, changeWarn: 3 })}`);
  check("riskItemCount: 含 0 相加 2+0+1+0=3",
    riskItemCount({ scheduleRed: 2, qualityRed: 0, budgetRed: 1, changeWarn: 0 }) === 3,
    `count=${riskItemCount({ scheduleRed: 2, qualityRed: 0, budgetRed: 1, changeWarn: 0 })}`);
  // NaN / undefined 字段按 0 计且不抛错（mjs 无类型，等价 TS 里 as RiskCounts 绕过）
  const bad = { scheduleRed: NaN, qualityRed: undefined, budgetRed: 2, changeWarn: 1 };
  let noThrow = true;
  let count = -1;
  try {
    count = riskItemCount(bad);
  } catch {
    noThrow = false;
  }
  check("riskItemCount: NaN/undefined 字段按 0 且不抛错（2+1=3）",
    noThrow && count === 3, noThrow ? `count=${count}` : "抛出异常");
}

/* ── formatSignedPercent ────────────────────────────────────────── */
{
  check("formatSignedPercent: 0.124 → +12.4%",
    formatSignedPercent(0.124) === "+12.4%", formatSignedPercent(0.124));
  const neg = formatSignedPercent(-0.081);
  check("formatSignedPercent: -0.081 → U+2212 减号 8.1%（非 ASCII 连字符）",
    neg === "\u22128.1%" && !neg.includes("-") && neg.includes("\u2212"), neg);
  check("formatSignedPercent: 0 → 0.0%（无符号）",
    formatSignedPercent(0) === "0.0%", formatSignedPercent(0));
  check("formatSignedPercent: 非有限 → U+2014 破折号",
    formatSignedPercent(NaN) === "\u2014" && formatSignedPercent(Infinity) === "\u2014",
    `${formatSignedPercent(NaN)} / ${formatSignedPercent(Infinity)}`);
}

/* ── 输出禁 emoji 自检（与 verify-crm 保持同一纪律）─────────────── */
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

// 全部函数的字符串返回值拼一起，同款正则断言不含 emoji / 符号字形
const fnStrings = [
  IN_PROGRESS_STATUSES.join(","),
  monthKey(new Date(2026, 8, 5)),
  monthKey(new Date(2026, 11, 31)),
  prevMonthKey("2026-10"),
  prevMonthKey("2026-01"),
  prevMonthKey("bad"),
  collectionLight(null),
  collectionLight(0.7999),
  collectionLight(0.8),
  collectionLight(1.2),
  formatSignedPercent(0.124),
  formatSignedPercent(-0.081),
  formatSignedPercent(0),
  formatSignedPercent(NaN),
  formatSignedPercent(Infinity),
  formatSignedPercent(-2),
  formatSignedPercent(0.256),
].join("|");
check("输出契约：全部函数字符串返回值不含 emoji / 符号字形",
  !EMOJI_RE.test(fnStrings), "已扫描");

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = EMOJI_RE.test(out.join("\n"));
check("输出契约：门禁自身输出不含 emoji / 符号", !hasEmoji,
  hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n数据驾驶舱纯函数校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
