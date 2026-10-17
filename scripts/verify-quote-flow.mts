/**
 * verify-quote-flow.mts —— 报价【确认/锁定/税率】写路径的端到端集成门禁（隔离库，不碰 dev.db）。
 *
 * 为什么存在：M15 断点③把 status(draft/confirmed/locked) + lockedAt + taxRate 的写入路径
 * 第一次接通——setQuoteStatus / updateQuoteTaxRate / saveQuoteItems 的草稿门控都是真 DB
 * 事务行为，纯函数门禁（verify-quote.mjs 只测 computeTotals 等）覆盖不到，必须端到端集成。
 *
 * 隔离库：_scratch/quote-flow.db（run-gates 会 prisma migrate reset 自动建表 + seed）。
 *
 * 运行配方：
 *   DATABASE_URL="file:../_scratch/quote-flow.db" npx prisma migrate reset --force --skip-generate
 *   DATABASE_URL="file:../_scratch/quote-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-quote-flow.mts
 * 退出码 0=全过，1=有 FAIL。
 */
import { prisma } from "@/core/db";
import {
  QuoteStatusError,
  saveQuoteItems,
  setQuoteStatus,
  updateQuoteTaxRate,
} from "@/modules/budget/server/quote";
import { ValidationError } from "@/core/domain/projects";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

/** 断言某操作抛指定错误类且消息含子串。 */
async function throwsWith(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
  includes: string
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof cls && (e as Error).message.includes(includes);
  }
}

const oneRow = [
  { id: "x1", categoryName: "水电", code: "01.01", name: "强电改造", unit: "项", unitPrice: 1000, quantity: 2, materials: "", sop: "" },
];

async function main() {
  const project = await prisma.project.findFirst({ where: { code: "RP-2026-001" } });
  if (!project) throw new Error("RP-2026-001 不存在（先跑 seed）");
  const pid = project.id;

  // 前置：确保存在 draft 报价（seed 建项目即建草稿报价）
  let quote = await prisma.budgetQuote.findUnique({ where: { projectId: pid } });
  if (!quote) {
    await saveQuoteItems(pid, oneRow); // 触发 ensureQuote 建草稿 + 一行明细
    quote = await prisma.budgetQuote.findUnique({ where: { projectId: pid } });
  }
  chk("前置：报价存在", !!quote);
  await prisma.budgetQuote.update({ where: { projectId: pid }, data: { status: "draft", lockedAt: null } });
  chk("重置为 draft 起点", (await prisma.budgetQuote.findUnique({ where: { projectId: pid } }))?.status === "draft");

  // ── 1) 税率编辑（draft 放行 + 边界拒绝）──────────────────────
  await updateQuoteTaxRate(pid, 0.05);
  chk("税率 0.05 写入", (await prisma.budgetQuote.findUnique({ where: { projectId: pid } }))?.taxRate === 0.05);
  chk("税率 >1 被拒", await throwsWith(() => updateQuoteTaxRate(pid, 1.5), QuoteStatusError, "0 到 1"));
  chk("税率 负数被拒", await throwsWith(() => updateQuoteTaxRate(pid, -0.1), QuoteStatusError, "0 到 1"));
  chk("税率 NaN 被拒", await throwsWith(() => updateQuoteTaxRate(pid, Number.NaN), QuoteStatusError, "数字"));
  await updateQuoteTaxRate(pid, 0.03); // 复位标准值

  // ── 2) 状态转移合法性 ────────────────────────────────────────
  chk("draft→locked 非法被拒", await throwsWith(() => setQuoteStatus(pid, "locked"), QuoteStatusError, "不允许的状态转移"));
  const r1 = await setQuoteStatus(pid, "confirmed");
  chk("draft→confirmed 合法", r1.before === "draft" && r1.after === "confirmed");
  chk("confirmed 落库", (await prisma.budgetQuote.findUnique({ where: { projectId: pid } }))?.status === "confirmed");

  // ── 3) 非 draft 写侧门控：明细与税率均拒 ─────────────────────
  chk("confirmed 下改明细被拒", await throwsWith(() => saveQuoteItems(pid, oneRow), ValidationError, "不可编辑"));
  chk("confirmed 下改税率被拒", await throwsWith(() => updateQuoteTaxRate(pid, 0.08), QuoteStatusError, "不可改税率"));

  // ── 4) 退回草稿可再编辑 ──────────────────────────────────────
  const r2 = await setQuoteStatus(pid, "draft");
  chk("confirmed→draft 退回合法", r2.before === "confirmed" && r2.after === "draft");
  await saveQuoteItems(pid, oneRow); // 不抛 = 放行
  chk("退回草稿后明细可再保存", true);
  await updateQuoteTaxRate(pid, 0.06);
  chk("退回草稿后税率可再改", (await prisma.budgetQuote.findUnique({ where: { projectId: pid } }))?.taxRate === 0.06);
  await updateQuoteTaxRate(pid, 0.03);

  // ── 5) 锁定：写 lockedAt 且为终态 ────────────────────────────
  await setQuoteStatus(pid, "confirmed");
  const r3 = await setQuoteStatus(pid, "locked");
  chk("confirmed→locked 合法", r3.before === "confirmed" && r3.after === "locked");
  const locked = await prisma.budgetQuote.findUnique({ where: { projectId: pid } });
  chk("锁定写入 lockedAt 非空", !!locked?.lockedAt);
  chk("locked 终态：locked→draft 非法", await throwsWith(() => setQuoteStatus(pid, "draft"), QuoteStatusError, "不允许"));
  chk("locked 终态：locked→confirmed 非法", await throwsWith(() => setQuoteStatus(pid, "confirmed"), QuoteStatusError, "不允许"));
  chk("locked 下改明细被拒", await throwsWith(() => saveQuoteItems(pid, oneRow), ValidationError, "锁定"));
  chk("locked 下改税率被拒", await throwsWith(() => updateQuoteTaxRate(pid, 0.09), QuoteStatusError, "不可改税率"));

  // ── 6) 幽灵项目：无报价时状态/税率写入被拒 ───────────────────
  chk(
    "无报价项目改状态被拒",
    await throwsWith(() => setQuoteStatus("no-such-project", "confirmed"), QuoteStatusError, "报价不存在")
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
