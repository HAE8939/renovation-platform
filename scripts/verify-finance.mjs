/**
 * verify-finance.mjs —— 财务管控纯函数回归校验（只读，纯函数，不碰库）
 *
 * 为什么存在：M8-a 把财务口径（ledger）/ 五段模板与解锁（payment）/ 类型防错账（types）
 * / label-tone（status）抽成纯函数，本脚本把 TASK_M8 §3 / §6 的用例变成可重跑门禁：
 * 直接 import 生产 TS（Node 24 原生跑 .ts，带 .ts 扩展名），再用独立整数分（cent）
 * 预言机复算对照，并断言所有输出与函数返回值不含任何 emoji。
 *
 * 跑法：node scripts/verify-finance.mjs   （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 带 .ts 扩展名直 import 生产纯函数（勿穿无扩展名 re-export 链——踩过坑）。
const ledger = await import(
  pathToFileURL(join(ROOT, "src/core/domain/ledger.ts")).href
);
const {
  receivedTotal,
  expenseTotal,
  netCash,
  grossProfit,
  marginRate,
  marginLight,
  changeTotal,
  changeWatch,
  CHANGE_WATCH_RATIO,
} = ledger;

const payment = await import(
  pathToFileURL(join(ROOT, "src/modules/finance/payment.ts")).href
);
const {
  PAYMENT_STAGE_DEFS,
  buildPaymentPlan,
  paymentUnlockState,
  paymentTriggerLabel,
  canMarkPaid,
} = payment;

const types = await import(
  pathToFileURL(join(ROOT, "src/modules/finance/types.ts")).href
);
const { RECORD_CATEGORIES, categoriesFor } = types;

const status = await import(
  pathToFileURL(join(ROOT, "src/modules/finance/status.ts")).href
);
const {
  RECORD_TYPE_LABEL,
  recordTypeTone,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  PAYMENT_TRIGGER_LABEL,
} = status;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

/** 整数分预言机：元 → 分（规避浮点误差，独立复算）。 */
const toCents = (yuan) => Math.round(yuan * 100);
const fromCents = (cents) => Math.round(cents) / 100;

// ── ledger: receivedTotal / expenseTotal（按 type 取数 + 脏值防御）──────────
{
  // 正常：收入 100+30=130，支出 50
  const recs = [
    { type: "income", amount: 100 },
    { type: "expense", amount: 50 },
    { type: "income", amount: 30 },
  ];
  check("receivedTotal: 正常 Σ income = 130", receivedTotal(recs) === 130, `= ${receivedTotal(recs)}`);
  check("expenseTotal: 正常 Σ expense = 50", expenseTotal(recs) === 50, `= ${expenseTotal(recs)}`);

  // 脏值防御：NaN / 负数 / 非数字 → 0
  const dirty = [
    { type: "income", amount: NaN },
    { type: "income", amount: -5 },
    { type: "income", amount: "x" },
    { type: "income", amount: 200 },
    { type: "expense", amount: -10 },
  ];
  check("receivedTotal: 脏值按 0 计 → 200", receivedTotal(dirty) === 200, `= ${receivedTotal(dirty)}`);
  check("expenseTotal: 负数按 0 计 → 0", expenseTotal(dirty) === 0, `= ${expenseTotal(dirty)}`);

  // 空数组 / null 防御
  check("receivedTotal: 空数组 → 0", receivedTotal([]) === 0);
  check("expenseTotal: null → 0", expenseTotal(null) === 0);

  // 整数分预言机
  const big = [{ type: "income", amount: 12345.67 }, { type: "income", amount: 89.33 }];
  const centsSum = toCents(12345.67) + toCents(89.33);
  check(
    "receivedTotal: 整数分预言机复算",
    receivedTotal(big) === fromCents(centsSum),
    `${receivedTotal(big)} vs ${fromCents(centsSum)}`
  );
}

