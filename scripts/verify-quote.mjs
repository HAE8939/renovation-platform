/**
 * verify-quote.mjs —— 报价金额口径回归校验（只读，不改库）
 *
 * 为什么存在：M1b 的报价编辑器会直接改 unitPrice / quantity / 行序，
 * 金额一旦算错就是给客户看的钱数。M1a 只做过一次手算核对，不可重复执行。
 * 本脚本把那次手算变成可重跑的门禁，并且**直接 import 生产代码**
 * src/modules/budget/lib/quote.ts（Node 24 原生可跑 TS），
 * 再独立用「整数分」复算做对照 —— 两边不一致就是口径漂移，当场暴露。
 *
 * 跑法：node scripts/verify-quote.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无新增。需要 prisma generate 已执行过、.env 指向可读的 dev.db。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { PrismaClient } = await import("@prisma/client");
const quote = await import(
  pathToFileURL(join(ROOT, "src/core/domain/pricing.ts")).href
);

const prisma = new PrismaClient();

const results = [];
let failed = 0;
function check(level, name, ok, detail = "") {
  results.push({ level, name, ok, detail });
  if (!ok) failed++;
}
const cny = (n) =>
  `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── 独立预言机：全程整数「分」，不复用生产代码的 round2 ─────────────
   业务假设：单价 2 位小数、数量 2 位小数（装修报价的实际输入精度）。 */
const toCents = (x) => Math.round(x * 100);
const lineCents = (unitPrice, quantity) =>
  Math.round((toCents(unitPrice) * toCents(quantity)) / 100);
const centsToYuan = (c) => c / 100;

