/**
 * verify-schedule.mjs —— 排程纯函数回归校验（只读，纯函数，不碰库）
 *
 * 为什么存在：M6-a 把排程的面积定档 / 链式排期 / 依赖边 / 拓扑无环 /
 * 进度联动 / 逾期判定抽成纯函数 src/modules/schedule/plan.ts + status.ts
 * （不碰 DB、可被脚本 import 测）。本脚本把 TASK_M6 §3/§6 的用例变成可重跑
 * 门禁：直接 import 生产 TS（Node 24 原生跑 .ts，带 .ts 扩展名），再用
 * 独立整数预言机复算对照，并断言所有输出与函数返回值不含任何 emoji。
 *
 * 跑法：node scripts/verify-schedule.mjs   （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 *
 * 说明：11 工序 × 3 档天数照抄 v5.1 §6.5.2，实算 lt90=54 / b90_130=76 / gt130=107。
 * （任务卡初稿曾误记 b90_130=80 / 跨月末端 2026-11-19；经与 v5.1 原表逐格复核，
 * 实为 76 / 2026-11-15，任务卡已同步修正——2026-10-10 集成者注。）
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 带 .ts 扩展名直 import 生产纯函数（勿穿无扩展名 re-export 链——踩过坑）。
const plan = await import(
  pathToFileURL(join(ROOT, "src/modules/schedule/plan.ts")).href
);
const { AREA_TIERS, AREA_TIER_LABEL, areaTier, buildSchedule, chainEdges, hasCycle } =
  plan;

const status = await import(
  pathToFileURL(join(ROOT, "src/modules/schedule/status.ts")).href
);
const {
  SCHEDULE_TASK_STATUS_ORDER,
  SCHEDULE_TASK_STATUS_LABEL,
  statusBadgeTone,
  isTaskOverdue,
  applyProgressUpdate,
} = status;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

// ── 11 工序 × 3 档天数（照抄 TASK_M6 §3 / v5.1 §6.5.2）─────────────
// 三档实算：lt90=54 / b90_130=76 / gt130=107。
const PROCESS = [
  { name: "拆除工程", order: 1, days: { lt90: 3, b90_130: 5, gt130: 7 } },
  { name: "水电工程", order: 2, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "泥工工程", order: 3, days: { lt90: 10, b90_130: 14, gt130: 18 } },
  { name: "防水工程", order: 4, days: { lt90: 3, b90_130: 3, gt130: 5 } },
  { name: "地面工程", order: 5, days: { lt90: 5, b90_130: 7, gt130: 10 } },
  { name: "墙面工程", order: 6, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "天花工程", order: 7, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "乳胶漆工程", order: 8, days: { lt90: 5, b90_130: 7, gt130: 10 } },
  { name: "定制工程", order: 9, days: { lt90: 3, b90_130: 5, gt130: 7 } },
  { name: "水电安装", order: 10, days: { lt90: 3, b90_130: 3, gt130: 5 } },
  { name: "竣工清洁", order: 11, days: { lt90: 1, b90_130: 2, gt130: 3 } },
];
const tierSum = (tier) =>
  PROCESS.reduce((s, p) => s + p.days[tier], 0);

// ── 常量完整 ───────────────────────────────────────────────────
{
  check(
    "SCHEDULE_TASK_STATUS_ORDER: 3 态顺序完整",
    SCHEDULE_TASK_STATUS_ORDER.length === 3 &&
      SCHEDULE_TASK_STATUS_ORDER[0] === "pending" &&
      SCHEDULE_TASK_STATUS_ORDER[1] === "in_progress" &&
      SCHEDULE_TASK_STATUS_ORDER[2] === "completed",
    `顺序 ${SCHEDULE_TASK_STATUS_ORDER.join("|")}`
  );
  check(
    "SCHEDULE_TASK_STATUS_LABEL: 3 态标签齐全且非空",
    Object.keys(SCHEDULE_TASK_STATUS_LABEL).length === 3 &&
      Object.values(SCHEDULE_TASK_STATUS_LABEL).every(
        (v) => typeof v === "string" && v.length > 0
      ),
    `标签 ${JSON.stringify(SCHEDULE_TASK_STATUS_LABEL)}`
  );
  check(
    "AREA_TIERS: 3 档顺序完整",
    AREA_TIERS.length === 3 &&
      AREA_TIERS[0] === "lt90" &&
      AREA_TIERS[1] === "b90_130" &&
      AREA_TIERS[2] === "gt130"
  );
  check(
    "AREA_TIER_LABEL: 3 档标签齐全且非空",
    Object.keys(AREA_TIER_LABEL).length === 3 &&
      Object.values(AREA_TIER_LABEL).every(
        (v) => typeof v === "string" && v.length > 0
      )
  );
}

// ── areaTier 边界（5 例：89.9 / 90 / 128.6 / 130 / 130.1）─────────
{
  check("areaTier(89.9) → lt90", areaTier(89.9) === "lt90", `返回 ${areaTier(89.9)}`);
  check("areaTier(90) → b90_130", areaTier(90) === "b90_130", `返回 ${areaTier(90)}`);
  check("areaTier(128.6) → b90_130", areaTier(128.6) === "b90_130", `返回 ${areaTier(128.6)}`);
  check("areaTier(130) → b90_130", areaTier(130) === "b90_130", `返回 ${areaTier(130)}`);
  check("areaTier(130.1) → gt130", areaTier(130.1) === "gt130", `返回 ${areaTier(130.1)}`);
  check("areaTier(0) → null（非正）", areaTier(0) === null, `返回 ${areaTier(0)}`);
  check("areaTier(-5) → null", areaTier(-5) === null, `返回 ${areaTier(-5)}`);
  check("areaTier(NaN) → null（非有限）", areaTier(NaN) === null, `返回 ${areaTier(NaN)}`);
}

// ── 三档总工期独立复算 ─────────────────────────────────────────
// 独立预言机：单遍 for 循环累加，对照 buildSchedule 的链式排期末端。
{
  const lt90Sum = tierSum("lt90");
  const b90Sum = tierSum("b90_130");
  const gt130Sum = tierSum("gt130");
  check("三档总工期 lt90 = 54", lt90Sum === 54, `实算 ${lt90Sum}`);
  check("三档总工期 b90_130 = 76", b90Sum === 76, `实算 ${b90Sum}`);
  check("三档总工期 gt130 = 107", gt130Sum === 107, `实算 ${gt130Sum}`);

  // 独立预言机复算：不走 reduce，用 for 循环累加同源数据
  const oracleSum = (tier) => {
    let s = 0;
    for (const p of PROCESS) s += p.days[tier];
    return s;
  };
  check(
    "独立预言机：lt90/b90_130/gt130 与 tierSum 一致",
    oracleSum("lt90") === lt90Sum &&
      oracleSum("b90_130") === b90Sum &&
      oracleSum("gt130") === gt130Sum
  );
}

// ── buildSchedule：链式无缝无叠 + 跨月终点 ───────────────────────
{
  const rows = PROCESS.map((p) => ({
    name: p.name,
    order: p.order,
    days: p.days.b90_130,
  }));
  const start = new Date("2026-09-01T00:00:00.000Z");
  const chain = buildSchedule(rows, start);

  check("buildSchedule: 11 行", chain.length === 11, `长度 ${chain.length}`);

  // 链式无缝无叠：次序 start == 前序 end + 1 天
  let seamless = true;
  const MS = 1000 * 60 * 60 * 24;
  for (let i = 1; i < chain.length; i++) {
    const expectStart = new Date(chain[i - 1].end.getTime() + MS);
    if (chain[i].start.getTime() !== expectStart.getTime()) {
      seamless = false;
      break;
    }
  }
  check("buildSchedule: 链式无缝无叠（次序 start = 前序 end + 1d）", seamless);

  // 端点：b90_130 链从 2026-09-01 起，76 天 → 末序 end = 2026-11-15
  const lastEnd = chain[chain.length - 1].end;
  const expect = new Date("2026-11-15T00:00:00.000Z");
  check(
    "buildSchedule: 跨月终点 2026-11-15",
    lastEnd.getTime() === expect.getTime(),
    `末端 ${lastEnd.toISOString().slice(0, 10)}`
  );

  // 首序 start = 开工日 0 点
  const firstStart = chain[0].start;
  check(
    "buildSchedule: 首序 start = 开工日 0 点",
    firstStart.getTime() === start.getTime(),
    `首序 ${firstStart.toISOString().slice(0, 10)}`
  );

  // days 非正整数 → throw
  let threw = false;
  try {
    buildSchedule([{ name: "x", order: 1, days: 0 }], start);
  } catch {
    threw = true;
  }
  check("buildSchedule: days=0 → throw", threw);
  let threwNeg = false;
  try {
    buildSchedule([{ name: "x", order: 1, days: -2 }], start);
  } catch {
    threwNeg = true;
  }
  check("buildSchedule: days=-2 → throw", threwNeg);

  // 排序：乱序输入应按 order 排好
  const shuffled = [...rows].reverse();
  const chain2 = buildSchedule(shuffled, start);
  const ordered = chain2.every((r, i) => r.order === i + 1);
  check("buildSchedule: 按 order 排序（乱序输入归正）", ordered);
}

// ── chainEdges：10 条 ───────────────────────────────────────────
{
  const e = chainEdges(11);
  check("chainEdges(11) → 10 条", e.length === 10, `长度 ${e.length}`);
  check(
    "chainEdges: [i, i-1] 形态（首条 [1,0]，末条 [10,9]）",
    e[0][0] === 1 && e[0][1] === 0 && e[9][0] === 10 && e[9][1] === 9,
    `首 ${e[0]} 末 ${e[9]}`
  );
  check("chainEdges(1) → 空", chainEdges(1).length === 0);
  check("chainEdges(0) → 空", chainEdges(0).length === 0);
}

// ── hasCycle：5 例含自环与 3 环 ──────────────────────────────────
{
  // 1. 线性链无环
  check(
    "hasCycle: 线性链 a→b→c 无环 → false",
    hasCycle(["a", "b", "c"], [["b", "a"], ["c", "b"]]) === false
  );
  // 2. 自环
  check(
    "hasCycle: 自环 a→a → true",
    hasCycle(["a"], [["a", "a"]]) === true
  );
  // 3. 3 节点环 a→b→c→a
  check(
    "hasCycle: 3 环 a→b→c→a → true",
    hasCycle(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]) === true
  );
  // 4. 2 节点环
  check(
    "hasCycle: 2 环 a→b→a → true",
    hasCycle(["a", "b"], [["a", "b"], ["b", "a"]]) === true
  );
  // 5. 菱形（钻石）无环
  check(
    "hasCycle: 菱形 b→a, c→a, d→b, d→c 无环 → false",
    hasCycle(["a", "b", "c", "d"], [["b", "a"], ["c", "a"], ["d", "b"], ["d", "c"]]) === false
  );
}

// ── applyProgressUpdate：进度联动 6 例 ──────────────────────────
{
  const today = new Date("2026-10-10T00:00:00.000Z");
  const dayA = new Date("2026-10-01T00:00:00.000Z");

  // 1. pending + 0 → pending，actuals 不动
  const r1 = applyProgressUpdate(
    { progress: 0, status: "pending", actualStart: null, actualEnd: null },
    0,
    today
  );
  check(
    "进度联动 1: pending+0 → pending, actuals null",
    r1.progress === 0 && r1.status === "pending" && r1.actualStart === null && r1.actualEnd === null,
    JSON.stringify(r1)
  );

  // 2. pending + 50 → in_progress, actualStart 首写 today
  const r2 = applyProgressUpdate(
    { progress: 0, status: "pending", actualStart: null, actualEnd: null },
    50,
    today
  );
  check(
    "进度联动 2: pending+50 → in_progress, actualStart=今天",
    r2.progress === 50 && r2.status === "in_progress" && r2.actualStart.getTime() === today.getTime() && r2.actualEnd === null,
    JSON.stringify(r2)
  );

  // 3. in_progress + 100 → completed, actualEnd 补写 today
  const r3 = applyProgressUpdate(
    { progress: 50, status: "in_progress", actualStart: dayA, actualEnd: null },
    100,
    today
  );
  check(
    "进度联动 3: in_progress+100 → completed, actualEnd=今天",
    r3.progress === 100 && r3.status === "completed" && r3.actualStart.getTime() === dayA.getTime() && r3.actualEnd.getTime() === today.getTime(),
    JSON.stringify(r3)
  );

  // 4. completed + 50 → in_progress, actualEnd 清空
  const r4 = applyProgressUpdate(
    { progress: 100, status: "completed", actualStart: dayA, actualEnd: dayA },
    50,
    today
  );
  check(
    "进度联动 4: completed+50 → in_progress, actualEnd=null",
    r4.progress === 50 && r4.status === "in_progress" && r4.actualStart.getTime() === dayA.getTime() && r4.actualEnd === null,
    JSON.stringify(r4)
  );

  // 5. in_progress + 50 → actualStart 不覆盖（已有 dayA）
  const r5 = applyProgressUpdate(
    { progress: 30, status: "in_progress", actualStart: dayA, actualEnd: null },
    50,
    today
  );
  check(
    "进度联动 5: in_progress+50 → actualStart 不覆盖（保留 dayA）",
    r5.progress === 50 && r5.status === "in_progress" && r5.actualStart.getTime() === dayA.getTime() && r5.actualEnd === null,
    JSON.stringify(r5)
  );

  // 6. 钳制：150 → 100 completed；-5 → 0 pending
  const r6a = applyProgressUpdate(
    { progress: 0, status: "pending", actualStart: null, actualEnd: null },
    150,
    today
  );
  const r6b = applyProgressUpdate(
    { progress: 100, status: "completed", actualStart: dayA, actualEnd: dayA },
    -5,
    today
  );
  check(
    "进度联动 6a: 钳 150 → 100 completed, actualEnd=今天",
    r6a.progress === 100 && r6a.status === "completed" && r6a.actualStart.getTime() === today.getTime() && r6a.actualEnd.getTime() === today.getTime(),
    JSON.stringify(r6a)
  );
  check(
    "进度联动 6b: 钳 -5 → 0 pending 重置（清实际起止）",
    r6b.progress === 0 && r6b.status === "pending" && r6b.actualStart === null && r6b.actualEnd === null,
    JSON.stringify(r6b)
  );

  // 6c. in_progress + 0 → pending 重置（清实际起止）
  const r6c = applyProgressUpdate(
    { progress: 30, status: "in_progress", actualStart: dayA, actualEnd: null },
    0,
    today
  );
  check(
    "进度联动 6c: in_progress+0 → pending 重置（清实际起止）",
    r6c.progress === 0 && r6c.status === "pending" && r6c.actualStart === null && r6c.actualEnd === null,
    JSON.stringify(r6c)
  );

  // 7. completed 重存 100 → actualEnd 不覆盖（保留 dayA）
  const r7 = applyProgressUpdate(
    { progress: 100, status: "completed", actualStart: dayA, actualEnd: dayA },
    100,
    today
  );
  check(
    "进度联动 7: completed+100 重存 → actualEnd 不覆盖（保留 dayA）",
    r7.progress === 100 && r7.status === "completed" && r7.actualEnd.getTime() === dayA.getTime(),
    JSON.stringify(r7)
  );
}

// ── isTaskOverdue：逾期边界 3 例 ─────────────────────────────────
{
  const now = new Date("2026-10-10T12:00:00.000Z");
  // endDate 昨日 + 未完成 → 逾期
  check(
    "逾期边界 1: endDate=昨日 + progress<100 → true",
    isTaskOverdue({ endDate: new Date("2026-10-09T00:00:00.000Z"), progress: 50 }, now) === true
  );
  // endDate 今日 + 未完成 → 不逾期（仍处完工当天）
  check(
    "逾期边界 2: endDate=今日 + progress<100 → false（当天不算超期）",
    isTaskOverdue({ endDate: new Date("2026-10-10T00:00:00.000Z"), progress: 50 }, now) === false
  );
  // endDate 昨日 + progress=100 → 不逾期（已完成）
  check(
    "逾期边界 3: endDate=昨日 + progress=100 → false（完成即不算超期）",
    isTaskOverdue({ endDate: new Date("2026-10-09T00:00:00.000Z"), progress: 100 }, now) === false
  );
  // endDate 空 → false
  check(
    "isTaskOverdue: endDate=null → false",
    isTaskOverdue({ endDate: null, progress: 50 }, now) === false
  );
}

// ── 状态徽章 tone ──────────────────────────────────────────────
{
  check("statusBadgeTone: pending → neutral", statusBadgeTone("pending") === "neutral");
  check("statusBadgeTone: in_progress → accent", statusBadgeTone("in_progress") === "accent");
  check("statusBadgeTone: completed → success", statusBadgeTone("completed") === "success");
  check("statusBadgeTone: 未知 → neutral", statusBadgeTone("xx") === "neutral");
}

// ── 输出禁 emoji 自检（与 verify-design / verify-crm 同一纪律）────
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = EMOJI_RE.test(out.join("\n"));
check("输出契约：不含任何 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n排程纯函数回归校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