// ── ledger: netCash 正负两例 ────────────────────────────────────
{
  const pos = [{ type: "income", amount: 200 }, { type: "expense", amount: 50 }];
  check("netCash: 正 = 150", netCash(pos) === 150, `= ${netCash(pos)}`);
  const neg = [{ type: "income", amount: 50 }, { type: "expense", amount: 200 }];
  check("netCash: 负 = -150", netCash(neg) === -150, `= ${netCash(neg)}`);
}

// ── ledger: grossProfit 三例 ────────────────────────────────────
{
  // 正常
  const g1 = grossProfit({ contractAmount: 62000, changeTotal: 0, expenseTotal: 40300 });
  const oracle1 = fromCents(toCents(62000) + toCents(0) - toCents(40300));
  check("grossProfit: 正常 62000-40300 = 21700", g1 === 21700 && g1 === oracle1, `= ${g1}`);

  // 负毛利
  const g2 = grossProfit({ contractAmount: 50000, changeTotal: 0, expenseTotal: 60000 });
  check("grossProfit: 负毛利 = -10000", g2 === -10000, `= ${g2}`);

  // 合同额 0（哨兵）
  const g3 = grossProfit({ contractAmount: 0, changeTotal: 0, expenseTotal: 5000 });
  check("grossProfit: 合同额 0 → -5000", g3 === -5000, `= ${g3}`);
}

// ── ledger: marginRate（分母 ≤0 → null，四位小数）──────────────
{
  // 合同额 0 → null（不许返回 0）
  check("marginRate: 合同额 0 → null", marginRate({ contractAmount: 0, changeTotal: 0, expenseTotal: 0 }) === null);
  check("marginRate: 合同额负 → null（safeAmount 归 0）", marginRate({ contractAmount: -100, changeTotal: 0, expenseTotal: 0 }) === null);

  // 正常：21700/62000 = 0.35
  const r1 = marginRate({ contractAmount: 62000, changeTotal: 0, expenseTotal: 40300 });
  check("marginRate: 62000/40300 → 0.35", r1 === 0.35, `= ${r1}`);

  // 四位小数舍入：29000/128000 = 0.2265625 → 0.2266
  const r2 = marginRate({ contractAmount: 128000, changeTotal: 0, expenseTotal: 99000 });
  const oracleRate = Math.round((29000 / 128000) * 10000) / 10000;
  check("marginRate: 四位小数 0.2266", r2 === 0.2266 && r2 === oracleRate, `= ${r2} (oracle ${oracleRate})`);

  // 整数分预言机
  const contract = 99999.99;
  const expense = 12345.67;
  const r3 = marginRate({ contractAmount: contract, changeTotal: 0, expenseTotal: expense });
  const profitCents = toCents(contract) - toCents(expense);
  const denomCents = toCents(contract);
  const oracle3 = Math.round((profitCents / denomCents) * 10000) / 10000;
  check("marginRate: 整数分预言机复算", r3 === oracle3, `= ${r3} (oracle ${oracle3})`);
}

// ── ledger: marginLight 五档边界 ───────────────────────────────
{
  check("marginLight: 0.26 → green", marginLight(0.26) === "green");
  check("marginLight: 0.25 → yellow（临界归黄）", marginLight(0.25) === "yellow", `= ${marginLight(0.25)}`);
  check("marginLight: 0.2499 → yellow", marginLight(0.2499) === "yellow");
  check("marginLight: 0.15 → yellow（临界归黄）", marginLight(0.15) === "yellow", `= ${marginLight(0.15)}`);
  check("marginLight: 0.1499 → red", marginLight(0.1499) === "red");
  check("marginLight: null → neutral", marginLight(null) === "neutral");
  check("marginLight: undefined → neutral", marginLight(undefined) === "neutral");
  check("marginLight: 0.30 → green", marginLight(0.3) === "green");
  check("marginLight: 0.20 → yellow", marginLight(0.2) === "yellow");
  check("marginLight: 0.10 → red", marginLight(0.1) === "red");
}

