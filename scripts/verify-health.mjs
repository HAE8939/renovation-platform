/**
 * verify-health.mjs —— 项目健康度派生函数回归校验（只读，纯函数，不碰库）
 *
 * 为什么存在：M2-A 落了 `src/core/domain/health.ts` 四个纯函数
 * （overallProgress / scheduleLight / qualityLight / budgetLight），
 * 它们是驾驶舱三色灯与进度的唯一口径真源。本脚本把 §6 用例变成可重跑门禁：
 * 直接 import 生产 TS（Node 24 原生跑 .ts），再用独立预言机复算对照，
 * 并断言所有输出与函数返回值不含任何 emoji。
 *
 * 跑法：node scripts/verify-health.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const health = await import(
  pathToFileURL(join(ROOT, "src/core/domain/health.ts")).href
);
const { overallProgress, scheduleLight, qualityLight, budgetLight } = health;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

// 独立预言机：复算进度均值与四舍五入（与生产实现互证，口径漂移当场暴露）。
const oracleProgress = (tasks) =>
  tasks.length === 0
    ? 0
    : Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length);

const DAY = 1000 * 60 * 60 * 24;
const at = (iso) => new Date(iso);
const TODAY = at("2026-10-09T00:00:00.000Z"); // 与 STATUS.md 更新日一致，用例稳定

// ── overallProgress ──────────────────────────────────────────────
{
  const r = overallProgress([]);
  check("overallProgress: 空数组 → 0", r === 0, `返回 ${r}`);

  const tasks = [{ progress: 50 }, { progress: 100 }];
  const r2 = overallProgress(tasks);
  const o2 = oracleProgress(tasks);
  check("overallProgress: [{50},{100}] → 75", r2 === 75 && r2 === o2, `返回 ${r2}（预言机 ${o2}）`);

  // 四舍五入边界：1.5 → 2（Math.round 标准舍入）
  const r3 = overallProgress([{ progress: 1 }, { progress: 2 }]);
  check("overallProgress: 四舍五入边界 [{1},{2}] → 2", r3 === 2, `返回 ${r3}`);

  // 三数整除与小数舍入对照
  const r4 = overallProgress([{ progress: 10 }, { progress: 20 }, { progress: 30 }]);
  check("overallProgress: [{10},{20},{30}] → 20", r4 === 20, `返回 ${r4}`);
}

// ── scheduleLight ────────────────────────────────────────────────
{
  // 逾期（实际完工 > 计划完工）→ red
  const r = scheduleLight(
    { endDate: at("2026-11-30"), actualEndDate: at("2026-12-31"), progress: 50 },
    TODAY
  );
  check("scheduleLight: 实际超计划 → red", r === "red", `返回 ${r}`);

  // 剩 <=7 天 且 进度 < 80 → yellow
  const y = scheduleLight(
    { endDate: at("2026-10-12"), actualEndDate: null, progress: 79 },
    TODAY
  );
  check("scheduleLight: 剩 3 天 且 进度 79 → yellow", y === "yellow", `返回 ${y}`);

  // 同况 进度 >= 80 → green
  const g = scheduleLight(
    { endDate: at("2026-10-12"), actualEndDate: null, progress: 80 },
    TODAY
  );
  check("scheduleLight: 剩 3 天 但 进度 80 → green", g === "green", `返回 ${g}`);

  // endDate 缺失 → green（降级）
  const n = scheduleLight(
    { endDate: null, actualEndDate: null, progress: 10 },
    TODAY
  );
  check("scheduleLight: 计划完工缺失 → green（降级）", n === "green", `返回 ${n}`);

  // 充裕工期 且 进度低 → green
  const g2 = scheduleLight(
    { endDate: at("2027-06-01"), actualEndDate: null, progress: 20 },
    TODAY
  );
  check("scheduleLight: 余期充裕 且 进度低 → green", g2 === "green", `返回 ${g2}`);

  // 边界：剩正好 7 天 且 进度 79 → yellow
  const y7 = scheduleLight(
    { endDate: at("2026-10-16"), actualEndDate: null, progress: 79 },
    TODAY
  );
  check("scheduleLight: 剩正好 7 天 且 进度 79 → yellow", y7 === "yellow", `返回 ${y7}`);
}

// ── qualityLight ─────────────────────────────────────────────────
{
  const red = qualityLight({ openIssues: 3, pendingNodes: 0 });
  check("qualityLight: openIssues>0 → red", red === "red", `返回 ${red}`);

  const yellow = qualityLight({ openIssues: 0, pendingNodes: 2 });
  check("qualityLight: open=0 & pending>0 → yellow", yellow === "yellow", `返回 ${yellow}`);

  const green = qualityLight({ openIssues: 0, pendingNodes: 0 });
  check("qualityLight: 全 0 → green", green === "green", `返回 ${green}`);
}

// ── budgetLight ──────────────────────────────────────────────────
{
  // 超付 → red
  const red = budgetLight({ contractAmount: 100, changeTotal: 0, paidTotal: 101 });
  check("budgetLight: paid>total → red", red === "red", `返回 ${red}`);

  // 超过 85% → yellow
  const y = budgetLight({ contractAmount: 100, changeTotal: 0, paidTotal: 86 });
  check("budgetLight: paid=86% → yellow", y === "yellow", `返回 ${y}`);

  // 未超 85% → green
  const g = budgetLight({ contractAmount: 100, changeTotal: 0, paidTotal: 50 });
  check("budgetLight: paid=50% → green", g === "green", `返回 ${g}`);

  // 合同额未录入（total=0）哨兵 → green（不误报红）
  const s = budgetLight({ contractAmount: 0, changeTotal: 0, paidTotal: 0 });
  check("budgetLight: total=0 哨兵 → green", s === "green", `返回 ${s}`);

  // 含变更：total = contract + change，门槛按 total 计
  // 0.85 * 120 = 102；取严格大于（103）才落入 yellow。
  const y2 = budgetLight({ contractAmount: 100, changeTotal: 20, paidTotal: 103 });
  check("budgetLight: 含变更 paid>85% → yellow", y2 === "yellow", `返回 ${y2}`);
}

// ── 返回值契约：三个灯函数只能返回 green|yellow|red ──────────────
{
  const samples = [
    scheduleLight({ endDate: at("2027-01-01"), actualEndDate: null, progress: 50 }, TODAY),
    qualityLight({ openIssues: 0, pendingNodes: 0 }),
    budgetLight({ contractAmount: 100, changeTotal: 0, paidTotal: 0 }),
  ];
  const ok = samples.every((v) => v === "green" || v === "yellow" || v === "red");
  check("返回值契约：灯函数仅 green|yellow|red", ok, `采样 ${samples.join(",")}`);
}

// ── 输出禁 emoji 自检 ────────────────────────────────────────────
// 覆盖真实 emoji / 符号区间（dingbats ✓✗⚠、表情符号、Variation Selector 等）；
// 不含箭头 U+2190-21FF（箭头非 emoji，输出描述可用）。
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}

const rendered = out.join("\n");
const hasEmoji = EMOJI_RE.test(rendered);
check("输出契约：不含任何 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n项目健康度派生函数校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
