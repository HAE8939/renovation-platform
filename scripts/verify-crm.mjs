/**
 * verify-crm.mjs —— 签约客户归并纯函数回归校验（只读，纯函数，不碰库）
 *
 * 为什么存在：M3-d1 把“签约按手机号归并 Client”的归并决策抽成纯函数
 * src/modules/crm/server/leadMatch.ts（不碰 DB、可被脚本 import 测）。
 * 本脚本把 TASK_M3_CRM §4 的归并用例变成可重跑门禁：直接 import 生产 TS
 * （Node 24 原生跑 .ts），再用独立预言机复算对照。
 *
 * 跑法：node scripts/verify-crm.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const leadMatch = await import(
  pathToFileURL(join(ROOT, "src/modules/crm/server/leadMatch.ts")).href
);
const { normalizePhone, pickClientByPhone } = leadMatch;

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}

/* ── normalizePhone ─────────────────────────────────────────────── */
{
  // 三种本地写法归一后应相等（去空格、连字符、仅留数字）
  const a = normalizePhone("139-0000-0001");
  const b = normalizePhone(" 13900000001 ");
  const c = normalizePhone("139 0000 0001");
  check("normalizePhone: 三种本地写法归一相等", a === b && b === c && a === "13900000001",
    `“139-0000-0001”→${a} / “ 13900000001 ”→${b} / “139 0000 0001”→${c}`);

  // 空 / null / 非数字 → null
  check("normalizePhone: 空串 → null", normalizePhone("") === null, "返回 null");
  check("normalizePhone: null → null", normalizePhone(null) === null, "返回 null");
  check("normalizePhone: undefined → null", normalizePhone(undefined) === null, "返回 null");
  check("normalizePhone: 纯非数字(abc-) → null", normalizePhone("abc-") === null, "返回 null");
}

/* ── pickClientByPhone ──────────────────────────────────────────── */
{
  const clients = [
    { id: "C1", phone: "139-0000-0001" },
    { id: "C2", phone: "138 0000 0002" },
    { id: "C3", phone: null }, // 空号客户：绝不能误配
  ];

  // 命中（带分隔符的查询号应归一匹配）
  const hit = pickClientByPhone(clients, "139 0000 0001");
  check("pickClientByPhone: 命中返回正确 id", hit !== null && hit.id === "C1",
    hit ? `命中 ${hit.id}` : "未命中");

  // 无匹配 → null
  const miss = pickClientByPhone(clients, "137-0000-0009");
  check("pickClientByPhone: 无匹配 → null", miss === null, miss ? `误命中 ${miss.id}` : "返回 null");

  // phone=null 查询 → null（不把空号误配到 phone 为 null 的客户 C3）
  const nullPhone = pickClientByPhone(clients, null);
  check("pickClientByPhone: phone=null 查询 → null（不误配空号客户）",
    nullPhone === null, nullPhone ? `误命中 ${nullPhone.id}` : "返回 null");

  // 空串查询 → null（归一后为空，同 null 处理）
  const empty = pickClientByPhone(clients, "");
  check("pickClientByPhone: 空串查询 → null（不误配空号客户）",
    empty === null, empty ? `误命中 ${empty.id}` : "返回 null");

  // 用未归一化号也能命中（归一在内部完成）
  const hit2 = pickClientByPhone(clients, "138-0000-0002");
  check("pickClientByPhone: 未归一化查询号命中 C2", hit2 !== null && hit2.id === "C2",
    hit2 ? `命中 ${hit2.id}` : "未命中");
}

/* ── 阶段推进纯函数（stages.ts）：nextStage + §4-14 canGenericAdvance ── */
{
  const stages = await import(pathToFileURL(join(ROOT, "src/modules/crm/stages.ts")).href);
  const { LEAD_STAGE_ORDER, nextStage, canGenericAdvance } = stages;
  const J = (x) => JSON.stringify(x);

  check("LEAD_STAGE_ORDER: 五阶段有序",
    J([...LEAD_STAGE_ORDER]) === J(["leads", "contacted", "confirmed", "quoted", "signed"]),
    J([...LEAD_STAGE_ORDER]));

  check("nextStage: 逐级向前一格",
    nextStage("leads") === "contacted" &&
    nextStage("contacted") === "confirmed" &&
    nextStage("confirmed") === "quoted" &&
    nextStage("quoted") === "signed");
  check("nextStage: 末态 signed → null", nextStage("signed") === null);
  check("nextStage: 未知阶段 → null", nextStage("bogus") === null);

  // §4-14 收紧核心：quoted→signed 不走通用推进（须经“签约建项”）；余三格可通用推进；末态不可。
  check("canGenericAdvance: leads/contacted/confirmed 可通用推进",
    canGenericAdvance("leads") === true &&
    canGenericAdvance("contacted") === true &&
    canGenericAdvance("confirmed") === true);
  check("canGenericAdvance: quoted 不可（其下一阶段是 signed，须走签约建项）",
    canGenericAdvance("quoted") === false);
  check("canGenericAdvance: signed 末态不可", canGenericAdvance("signed") === false);
  check("canGenericAdvance: 与 nextStage 一致——凡下一阶段为 signed 或 null 即不可通用推进",
    LEAD_STAGE_ORDER.every((s) => {
      const n = nextStage(s);
      return canGenericAdvance(s) === (n !== null && n !== "signed");
    }));
}

/* ── 输出禁 emoji 自检（与 verify-health 保持同一纪律）─────────── */
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = EMOJI_RE.test(out.join("\n"));
check("输出契约：不含任何 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n签约归并纯函数校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