// ── payment: PAYMENT_STAGE_DEFS 五段完整 ───────────────────────
{
  check("PAYMENT_STAGE_DEFS: 5 段", PAYMENT_STAGE_DEFS.length === 5);
  check(
    "PAYMENT_STAGE_DEFS: order 1..5",
    PAYMENT_STAGE_DEFS.every((d, i) => d.order === i + 1)
  );
  check(
    "PAYMENT_STAGE_DEFS: percent 合计 100",
    PAYMENT_STAGE_DEFS.reduce((s, d) => s + d.percent, 0) === 100
  );
  check(
    "PAYMENT_STAGE_DEFS: 第 5 段保修金 unlocksAtOffsetMonths=12",
    PAYMENT_STAGE_DEFS[4].unlocksAtOffsetMonths === 12
  );
  check(
    "PAYMENT_STAGE_DEFS: 主体段 triggerStages 四工序",
    PAYMENT_STAGE_DEFS[2].triggerStages.length === 4 &&
      PAYMENT_STAGE_DEFS[2].triggerStages.join(",") === "泥工工程,防水工程,地面工程,天花工程"
  );
  check(
    "PAYMENT_STAGE_DEFS: 水电段 triggerStages=水电工程",
    PAYMENT_STAGE_DEFS[1].triggerStages[0] === "水电工程"
  );
}

// ── payment: buildPaymentPlan（三例 + 尾差 + 守卫）──────────────
{
  const cases = [62000, 160000, 128001];
  for (const c of cases) {
    const plan = buildPaymentPlan(c);
    check(`buildPaymentPlan(${c}): 5 段`, plan.length === 5);
    const sum = plan.reduce((s, r) => s + r.amountDue, 0);
    // 浮点累加可能产生 1e-11 级误差，用 round2 容差比对（整数分预言机另作硬比对）
    const sumR2 = Math.round((sum + Number.EPSILON) * 100) / 100;
    check(`buildPaymentPlan(${c}): 五段之和恰等合同额`, sumR2 === c, `sum=${sum}`);
    // 整数分预言机
    const sumCents = plan.reduce((s, r) => s + toCents(r.amountDue), 0);
    check(`buildPaymentPlan(${c}): 整数分之和 = 合同额分`, fromCents(sumCents) === c, `${fromCents(sumCents)} vs ${c}`);
    check(
      `buildPaymentPlan(${c}): percent 合计 100`,
      plan.reduce((s, r) => s + r.percent, 0) === 100
    );
    check(
      `buildPaymentPlan(${c}): order 1..5`,
      plan.every((r, i) => r.order === i + 1)
    );
    // 尾差归末段：末段 = round2(contract − Σ前四)
    const frontSum = plan.slice(0, 4).reduce((s, r) => s + r.amountDue, 0);
    const expectedLast = Math.round((c - frontSum + Number.EPSILON) * 100) / 100;
    check(
      `buildPaymentPlan(${c}): 尾差归末段`,
      plan[4].amountDue === expectedLast,
      `${plan[4].amountDue} vs ${expectedLast}`
    );
  }

  // 守卫：contract <= 0 → []
  check("buildPaymentPlan(0): → []", buildPaymentPlan(0).length === 0);
  check("buildPaymentPlan(-100): → []", buildPaymentPlan(-100).length === 0);
  check("buildPaymentPlan(NaN): → []", buildPaymentPlan(NaN).length === 0);
  check("buildPaymentPlan(Infinity): → []", buildPaymentPlan(Infinity).length === 0);

  // 具体金额抽检（62000）
  const p1 = buildPaymentPlan(62000);
  check("buildPaymentPlan(62000): o1=18600", p1[0].amountDue === 18600, `= ${p1[0].amountDue}`);
  check("buildPaymentPlan(62000): o5=3100（尾差）", p1[4].amountDue === 3100, `= ${p1[4].amountDue}`);
}