/* ── 静态检查：金额算法必须只有一处 ──────────────────────────────── */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const ORACLE = join(ROOT, "src", "core", "domain", "pricing.ts");
const strays = [];
for (const f of walk(join(ROOT, "src"))) {
  if (resolve(f) === resolve(ORACLE)) continue;
  const src = readFileSync(f, "utf8");
  if (/unitPrice\s*\*\s*quantity|quantity\s*\*\s*unitPrice/.test(src)) {
    strays.push(f.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
  }
}
check(
  "hard",
  "单一口径：core/domain/pricing.ts 之外不得出现 unitPrice×quantity",
  strays.length === 0,
  strays.length ? `发现第二处算法：${strays.join(", ")}` : "仅 core/domain/pricing.ts 一处"
);

/* ── 主校验：逐报价单 ────────────────────────────────────────────── */
const quotes = await prisma.budgetQuote.findMany({
  include: { items: true, project: { include: { client: true } } },
  orderBy: { createdAt: "asc" },
});

if (quotes.length === 0) {
  check("hard", "存在可校验的报价单", false, "库里 0 张报价单，先跑 pnpm prisma db seed");
} else {
  check("hard", "存在可校验的报价单", true, `共 ${quotes.length} 张`);
}

/* 快照契约：QuoteItem 不得持有任何指向 CatalogItem 的引用列（表结构级防退化） */
const itemCols = await prisma.$queryRawUnsafe("PRAGMA table_info(quote_items)");
const refCols = itemCols
  .map((c) => c.name)
  .filter((n) => /catalog/i.test(n) || /_?catalogItem/i.test(n));
check(
  "hard",
  "快照契约：quote_items 无 Catalog 引用列",
  refCols.length === 0,
  refCols.length
    ? `出现引用列：${refCols.join(", ")} —— 违反 AGENTS §5 快照语义（改模板不得回溯历史报价）`
    : `${itemCols.length} 列，全部为快照字段`
);

for (const q of quotes) {
  const tag = `${q.project?.code ?? "?"} · ${q.project?.name ?? "?"}`;
  const items = q.items;

  /* 1. 数据完整性（编辑器最容易写坏的地方） */
  const badNums = items.filter(
    (i) =>
      !Number.isFinite(i.unitPrice) ||
      !Number.isFinite(i.quantity) ||
      i.unitPrice < 0 ||
      i.quantity < 0
  );
  check("hard", `${tag}｜金额数量非负且有限`, badNums.length === 0,
    badNums.length ? `异常行：${badNums.map((i) => i.code || i.id).join(", ")}` : `${items.length} 行`);

  const empties = items.filter((i) => !i.categoryName || !i.code || !i.name || !i.unit);
  check("hard", `${tag}｜快照字段完整（科目/编号/名称/单位）`, empties.length === 0,
    empties.length ? `${empties.length} 行缺快照字段` : "全部有值");

  const orders = items.map((i) => i.order);
  const dupOrders = orders.filter((o, idx) => orders.indexOf(o) !== idx);
  check("hard", `${tag}｜行 order 在本单内唯一（排序落库的前提）`, dupOrders.length === 0,
    dupOrders.length ? `重复 order：${[...new Set(dupOrders)].join(", ")}` : "无重复");

  /* 2. 逐行：生产口径 vs 整数分预言机 */
  let worstLine = { delta: 0, code: "" };
  for (const it of items) {
    const appVal = quote.lineTotal(it.unitPrice, it.quantity);
    const oracleVal = centsToYuan(lineCents(it.unitPrice, it.quantity));
    const delta = Math.abs(appVal - oracleVal);
    if (delta > worstLine.delta) worstLine = { delta, code: it.code, appVal, oracleVal };
  }
  check("hard", `${tag}｜每行小计 = 单价×数量（精确到分）`, worstLine.delta < 0.005,
    worstLine.delta < 0.005 ? `${items.length} 行零偏差` : `行 ${worstLine.code} 偏差 ${worstLine.delta.toFixed(4)}`);

  /* 3. 汇总链路：direct → tax → grand → unitCost */
  const appDirect = quote.round2(
    items.reduce((s, i) => s + quote.lineTotal(i.unitPrice, i.quantity), 0)
  );
  const exactDirectCents = items.reduce((s, i) => s + lineCents(i.unitPrice, i.quantity), 0);
  const appTax = quote.round2(appDirect * q.taxRate);
  const appGrand = quote.round2(appDirect + appTax);
  const area = q.project?.area ?? 0;
  const appUnitCost = area > 0 ? quote.round2(appGrand / area) : null;

  const totals = quote.computeTotals(items, q.taxRate, area);
  const eq = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005;
  check("hard", `${tag}｜computeTotals 与逐项复算一致`,
    eq(totals.directSubtotal, appDirect) && eq(totals.tax, appTax) &&
    eq(totals.grand, appGrand) && eq(totals.unitCost, appUnitCost),
    `直接费 ${cny(totals.directSubtotal)} / 税 ${cny(totals.tax)} / 总价 ${cny(totals.grand)} / 单方 ${totals.unitCost === null ? "—" : cny(totals.unitCost)}`);

  check("hard", `${tag}｜税 = 直接费×税率(${(q.taxRate * 100).toFixed(1)}%)`, eq(totals.tax, appTax));
  check("hard", `${tag}｜总价 = 直接费 + 税`, eq(totals.grand, appGrand));
  check("hard", `${tag}｜单方造价 = 总价 ÷ 面积${area > 0 ? `(${area}㎡)` : "(面积 0 → 应为 —)"}`,
    eq(totals.unitCost, appUnitCost));

  /* 4. 分组小计必须等于行合计（编辑器改行序后最容易漏的一组） */
  const groups = quote.groupByCategory(items);
  const groupSum = quote.round2(groups.reduce((s, g) => s + g.subtotal, 0));
  const groupedItemCount = groups.reduce((s, g) => s + g.items.length, 0);
  check("hard", `${tag}｜分科目小计之和 = 直接费（不漏组不重复）`,
    eq(groupSum, appDirect) && groupedItemCount === items.length,
    `${groups.length} 组 / ${groupedItemCount} 行 / 合计 ${cny(groupSum)}`);

  /* 5. 舍入策略漂移：先舍后加 vs 精确累加（口径可见性，不判失败） */
  const driftCents = toCents(appDirect) - exactDirectCents;
  if (driftCents !== 0) {
    results.push({
      level: "warn",
      ok: true,
      name: `${tag}｜舍入口径差异`,
      detail: `先舍行再相加 = ${cny(appDirect)}；按分精确累加 = ${cny(centsToYuan(exactDirectCents))}；差 ${driftCents} 分。当前口径为前者（lib/quote.ts），导出/对账时须统一说明。`,
    });
  }

  /* 6. 快照语义：QuoteItem 不得持有任何指向 CatalogItem 的引用列 */
  const cols = await prisma.$queryRawUnsafe("PRAGMA table_info(quote_items)");
  const refCols = cols
    .map((c) => c.name)
    .filter((n) => /catalog|itemId(?!$)/i.test(n) && !/^id$/i.test(n));
  check("hard", `${tag}｜快照契约：quote_items 无 Catalog 引用列`, refCols.length === 0,
    refCols.length ? `出现引用列：${refCols.join(", ")} —— 违反 AGENTS §5 快照语义` : `${cols.length} 列，全部为快照字段`);
}

/* 7. 一项目一报价（M1a 约束，多版本才放开） */
const dupe = await prisma.$queryRawUnsafe(
  "SELECT projectId, COUNT(*) c FROM budget_quotes GROUP BY projectId HAVING c > 1"
);
check("hard", "一项目一报价（BudgetQuote.projectId 唯一）", dupe.length === 0,
  dupe.length ? `重复：${dupe.map((d) => `${d.projectId}×${d.c}`).join(", ")}` : "无重复");

/* 8. 科目库非空（M1a 曾只建科目、模板 0 项，而 seed 日志按源数组算数把漏项盖掉；
      报价明细是快照、看不出模板库空 —— 故必须在这里独立断言） */
const cats = await prisma.catalogCategory.findMany({
  include: { _count: { select: { items: true } } },
  orderBy: { order: "asc" },
});
const emptyCats = cats.filter((c) => c._count.items === 0);
const totalItems = cats.reduce((n, c) => n + c._count.items, 0);
check("hard", "科目库非空且无空科目", cats.length > 0 && totalItems > 0 && emptyCats.length === 0,
  `${cats.length} 科目 / ${totalItems} 模板项` +
    (emptyCats.length ? `；空科目：${emptyCats.map((c) => c.name).join(", ")}` : ""));

const dupCodes = await prisma.$queryRawUnsafe(
  "SELECT code, COUNT(*) c FROM catalog_items GROUP BY code HAVING c > 1"
);
check("hard", "科目项 code 全局唯一（选入与搜索依赖它）", dupCodes.length === 0,
  dupCodes.length ? `重复 code：${dupCodes.map((d) => `${d.code}×${d.c}`).join(", ")}` : "无重复");

/* 9. 昨日手算基线（信息项：编辑器动过演示数据后必然漂移，不作为门禁） */
const BASELINE = { direct: 60185.2, tax: 1805.56, grand: 61990.76, unitCost: 482.04 };
const seedQuote = quotes[0];
if (seedQuote) {
  const t = quote.computeTotals(seedQuote.items, seedQuote.taxRate, seedQuote.project?.area ?? 0);
  const same =
    Math.abs(t.directSubtotal - BASELINE.direct) < 0.005 &&
    Math.abs(t.grand - BASELINE.grand) < 0.005;
  results.push({
    level: "info",
    ok: true,
    name: `基线对照（${seedQuote.project?.code}）`,
    detail: same
      ? `与 2026-10-08 手算基线一致（${cny(BASELINE.grand)} / 单方 ${cny(BASELINE.unitCost)}）`
      : `已偏离 2026-10-08 手算基线（${cny(BASELINE.grand)} → ${cny(t.grand)}）。数据被编辑过则属正常，仅作提醒。`,
  });
}

await prisma.$disconnect();

/* ── 输出 ────────────────────────────────────────────────────────── */
const icon = (r) => (r.level === "warn" ? "⚠" : r.ok ? "✓" : "✗");
console.log("\n报价金额口径校验 —— renovation-platform\n");
for (const r of results) console.log(`  ${icon(r)} ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
const warns = results.filter((r) => r.level === "warn").length;
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查（警告 ${warns}）\n`
);
process.exit(failed === 0 ? 0 : 1);
