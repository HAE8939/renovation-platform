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
  funnelCounts,
  FUNNEL_STAGE_ORDER,
  leadConversion,
  monthKeysDescending,
  cashSeries,
  cashPeak,
  cashTone,
} = dash;
// crm 的阶段序列（纯常量文件，无 prisma，plain-node 可直 import）——用于锁死
// 「驾驶舱漏斗阶段顺序」与「线索真实阶段顺序」不漂移。
const { LEAD_STAGE_ORDER } = await import(
  pathToFileURL(join(ROOT, "src/modules/crm/stages.ts")).href
);

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

/* ── funnelCounts / leadConversion（M9-b-2a 追加）───────────────── */
{
  const ORDER = [...FUNNEL_STAGE_ORDER];

  // 漂移护栏：core 的漏斗阶段顺序必须与 crm 的真实线索阶段序列同序同值
  // （两处不互相 import，靠这条断言锁死——crm 加阶段而驾驶舱忘了改，这里直接红）
  check("阶段顺序不漂移：FUNNEL_STAGE_ORDER ≡ crm LEAD_STAGE_ORDER",
    JSON.stringify(ORDER) === JSON.stringify([...LEAD_STAGE_ORDER]),
    `core ${JSON.stringify(ORDER)} vs crm ${JSON.stringify([...LEAD_STAGE_ORDER])}`);

  // 空集 → 五阶段全 0、pct 全 0
  const empty = funnelCounts([], ORDER);
  check("funnelCounts: 空集 → 五阶段全 0、pct 全 0",
    empty.length === 5 && empty.every((r) => r.count === 0 && r.pct === 0),
    JSON.stringify(empty));

  // 全在同一阶段（leads ×3）→ leads count=3 pct=1、其余 0
  const single = funnelCounts(
    [{ stage: "leads" }, { stage: "leads" }, { stage: "leads" }],
    ORDER
  );
  check("funnelCounts: 三条全 leads → leads count=3 pct=1、其余 0",
    single[0].stage === "leads" && single[0].count === 3 && single[0].pct === 1
      && single.slice(1).every((r) => r.count === 0 && r.pct === 0),
    JSON.stringify(single));

  // 五阶段各 2（共 10）→ 各 count=2 pct=0.2
  const five = funnelCounts(
    [
      { stage: "leads" }, { stage: "leads" },
      { stage: "contacted" }, { stage: "contacted" },
      { stage: "confirmed" }, { stage: "confirmed" },
      { stage: "quoted" }, { stage: "quoted" },
      { stage: "signed" }, { stage: "signed" },
    ],
    ORDER
  );
  check("funnelCounts: 五阶段各 2 → 各 count=2 pct=0.2",
    five.every((r) => r.count === 2 && r.pct === 0.2),
    JSON.stringify(five));

  // 2/1/2/1/1=7 → pct 之和≈1（各值独立 round4，容差见下方断言）
  const mixed = funnelCounts(
    [
      { stage: "leads" }, { stage: "leads" },
      { stage: "contacted" },
      { stage: "confirmed" }, { stage: "confirmed" },
      { stage: "quoted" },
      { stage: "signed" },
    ],
    ORDER
  );
  const pctSum = mixed.reduce((s, r) => s + r.pct, 0);
  // 各 pct 独立 round4，和会有舍入漂移（如 1/7=0.1429、2/7=0.2857 → 和 1.0001），
  // 容差取 1e-3 覆盖 5 值各自的尾数漂移（最坏 5×0.00005=0.00025）。
  check("funnelCounts: 2/1/2/1/1=7 → pct 之和≈1（容差 1e-3，容独立 round4 漂移）",
    Math.abs(pctSum - 1) < 1e-3,
    `pctSum=${pctSum}`);

  // 输出顺序与 order 一致
  check("funnelCounts: 输出顺序与 order 一致",
    JSON.stringify(five.map((r) => r.stage)) === JSON.stringify(ORDER),
    JSON.stringify(five.map((r) => r.stage)));

  // order 外的 stage 不计入任何输出行
  const extra = funnelCounts([{ stage: "unknown" }, { stage: "leads" }], ORDER);
  check("funnelCounts: order 外 stage 不冒泡到输出",
    extra.length === 5 && extra[0].stage === "leads" && extra[0].count === 1
      && extra.every((r) => r.stage !== "unknown"),
    JSON.stringify(extra));

  // order 外的 stage 仍计入 total（分母）—— leads 行 pct = 1/2 = 0.5
  check("funnelCounts: order 外 stage 计入 total（leads pct=1/2=0.5）",
    extra[0].pct === 0.5,
    `leads pct=${extra[0].pct}`);

  // leadConversion: 空集 → null
  check("leadConversion: 空集 → null",
    leadConversion([]) === null,
    `${leadConversion([])}`);

  // 1/4 signed → 0.25
  check("leadConversion: 1/4 signed → 0.25",
    leadConversion([{ stage: "leads" }, { stage: "contacted" }, { stage: "signed" }, { stage: "quoted" }]) === 0.25,
    `${leadConversion([{ stage: "leads" }, { stage: "contacted" }, { stage: "signed" }, { stage: "quoted" }])}`);

  // 2/4 signed → 0.5
  check("leadConversion: 2/4 signed → 0.5",
    leadConversion([{ stage: "signed" }, { stage: "signed" }, { stage: "leads" }, { stage: "contacted" }]) === 0.5,
    `${leadConversion([{ stage: "signed" }, { stage: "signed" }, { stage: "leads" }, { stage: "contacted" }])}`);

  // 0 signed → 0（非 null）
  check("leadConversion: 0 signed → 0（非 null）",
    leadConversion([{ stage: "leads" }, { stage: "contacted" }, { stage: "confirmed" }]) === 0,
    `${leadConversion([{ stage: "leads" }, { stage: "contacted" }, { stage: "confirmed" }])}`);

  // 全 signed → 1
  check("leadConversion: 全 signed → 1",
    leadConversion([{ stage: "signed" }, { stage: "signed" }]) === 1,
    `${leadConversion([{ stage: "signed" }, { stage: "signed" }])}`);

  // 独立整数预言机复算：8 条 2 signed → 2/8=0.25
  const indep = ((2 / 8) * 10000) / 10000;
  check("leadConversion: 独立复算 2/8=0.25 与函数一致",
    leadConversion([
      { stage: "signed" }, { stage: "signed" },
      { stage: "leads" }, { stage: "leads" }, { stage: "leads" },
      { stage: "leads" }, { stage: "leads" }, { stage: "leads" },
    ]) === indep,
    `${leadConversion([
      { stage: "signed" }, { stage: "signed" },
      { stage: "leads" }, { stage: "leads" }, { stage: "leads" },
      { stage: "leads" }, { stage: "leads" }, { stage: "leads" },
    ])}`);

  // 与 funnelCounts signed 行 pct 同值（口径单点收敛验证）
  const bothFive = funnelCounts(
    [{ stage: "signed" }, { stage: "signed" }, { stage: "leads" }, { stage: "leads" }],
    ORDER
  );
  const signedPct = bothFive.find((r) => r.stage === "signed")?.pct;
  const conv = leadConversion(
    [{ stage: "signed" }, { stage: "signed" }, { stage: "leads" }, { stage: "leads" }]
  );
  check("leadConversion: 与 funnelCounts signed 行 pct 同值（口径单点）",
    signedPct === conv && signedPct === 0.5,
    `signedPct=${signedPct} conv=${conv}`);
}