// ── payment: paymentUnlockState 四路径 × 矩阵 ──────────────────
// 构造器
const mkNode = (over) => ({
  order: 1, name: "开工款", percent: 30, amountDue: 18600,
  trigger: "none", triggerStages: "", unlocksAt: null, paid: false,
  ...over,
});
const mkAccept = (name, status) => ({ name, status });
const today = new Date("2026-10-10T00:00:00.000Z");
const future = new Date("2027-11-30T00:00:00.000Z");
const past = new Date("2025-01-01T00:00:00.000Z");

{
  // 路径 1：none 无日期 → 解锁（无验收依赖）
  const s1 = paymentUnlockState(mkNode({ trigger: "none", unlocksAt: null }), [], today);
  check("unlock: none 无日期 → 解锁", s1.unlocked === true, s1.reason);
  check("unlock: none 无日期 reason 含「无验收依赖」", s1.reason.includes("无验收依赖"), s1.reason);

  // 路径 1b：none 有日期，未到 → 锁（日期优先）
  const s2 = paymentUnlockState(mkNode({ trigger: "none", unlocksAt: future }), [], today);
  check("unlock: none 日期未到 → 锁", s2.unlocked === false, s2.reason);
  check("unlock: none 日期未到 reason 含「保修期未至」", s2.reason.includes("保修期未至"), s2.reason);

  // 路径 1c：unlocksAt == today 边界 → 解锁（== today 视为已到）
  const s3 = paymentUnlockState(mkNode({ trigger: "none", unlocksAt: today }), [], today);
  check("unlock: unlocksAt==today → 解锁（边界）", s3.unlocked === true, s3.reason);

  // 路径 1d：none 有日期，已过 → 解锁
  const s4 = paymentUnlockState(mkNode({ trigger: "none", unlocksAt: past }), [], today);
  check("unlock: none 日期已过 → 解锁", s4.unlocked === true, s4.reason);
  check("unlock: none 日期已过 reason 含「保修期已至」", s4.reason.includes("保修期已至"), s4.reason);

  // 路径 2：stages 满足 → 解锁
  const s5 = paymentUnlockState(
    mkNode({ trigger: "stages", triggerStages: "水电工程" }),
    [mkAccept("水电工程", "passed")],
    today
  );
  check("unlock: stages 满足 → 解锁", s5.unlocked === true, s5.reason);

  // 路径 2b：stages 不满足（节点存在但未 passed）
  const s6 = paymentUnlockState(
    mkNode({ trigger: "stages", triggerStages: "水电工程" }),
    [mkAccept("水电工程", "submitted")],
    today
  );
  check("unlock: stages 未通过 → 锁", s6.unlocked === false, s6.reason);
  check("unlock: stages 未通过 reason 含「未通过」", s6.reason.includes("未通过"), s6.reason);
  check("unlock: stages 未通过 missing 含「水电工程」", s6.missing.includes("水电工程"), JSON.stringify(s6.missing));

  // 路径 2c：stages 无对应节点
  const s7 = paymentUnlockState(
    mkNode({ trigger: "stages", triggerStages: "水电工程" }),
    [mkAccept("泥工工程", "passed")],
    today
  );
  check("unlock: stages 无对应节点 → 锁", s7.unlocked === false, s7.reason);
  check("unlock: stages 无对应节点 reason 含「无对应节点」", s7.reason.includes("无对应节点"), s7.reason);

  // 路径 2d：stages 节点清单空
  const s8 = paymentUnlockState(
    mkNode({ trigger: "stages", triggerStages: "水电工程" }),
    [],
    today
  );
  check("unlock: stages 节点清单空 → 锁", s8.unlocked === false, s8.reason);
  check("unlock: stages 节点清单空 reason 含「无对应节点」", s8.reason.includes("无对应节点"), s8.reason);

  // 路径 2e：主体四项部分未过
  const s9 = paymentUnlockState(
    mkNode({ trigger: "stages", triggerStages: "泥工工程,防水工程,地面工程,天花工程" }),
    [
      mkAccept("泥工工程", "passed"),
      mkAccept("防水工程", "passed"),
      mkAccept("地面工程", "returned"), // 未过
      mkAccept("天花工程", "passed"),
    ],
    today
  );
  check("unlock: 主体四项部分未过 → 锁", s9.unlocked === false, s9.reason);
  check("unlock: 主体四项 missing 含「地面工程」", s9.missing.includes("地面工程"), JSON.stringify(s9.missing));
  check("unlock: 主体四项 missing 仅 1 项", s9.missing.length === 1, JSON.stringify(s9.missing));

  // 路径 3：all 满足 → 解锁
  const s10 = paymentUnlockState(
    mkNode({ trigger: "all", triggerStages: "" }),
    [mkAccept("拆除工程", "passed"), mkAccept("水电工程", "passed")],
    today
  );
  check("unlock: all 满足 → 解锁", s10.unlocked === true, s10.reason);

  // 路径 3b：all 不满足（有非 passed）
  const s11 = paymentUnlockState(
    mkNode({ trigger: "all", triggerStages: "" }),
    [mkAccept("拆除工程", "passed"), mkAccept("水电工程", "submitted")],
    today
  );
  check("unlock: all 有未过节点 → 锁", s11.unlocked === false, s11.reason);
  check("unlock: all reason 含「尚缺 1 项」", s11.reason.includes("尚缺 1 项"), s11.reason);

  // 路径 3c：all 节点清单空
  const s12 = paymentUnlockState(
    mkNode({ trigger: "all", triggerStages: "" }),
    [],
    today
  );
  check("unlock: all 节点清单空 → 锁", s12.unlocked === false, s12.reason);
  check("unlock: all 节点清单空 reason 含「暂无验收节点」", s12.reason.includes("暂无验收节点"), s12.reason);

  // 日期优先：段同时有日期（未来）+ stages 不满足 → 日期原因优先
  const s13 = paymentUnlockState(
    mkNode({ trigger: "stages", triggerStages: "水电工程", unlocksAt: future }),
    [mkAccept("水电工程", "submitted")],
    today
  );
  check("unlock: 日期+stages 同时不满足 → 日期优先（锁）", s13.unlocked === false, s13.reason);
  check("unlock: 日期优先 reason 含「保修期未至」", s13.reason.includes("保修期未至"), s13.reason);
}

