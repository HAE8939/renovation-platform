/**
 * verify-design.mjs —— 设计任务状态机与返修率纯函数回归校验（只读，纯函数，不碰库）
 *
 * 为什么存在：M5-c 把设计任务审核状态机（canReview / nextStatusAfterReview /
 * assertReviewTransition）与返修率（reworkRate / avgReworkRounds）抽成纯函数
 * src/modules/design/status.ts + src/modules/design/metrics.ts（不碰 DB、可被脚本
 * import 测）。本脚本把 TASK_M5 §1/§4-M5-c 的用例变成可重跑门禁：直接 import 生产
 * TS（Node 24 原生跑 .ts，带 .ts 扩展名），再用独立整数预言机复算对照，并断言
 * 所有输出与函数返回值不含任何 emoji。
 *
 * 跑法：node scripts/verify-design.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 带 .ts 扩展名直 import 生产纯函数（勿穿无扩展名 re-export 链——踩过坑）。
const status = await import(
  pathToFileURL(join(ROOT, "src/modules/design/status.ts")).href
);
const {
  DESIGN_TASK_STATUS_ORDER,
  DESIGN_TASK_STATUS_LABEL,
  canReview,
  canSubmit,
  canAssign,
  statusAfterAssign,
  nextStatusAfterReview,
  assertReviewTransition,
} = status;

const metrics = await import(
  pathToFileURL(join(ROOT, "src/modules/design/metrics.ts")).href
);
const { reworkRate, avgReworkRounds } = metrics;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

// ── 状态常量完整 ───────────────────────────────────────────────
{
  check(
    "DESIGN_TASK_STATUS_ORDER: 5 态顺序完整",
    DESIGN_TASK_STATUS_ORDER.length === 5 &&
      DESIGN_TASK_STATUS_ORDER[0] === "pending" &&
      DESIGN_TASK_STATUS_ORDER[1] === "assigned" &&
      DESIGN_TASK_STATUS_ORDER[2] === "submitted" &&
      DESIGN_TASK_STATUS_ORDER[3] === "revisions" &&
      DESIGN_TASK_STATUS_ORDER[4] === "approved",
    `顺序 ${DESIGN_TASK_STATUS_ORDER.join("|")}`
  );

  const labelKeys = Object.keys(DESIGN_TASK_STATUS_LABEL).sort();
  const expected = [...DESIGN_TASK_STATUS_ORDER].sort();
  check(
    "DESIGN_TASK_STATUS_LABEL: 5 态标签齐全且非空",
    labelKeys.length === 5 &&
      expected.every((k) => labelKeys.includes(k)) &&
      Object.values(DESIGN_TASK_STATUS_LABEL).every(
        (v) => typeof v === "string" && v.length > 0
      ),
    `标签 ${JSON.stringify(DESIGN_TASK_STATUS_LABEL)}`
  );
}

// ── canReview：仅 submitted 真 ─────────────────────────────────
{
  check("canReview: submitted → true", canReview("submitted") === true, "应可审核");
  check("canReview: approved → false", canReview("approved") === false, "收尾态不可审");
  check("canReview: revisions → false", canReview("revisions") === false, "需先再提交");
  check("canReview: pending → false", canReview("pending") === false, "尚未提交");
  check("canReview: assigned → false", canReview("assigned") === false, "尚未提交");
}

// ── canSubmit 回归：approved 假、revisions 真 ──────────────────
{
  check(
    "canSubmit: approved → false（收尾态不可提交）",
    canSubmit("approved") === false
  );
  check(
    "canSubmit: revisions → true（返修可再提交）",
    canSubmit("revisions") === true
  );
}

// ── nextStatusAfterReview ─────────────────────────────────────
{
  const a = nextStatusAfterReview(true);
  check("nextStatusAfterReview(true) → approved", a === "approved", `返回 ${a}`);
  const b = nextStatusAfterReview(false);
  check("nextStatusAfterReview(false) → revisions", b === "revisions", `返回 ${b}`);
}

// ── assertReviewTransition ─────────────────────────────────────
{
  let legal1 = false;
  try {
    assertReviewTransition("submitted", "approved");
    legal1 = true;
  } catch {
    legal1 = false;
  }
  check("assertReviewTransition: submitted→approved 合法不抛", legal1, legal1 ? "通过" : "误抛错");

  let legal2 = false;
  try {
    assertReviewTransition("submitted", "revisions");
    legal2 = true;
  } catch {
    legal2 = false;
  }
  check("assertReviewTransition: submitted→revisions 合法不抛", legal2, legal2 ? "通过" : "误抛错");

  let illegal1 = false;
  try {
    assertReviewTransition("approved", "revisions");
  } catch {
    illegal1 = true;
  }
  check("assertReviewTransition: approved→revisions 非法抛错", illegal1, illegal1 ? "已抛错" : "未抛错");

  let illegal2 = false;
  try {
    assertReviewTransition("revisions", "approved");
  } catch {
    illegal2 = true;
  }
  check("assertReviewTransition: revisions→approved 非法抛错", illegal2, illegal2 ? "已抛错" : "未抛错");

  let illegal3 = false;
  try {
    assertReviewTransition("pending", "approved");
  } catch {
    illegal3 = true;
  }
  check("assertReviewTransition: pending→approved 非法抛错", illegal3, illegal3 ? "已抛错" : "未抛错");
}

// ── reworkRate 边界 ────────────────────────────────────────────
{
  check("reworkRate: 空数组 → 0", reworkRate([]) === 0, `返回 ${reworkRate([])}`);
  check(
    "reworkRate: 无提交任务（submissions 全空）→ 0",
    reworkRate([{ submissions: [] }]) === 0
  );
  check(
    "reworkRate: 无退回 → 0",
    reworkRate([{ submissions: [{ result: "approved" }] }]) === 0
  );
  check(
    "reworkRate: 全退回 → 1",
    reworkRate([{ submissions: [{ result: "rejected" }] }]) === 1
  );
  check(
    "reworkRate: 单任务多次退回仍计 1（按任务占比非按次数）",
    reworkRate([{ submissions: [{ result: "rejected" }, { result: "rejected" }] }]) === 1
  );
  const half = reworkRate([
    { submissions: [{ result: "approved" }] },
    { submissions: [{ result: "rejected" }] },
  ]);
  check("reworkRate: 1/2 退回 → 0.5", half === 0.5, `返回 ${half}`);
}

// ── avgReworkRounds ────────────────────────────────────────────
{
  check("avgReworkRounds: 空数组 → 0", avgReworkRounds([]) === 0);
  const single = avgReworkRounds([
    { submissions: [{ result: "rejected" }, { result: "rejected" }] },
  ]);
  check("avgReworkRounds: 单任务 2 次退回 → 2", single === 2, `返回 ${single}`);
  const mixed = avgReworkRounds([
    { submissions: [{ result: "approved" }] },
    { submissions: [{ result: "rejected" }, { result: "pending" }] },
    { submissions: [{ result: "rejected" }, { result: "rejected" }, { result: "approved" }] },
  ]);
  // Σrejected = 0 + 1 + 2 = 3；有提交任务数 = 3；3/3 = 1
  check("avgReworkRounds: 混合 3 任务 → 1", mixed === 1, `返回 ${mixed}`);
}

// ── 独立整数预言机复算（与生产实现走不同算法路径互证）──────────────
// 用单遍循环 + 计数器复算，对照生产里的 filter/some/reduce 路径。
const oracleReworkRate = (tasks) => {
  let withSub = 0;
  let withReject = 0;
  for (const t of tasks) {
    const subs = t.submissions || [];
    if (subs.length === 0) continue;
    withSub++;
    let hasReject = false;
    for (const s of subs) {
      if (s.result === "rejected") {
        hasReject = true;
        break;
      }
    }
    if (hasReject) withReject++;
  }
  return withSub === 0 ? 0 : withReject / withSub;
};

const oracleAvgReworkRounds = (tasks) => {
  let withSub = 0;
  let totalRejected = 0;
  for (const t of tasks) {
    const subs = t.submissions || [];
    if (subs.length === 0) continue;
    withSub++;
    for (const s of subs) {
      if (s.result === "rejected") totalRejected++;
    }
  }
  return withSub === 0 ? 0 : totalRejected / withSub;
};

{
  const cases = [
    [],
    [{ submissions: [] }],
    [{ submissions: [{ result: "approved" }] }],
    [{ submissions: [{ result: "rejected" }] }],
    [{ submissions: [{ result: "rejected" }, { result: "rejected" }] }],
    [
      { submissions: [{ result: "approved" }] },
      { submissions: [{ result: "rejected" }] },
    ],
    [
      { submissions: [{ result: "approved" }] },
      { submissions: [{ result: "rejected" }, { result: "pending" }] },
      { submissions: [{ result: "rejected" }, { result: "rejected" }, { result: "approved" }] },
      { submissions: [] },
    ],
  ];
  let allMatchRate = true;
  let allMatchRounds = true;
  for (const c of cases) {
    if (reworkRate(c) !== oracleReworkRate(c)) allMatchRate = false;
    if (avgReworkRounds(c) !== oracleAvgReworkRounds(c)) allMatchRounds = false;
  }
  check("独立预言机：reworkRate 与实现一致（7 组用例）", allMatchRate);
  check("独立预言机：avgReworkRounds 与实现一致（7 组用例）", allMatchRounds);
}

// ── canAssign（M5-e 指派门控）───────────────────────────────────
{
  check("canAssign: pending → true（待分配可指派）", canAssign("pending") === true);
  check("canAssign: assigned → true（可改派）", canAssign("assigned") === true);
  check("canAssign: revisions → true（返修可改派）", canAssign("revisions") === true);
  check("canAssign: submitted → false（已提交待审不可指派）", canAssign("submitted") === false);
  check("canAssign: approved → false（收尾态不可指派）", canAssign("approved") === false);
}

// ── statusAfterAssign（指派后状态：仅待分配推进，其余保持原态）──────
{
  check("statusAfterAssign: pending → assigned", statusAfterAssign("pending") === "assigned");
  check("statusAfterAssign: assigned → assigned（改派不重置态）", statusAfterAssign("assigned") === "assigned");
  check("statusAfterAssign: revisions → revisions（改派不改结论）", statusAfterAssign("revisions") === "revisions");
}

// ── 输出禁 emoji 自检（与 verify-crm / verify-health 同一纪律）────
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = EMOJI_RE.test(out.join("\n"));
check("输出契约：不含任何 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n设计任务状态机与返修率校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