/* ── monthKeysDescending / cashSeries / cashPeak / cashTone（M9-b-2b 追加）─ */

// 第 14 条与「跨源不漂移护栏」共用的同一组三个月混合收支 rows
// （2026-08/09/10 全覆盖，含一笔 1234.56 小数尾数；本地构造日期，禁字符串形式）。
const oracleRows = [
  { type: "income", amount: 50000, date: new Date(2026, 9, 3) },
  { type: "income", amount: 1234.56, date: new Date(2026, 9, 20) },
  { type: "expense", amount: 9800.5, date: new Date(2026, 9, 25) },
  { type: "income", amount: 30000.05, date: new Date(2026, 8, 10) },
  { type: "expense", amount: 15000.75, date: new Date(2026, 8, 15) },
  { type: "income", amount: 8000, date: new Date(2026, 7, 5) },
  { type: "expense", amount: 999.99, date: new Date(2026, 7, 30) },
  { type: "expense", amount: 2200.01, date: new Date(2026, 7, 31) },
];

{
  const NOW = new Date(2026, 9, 11); // 固定「当月」= 2026-10

  // monthKeysDescending
  check("monthKeysDescending: n=6 由近到远、首元素=当月（JSON 整体比对含顺序）",
    JSON.stringify(monthKeysDescending(6, NOW)) ===
      JSON.stringify(["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]),
    JSON.stringify(monthKeysDescending(6, NOW)));

  check("monthKeysDescending: 跨年借位（2026-02 倒推 4 个月入 2025）",
    JSON.stringify(monthKeysDescending(4, new Date(2026, 1, 15))) ===
      JSON.stringify(["2026-02", "2026-01", "2025-12", "2025-11"]),
    JSON.stringify(monthKeysDescending(4, new Date(2026, 1, 15))));

  check("monthKeysDescending: n=1 只含当月 2026-10",
    JSON.stringify(monthKeysDescending(1, NOW)) === JSON.stringify(["2026-10"]),
    JSON.stringify(monthKeysDescending(1, NOW)));

  check("monthKeysDescending: n=0 / 负数 / NaN / Infinity → 全空数组",
    monthKeysDescending(0, NOW).length === 0
      && monthKeysDescending(-3, NOW).length === 0
      && monthKeysDescending(NaN, NOW).length === 0
      && monthKeysDescending(Infinity, NOW).length === 0,
    `0:${monthKeysDescending(0, NOW).length} -3:${monthKeysDescending(-3, NOW).length} `
      + `NaN:${monthKeysDescending(NaN, NOW).length} Infinity:${monthKeysDescending(Infinity, NOW).length}`);

  check("monthKeysDescending: 小数 n=2.7 向下取整 → 恰 2 个月",
    monthKeysDescending(2.7, NOW).length === 2
      && JSON.stringify(monthKeysDescending(2.7, NOW)) === JSON.stringify(["2026-10", "2026-09"]),
    JSON.stringify(monthKeysDescending(2.7, NOW)));

  check("monthKeysDescending: 月末 23:30 构造不漂移（首元素仍当月 2026-10）",
    JSON.stringify(monthKeysDescending(3, new Date(2026, 9, 31, 23, 30))) ===
      JSON.stringify(["2026-10", "2026-09", "2026-08"]),
    JSON.stringify(monthKeysDescending(3, new Date(2026, 9, 31, 23, 30))));

  // cashSeries —— 真实空白必须是 0（不是 null、不是缺项）
  const blank = cashSeries([], ["2026-10", "2026-09"]);
  check("cashSeries: 空 rows → 与 keys 同长同序、每点三值全 0（非 null 非缺项）",
    blank.length === 2 && blank[0].key === "2026-10" && blank[1].key === "2026-09"
      && blank.every((p) => p.income === 0 && p.expense === 0 && p.net === 0),
    JSON.stringify(blank));

  const merged = cashSeries([
    { type: "income", amount: 50000.05, date: new Date(2026, 9, 6) },
    { type: "income", amount: 30000.05, date: new Date(2026, 9, 21) },
  ], ["2026-10"]);
  check("cashSeries: 同月两笔 income 合并 50000.05+30000.05=80000.10（整数分 8000010）",
    merged[0].income === 80000.1 && Math.round(merged[0].income * 100) === 8000010
      && merged[0].expense === 0,
    `income=${merged[0].income}`);

  const boundary = cashSeries([
    { type: "income", amount: 700, date: new Date(2026, 8, 30, 23, 30) },
    { type: "income", amount: 900, date: new Date(2026, 9, 1, 0, 30) },
  ], ["2026-10", "2026-09"]);
  check("cashSeries: 跨月边界本地不漂移（8/30 23:30 归 09、10/1 00:30 归 10，互不串月）",
    boundary[0].key === "2026-10" && boundary[0].income === 900 && boundary[0].expense === 0
      && boundary[1].key === "2026-09" && boundary[1].income === 700 && boundary[1].expense === 0,
    JSON.stringify(boundary));

  const dirtyType = cashSeries([
    { type: "refund", amount: 100, date: new Date(2026, 9, 3) },
    { type: "", amount: 200, date: new Date(2026, 9, 4) },
    { type: "INCOME", amount: 300, date: new Date(2026, 9, 5) },
  ], ["2026-10"]);
  check("cashSeries: 脏 type（refund/空串/大写 INCOME）收支两侧都不计",
    dirtyType[0].income === 0 && dirtyType[0].expense === 0 && dirtyType[0].net === 0,
    JSON.stringify(dirtyType));

  const dirtyAmount = cashSeries([
    { type: "income", amount: -100, date: new Date(2026, 9, 3) },
    { type: "income", amount: NaN, date: new Date(2026, 9, 4) },
    { type: "expense", amount: Infinity, date: new Date(2026, 9, 5) },
  ], ["2026-10"]);
  check("cashSeries: 脏 amount（-100/NaN/Infinity）按 0 参与、两桶保持 0 且不抛错",
    dirtyAmount[0].income === 0 && dirtyAmount[0].expense === 0 && dirtyAmount[0].net === 0,
    JSON.stringify(dirtyAmount));

  const outside = cashSeries([
    { type: "income", amount: 777, date: new Date(2026, 6, 15) }, // 2026-07，不在 keys
    { type: "income", amount: 555, date: new Date(2026, 7, 20) }, // 2026-08
  ], ["2026-09", "2026-08"]);
  check("cashSeries: keys 之外的月份被忽略（无 2026-07 键、其余桶不受影响）",
    outside.length === 2 && !outside.some((p) => p.key === "2026-07")
      && outside[0].key === "2026-09" && outside[0].income === 0
      && outside[1].key === "2026-08" && outside[1].income === 555,
    JSON.stringify(outside));

  const negative = cashSeries([
    { type: "income", amount: 10000, date: new Date(2026, 9, 8) },
    { type: "expense", amount: 24500, date: new Date(2026, 9, 9) },
  ], ["2026-10"]);
  check("cashSeries: net 可为负（10000-24500=-14500）",
    negative[0].net === -14500, `net=${negative[0].net}`);

  // 独立整数分预言机（不借用被测函数的浮点累加+round2 路径，逐行以「分」手算）：
  //   2026-10 income = 5000000 + 123456 = 5123456 分 = 51234.56
  //          expense = 980050 分 = 9800.50；net = 5123456 - 980050 = 4143406 分 = 41434.06
  //   2026-09 income = 3000005 分 = 30000.05；expense = 1500075 分 = 15000.75
  //          net = 3000005 - 1500075 = 1499930 分 = 14999.30
  //   2026-08 income = 800000 分 = 8000.00；expense = 99999 + 220001 = 320000 分 = 3200.00
  //          net = 800000 - 320000 = 480000 分 = 4800.00
  const oracle = cashSeries(oracleRows, ["2026-10", "2026-09", "2026-08"]);
  const byKey = Object.fromEntries(oracle.map((p) => [p.key, p]));
  check("cashSeries: 整数分预言机 2026-10（51234.56 / 9800.50 / net 41434.06）",
    byKey["2026-10"].income === 51234.56 && byKey["2026-10"].expense === 9800.5
      && byKey["2026-10"].net === 41434.06
      && Math.round(byKey["2026-10"].income * 100) === 5123456
      && Math.round(byKey["2026-10"].net * 100) === 4143406,
    JSON.stringify(byKey["2026-10"]));
  check("cashSeries: 整数分预言机 2026-09（30000.05 / 15000.75 / net 14999.30）",
    byKey["2026-09"].income === 30000.05 && byKey["2026-09"].expense === 15000.75
      && byKey["2026-09"].net === 14999.3
      && Math.round(byKey["2026-09"].net * 100) === 1499930,
    JSON.stringify(byKey["2026-09"]));
  check("cashSeries: 整数分预言机 2026-08（8000 / 3200 / net 4800）",
    byKey["2026-08"].income === 8000 && byKey["2026-08"].expense === 3200
      && byKey["2026-08"].net === 4800
      && Math.round(byKey["2026-08"].expense * 100) === 320000,
    JSON.stringify(byKey["2026-08"]));

  const withBlankMonth = cashSeries(
    [{ type: "income", amount: 100, date: new Date(2026, 10, 5) }], // 仅 2026-11 有数据
    ["2026-10", "2026-11", "2026-12"]
  );
  check("cashSeries: 输出长度严格 === keys.length（无数据月也在列且全 0）",
    withBlankMonth.length === 3 && withBlankMonth[0].key === "2026-10"
      && withBlankMonth[2].key === "2026-12"
      && withBlankMonth[0].income === 0 && withBlankMonth[0].net === 0
      && withBlankMonth[1].income === 100 && withBlankMonth[1].net === 100
      && withBlankMonth[2].income === 0,
    JSON.stringify(withBlankMonth));

  check("cashSeries: keys=[] → 输出 []（长度 0）",
    Array.isArray(cashSeries(oracleRows, [])) && cashSeries(oracleRows, []).length === 0,
    `len=${cashSeries(oracleRows, []).length}`);

  let dirtyRow = null;
  let noThrowDirty = true;
  try {
    dirtyRow = cashSeries(
      [null, { type: "income" }, { type: "income", amount: 5, date: new Date(2026, 9, 1) }],
      ["2026-10"]
    );
  } catch {
    noThrowDirty = false;
  }
  check("cashSeries: null 行 / 缺 date 行不崩，仅完整第三行计入（income=5）",
    noThrowDirty && dirtyRow !== null && dirtyRow[0].income === 5 && dirtyRow[0].expense === 0,
    noThrowDirty ? JSON.stringify(dirtyRow) : "抛出异常");

  // net 必须用「已各自 round2 的 income/expense」相减（手算）：
  //   income 两笔 8.002 + 2.002 → 原始和 10.004 → round2 → 10.00
  //   expense 一笔 0.005 → round2 → 0.01（0.5 分进位）
  //   net = round2(10.00 - 0.01) = 9.99
  //   若误用未舍入原始差 10.004 - 0.005 = 9.999 → round2 后为 10.00，本断言即红
  const roundedNet = cashSeries([
    { type: "income", amount: 8.002, date: new Date(2026, 9, 2) },
    { type: "income", amount: 2.002, date: new Date(2026, 9, 3) },
    { type: "expense", amount: 0.005, date: new Date(2026, 9, 4) },
  ], ["2026-10"]);
  check("cashSeries: net 用已舍入值相减（10.00-0.01=9.99，非原始差 9.999→10.00）",
    roundedNet[0].income === 10 && roundedNet[0].expense === 0.01 && roundedNet[0].net === 9.99,
    `income=${roundedNet[0].income} expense=${roundedNet[0].expense} net=${roundedNet[0].net}`);

  // cashPeak
  check("cashPeak: 空数组 / null / undefined → 0 且不抛错",
    cashPeak([]) === 0 && cashPeak(null) === 0 && cashPeak(undefined) === 0,
    `[]:${cashPeak([])} null:${cashPeak(null)} undefined:${cashPeak(undefined)}`);

  const peakPoints = [
    { key: "2026-10", income: 112000, expense: 98000, net: 14000 },
    { key: "2026-09", income: 88000, expense: 120000, net: -32000 },
  ];
  check("cashPeak: 取两列最大（income 峰 112000、expense 峰 120000 → 120000）",
    cashPeak(peakPoints) === 120000, `peak=${cashPeak(peakPoints)}`);

  check("cashPeak: 全 0 点 → 0",
    cashPeak([{ key: "2026-10", income: 0, expense: 0, net: 0 }]) === 0,
    `peak=${cashPeak([{ key: "2026-10", income: 0, expense: 0, net: 0 }])}`);

  // cashTone
  check("cashTone: 0 / 正数 → success（含 0 不算流出）",
    cashTone(0) === "success" && cashTone(1) === "success",
    `0:${cashTone(0)} 1:${cashTone(1)}`);
  check("cashTone: -0.01 → warning（净流出即黄档）",
    cashTone(-0.01) === "warning", cashTone(-0.01));
  check("cashTone: NaN / undefined 按 0 处理 → success",
    cashTone(NaN) === "success" && cashTone(undefined) === "success",
    `NaN:${cashTone(NaN)} undefined:${cashTone(undefined)}`);
}

/* ── 跨源不漂移护栏：驾驶舱现金线 ≡ 财务台账（M9-b-2b 追加）───────────── */
{
  // 为什么这么测：驾驶舱现金线（cashSeries）与财务台账（ledger 的
  // receivedTotal / expenseTotal）必须是同一把尺子——两处各自演进就会静默
  // 漂移（本项目 §5 已登记过同类口径漂移教训）。两文件互不 import，靠这里
  // 对「同一组 rows」交叉比对整数分锁死，谁先改口径这里直接红。
  const { receivedTotal, expenseTotal } = await import(
    pathToFileURL(join(ROOT, "src/core/domain/ledger.ts")).href
  );

  // 复用上面第 14 条那组 8 行混合收支（oracleRows，keys 覆盖全部有数据月份）
  const guardPoints = cashSeries(oracleRows, ["2026-10", "2026-09", "2026-08"]);
  const sumIncome = guardPoints.reduce((s, p) => s + p.income, 0);
  const sumExpense = guardPoints.reduce((s, p) => s + p.expense, 0);

  // 手算：Σincome = 5123456 + 3000005 + 800000 = 8923461 分 = 89234.61
  //       Σexpense = 980050 + 1500075 + 320000 = 2800125 分 = 28001.25
  check("跨源护栏：cashSeries 各点 income 之和 ≡ ledger.receivedTotal（整数分 8923461）",
    Math.round(sumIncome * 100) === 8923461
      && Math.round(receivedTotal(oracleRows) * 100) === 8923461,
    `cash=${Math.round(sumIncome * 100)} ledger=${Math.round(receivedTotal(oracleRows) * 100)}`);

  check("跨源护栏：cashSeries 各点 expense 之和 ≡ ledger.expenseTotal（整数分 2800125）",
    Math.round(sumExpense * 100) === 2800125
      && Math.round(expenseTotal(oracleRows) * 100) === 2800125,
    `cash=${Math.round(sumExpense * 100)} ledger=${Math.round(expenseTotal(oracleRows) * 100)}`);
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
  JSON.stringify(funnelCounts(
    [{ stage: "leads" }, { stage: "signed" }],
    ["leads", "contacted", "confirmed", "quoted", "signed"]
  )),
  JSON.stringify(funnelCounts([], ["leads", "signed"])),
  String(leadConversion([{ stage: "signed" }])),
  String(leadConversion([])),
  JSON.stringify(monthKeysDescending(3, new Date(2026, 9, 11))),
  cashTone(0),
  cashTone(-1),
  JSON.stringify(cashSeries([{ type: "income", amount: 1, date: new Date(2026, 9, 1) }], ["2026-10"])),
  String(cashPeak([])),
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