// ── payment: canMarkPaid 真值表 ────────────────────────────────
{
  const unlocked = { unlocked: true, reason: "", missing: [] };
  const locked = { unlocked: false, reason: "x", missing: [] };
  check("canMarkPaid: 解锁+未付 → true", canMarkPaid(unlocked, false) === true);
  check("canMarkPaid: 未解锁+未付 → false", canMarkPaid(locked, false) === false);
  check("canMarkPaid: 解锁+已付 → false", canMarkPaid(unlocked, true) === false);
  check("canMarkPaid: 未解锁+已付 → false", canMarkPaid(locked, true) === false);
}

// ── payment: paymentTriggerLabel 全覆盖 ────────────────────────
{
  check(
    "paymentTriggerLabel: none 无日期 → 签约即可收",
    paymentTriggerLabel(mkNode({ trigger: "none", unlocksAt: null })) === "签约即可收"
  );
  check(
    "paymentTriggerLabel: none 有日期 → 保修期满后收取",
    paymentTriggerLabel(mkNode({ trigger: "none", unlocksAt: future })) === "保修期满后收取"
  );
  check(
    "paymentTriggerLabel: stages 单工序 → 水电工程验收通过",
    paymentTriggerLabel(mkNode({ trigger: "stages", triggerStages: "水电工程" })) === "水电工程验收通过"
  );
  check(
    "paymentTriggerLabel: stages 多工序 → 主体四项工序验收通过",
    paymentTriggerLabel(mkNode({ trigger: "stages", triggerStages: "泥工工程,防水工程,地面工程,天花工程" })) === "主体四项工序验收通过"
  );
  check(
    "paymentTriggerLabel: all → 全部验收通过",
    paymentTriggerLabel(mkNode({ trigger: "all", triggerStages: "" })) === "全部验收通过"
  );
}

// ── types: categoriesFor 互斥无交集 ────────────────────────────
{
  const income = new Set(categoriesFor("income"));
  const expense = new Set(categoriesFor("expense"));
  check("categoriesFor: income 有 3 项", income.size === 3, `=${[...income].join(",")}`);
  check("categoriesFor: expense 有 3 项", expense.size === 3, `=${[...expense].join(",")}`);
  // 互斥：交集为空
  const intersect = [...income].filter((x) => expense.has(x));
  check("categoriesFor: 收入与支出互斥无交集", intersect.length === 0, `交集=${intersect.join(",")}`);
  check("categoriesFor: income 含 contract", income.has("contract"));
  check("categoriesFor: expense 含 material", expense.has("material"));
  check("categoriesFor: expense 含 other", expense.has("other"));
  check("categoriesFor: 未知 type → []", categoriesFor("xx").length === 0);
  check("RECORD_CATEGORIES: income 键存在", Array.isArray(RECORD_CATEGORIES.income));
  check("RECORD_CATEGORIES: expense 键存在", Array.isArray(RECORD_CATEGORIES.expense));
}

// ── status: label / tone 全覆盖 ────────────────────────────────
{
  check("RECORD_TYPE_LABEL: income=收入", RECORD_TYPE_LABEL.income === "收入");
  check("RECORD_TYPE_LABEL: expense=支出", RECORD_TYPE_LABEL.expense === "支出");
  check("recordTypeTone: income → accent", recordTypeTone("income") === "accent");
  check("recordTypeTone: expense → warning", recordTypeTone("expense") === "warning");

  check("CATEGORY_LABEL: 6 项齐全", Object.keys(CATEGORY_LABEL).length === 6);
  check("CATEGORY_LABEL: contract=合同款", CATEGORY_LABEL.contract === "合同款");
  check("CATEGORY_LABEL: labor=人工费", CATEGORY_LABEL.labor === "人工费");
  check("CATEGORY_TONE: contract → accent", CATEGORY_TONE.contract === "accent");
  check("CATEGORY_TONE: material → warning", CATEGORY_TONE.material === "warning");
  check("CATEGORY_TONE: other → neutral", CATEGORY_TONE.other === "neutral");

  check("PAYMENT_TRIGGER_LABEL: 3 键", Object.keys(PAYMENT_TRIGGER_LABEL).length === 3);
  check("PAYMENT_TRIGGER_LABEL: none=签约即可收", PAYMENT_TRIGGER_LABEL.none === "签约即可收");
  check("PAYMENT_TRIGGER_LABEL: all=全部验收通过", PAYMENT_TRIGGER_LABEL.all === "全部验收通过");

  // 所有 label 非空
  const allLabels = [
    ...Object.values(RECORD_TYPE_LABEL),
    ...Object.values(CATEGORY_LABEL),
    ...Object.values(PAYMENT_TRIGGER_LABEL),
  ];
  check("status: 所有 label 非空字符串", allLabels.every((s) => typeof s === "string" && s.length > 0));
}

// ── ledger: changeTotal（带符号，与 receivedTotal 的 safeAmount 口径不同）──────────
{
  // 空 / null → 0
  check("changeTotal: 空数组 → 0", changeTotal([]) === 0);
  check("changeTotal: null → 0", changeTotal(null) === 0);

  // 单正：+3200
  check("changeTotal: [3200] → 3200", changeTotal([{ amount: 3200 }]) === 3200);

  // 正负混合：3200 + (-1500) + 800 = 2500
  const mixed = [{ amount: 3200 }, { amount: -1500 }, { amount: 800 }];
  check("changeTotal: 正负混合 → 2500", changeTotal(mixed) === 2500, `= ${changeTotal(mixed)}`);

  // 含非有限值按 0：3200 + NaN + 800 = 4000（NaN 不破坏累加，按 0）
  const withNaN = [{ amount: 3200 }, { amount: NaN }, { amount: 800 }];
  check("changeTotal: NaN 按 0 → 4000", changeTotal(withNaN) === 4000, `= ${changeTotal(withNaN)}`);

  // 负净额：-1500 + -800 = -2300（带符号保留，不归零）
  const neg = [{ amount: -1500 }, { amount: -800 }];
  check("changeTotal: 负净额 → -2300", changeTotal(neg) === -2300, `= ${changeTotal(neg)}`);

  // 尾差 cent 预言机：0.1+0.2 = 0.3（浮点）
  const fp = [{ amount: 0.1 }, { amount: 0.2 }];
  check("changeTotal: 0.1+0.2 → 0.3（round2）", changeTotal(fp) === 0.3, `= ${changeTotal(fp)}`);
}

// ── ledger: changeWatch（5% 预警，严格大于）──────────────────
{
  // 阈值常量
  check("CHANGE_WATCH_RATIO: = 0.05", CHANGE_WATCH_RATIO === 0.05);

  // 恰好 == 5% → 不预警（严格大于）
  const exact5 = changeWatch(100000, 5000);
  check("changeWatch: == 5% → 不预警", exact5.warn === false, `warn=${exact5.warn} ratio=${exact5.ratio}`);
  check("changeWatch: == 5% → ratio=0.05", exact5.ratio === 0.05);

  // > 5% → 预警
  const over5 = changeWatch(100000, 5001);
  check("changeWatch: > 5% → 预警", over5.warn === true, `warn=${over5.warn}`);

  // 负变更不预警（减项即便绝对值大，也不触发）
  const negChange = changeWatch(100000, -8000);
  check("changeWatch: 负变更 → 不预警", negChange.warn === false, `warn=${negChange.warn}`);

  // 合同额 0 → 不预警、ratio null
  const zero = changeWatch(0, 1000);
  check("changeWatch: 合同额 0 → 不预警", zero.warn === false);
  check("changeWatch: 合同额 0 → ratio null", zero.ratio === null);

  // 合同额负 → 不预警、ratio null
  const negContract = changeWatch(-100, 1000);
  check("changeWatch: 合同额负 → 不预警", negContract.warn === false);
  check("changeWatch: 合同额负 → ratio null", negContract.ratio === null);

  // ratio 四位小数：3200/62000 = 0.0516129032... → 0.0516
  const p1 = changeWatch(62000, 3200);
  check("changeWatch: 3200/62000 → ratio 0.0516", p1.ratio === 0.0516, `= ${p1.ratio}`);

  // 超阈值实战（seed 001 62000 +3200）：3200 > 3100 → 预警
  check("changeWatch: seed 001 62000+3200 → 预警", p1.warn === true, `warn=${p1.warn}`);

  // 不超阈值实战（seed 002 160000 +2800）：2800 < 8000 → 不预警
  const p2 = changeWatch(160000, 2800);
  check("changeWatch: seed 002 160000+2800 → 不预警", p2.warn === false, `warn=${p2.warn}`);
  check("changeWatch: 2800/160000 → ratio 0.0175", p2.ratio === 0.0175, `= ${p2.ratio}`);
}

// ── 输出禁 emoji 自检（与 verify-quality 同一纪律）──
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

// 汇总被测函数返回的文案，断言无 emoji
const allText = [];
for (const r of results) allText.push(r.detail ?? "");
// 直接抽样关键中文文案
allText.push(
  ...Object.values(RECORD_TYPE_LABEL),
  ...Object.values(CATEGORY_LABEL),
  ...Object.values(PAYMENT_TRIGGER_LABEL)
);
// paymentUnlockState / paymentTriggerLabel 的 reason/label
allText.push(
  paymentUnlockState(mkNode({ trigger: "stages", triggerStages: "水电工程" }), [], today).reason,
  paymentTriggerLabel(mkNode({ trigger: "none", unlocksAt: future }))
);
const hasEmoji = EMOJI_RE.test(allText.join("\n"));
check("输出契约：不含任何 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n财务管控纯函数回归校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
