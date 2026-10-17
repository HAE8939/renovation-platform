import { Prisma } from "@prisma/client";
import prisma from "@/core/db";
import type { QuoteItemRow } from "../types";
import { ValidationError } from "./projects";

/**
 * 报价明细数据访问层。
 *
 * 这里只管「读」与「落库」，不出现任何金额算法 ——
 * 分组、行小计、直接费 / 税金 / 总价 / 单方造价一律由 modules/budget/lib/quote.ts 计算。
 *
 * 明细是整表替换：先删后插（单事务），order 按提交顺序重新编号。
 * 客户端传来的 id 只用作 React key，落库时丢弃，每次保存由数据库重新分配。
 */

export interface QuoteItemPayload {
  id: string;
  categoryName: string;
  code: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  materials: string;
  sop: string;
}

/** 一项目一报价（M1a 约束）；不存在则补一张草稿，保证空项目也能直接编辑。 */
async function ensureQuote(tx: Prisma.TransactionClient, projectId: string): Promise<string> {
  const existing = await tx.budgetQuote.findUnique({ where: { projectId } });
  if (existing) return existing.id;
  const created = await tx.budgetQuote.create({
    data: { projectId, taxRate: 0.03, status: "draft" },
  });
  return created.id;
}

/** 保存整份明细；返回落库后的行（含新的 id 与 order），供界面直接替换本地草稿。 */
export async function saveQuoteItems(
  projectId: string,
  rows: QuoteItemPayload[]
): Promise<QuoteItemRow[]> {
  if (!projectId) throw new ValidationError("缺少项目标识");
  if (rows.length > 500) throw new ValidationError("明细行数过多，请分批处理");

  const normalized = rows.map((row, i) => {
    const no = i + 1;
    const name = row.name.trim();
    const code = row.code.trim();
    if (!name) throw new ValidationError(`第 ${no} 行缺少项目名称`);
    if (!code) throw new ValidationError(`第 ${no} 行缺少编号`);
    return {
      categoryName: row.categoryName.trim(),
      code,
      name,
      unit: row.unit.trim() || "项",
      unitPrice: positive(row.unitPrice, `第 ${no} 行单价`),
      quantity: positive(row.quantity, `第 ${no} 行数量`),
      materials: row.materials.trim(),
      sop: row.sop.trim(),
    };
  });

  return prisma.$transaction(async (tx) => {
    // M15 断点③写侧门控：确认/锁定后不可再改明细（先退回草稿）。新建空报价恒 draft，放行。
    const current = await tx.budgetQuote.findUnique({
      where: { projectId },
      select: { status: true },
    });
    if (current && !isQuoteEditable(current.status)) {
      throw new ValidationError(
        current.status === "locked"
          ? "报价已锁定（签约锁单），不可编辑明细"
          : "报价已确认，不可编辑明细；如需修改请先退回草稿"
      );
    }
    const quoteId = await ensureQuote(tx, projectId);

    await tx.quoteItem.deleteMany({ where: { quoteId } });
    await tx.quoteItem.createMany({
      data: normalized.map((r, i) => ({
        quoteId,
        categoryName: r.categoryName,
        code: r.code,
        name: r.name,
        unit: r.unit,
        unitPrice: r.unitPrice,
        quantity: r.quantity,
        materials: r.materials,
        sop: r.sop,
        order: i + 1,
      })),
    });

    // 明细是子表，删插不会带 updatedAt；显式触碰报价单，让列表页的排序与时间正确。
    await tx.budgetQuote.update({ where: { id: quoteId }, data: { updatedAt: new Date() } });

    const saved = await tx.quoteItem.findMany({
      where: { quoteId },
      orderBy: { order: "asc" },
    });
    return saved;
  });
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ValidationError(`${label}需为数字`);
  if (value < 0) throw new ValidationError(`${label}不能为负数`);
  return value;
}

/* ── 报价状态机与税率编辑（M15 断点③：接通写路径）────────────────────
 * 断点根因：status 字段（draft/confirmed/locked）自 M2-A 起就在 schema 里，lockedAt
 * 也留了位，但**全站没有任何一处能写入**——用户看得到「草稿/已确认/已锁定」徽章，
 * 却没有把报价从 draft 推到 confirmed 的入口；税率 taxRate 同样是只读展示、不能改。
 * 这段补上写侧与门控，报价确认后锁定编辑（明细与税率只读），locked 用于签约锁单场景。
 *
 * 三条不变量：
 *  ① **写侧走 status 门控**：saveQuoteItems / updateTaxRate 都要求 status='draft'，
 *     confirmed / locked 一律拒（中文错「报价已确认/已锁定…」直达 UI）；
 *  ② **状态转移合法性集中一处**：assertQuoteStatusTransition 定义，服务与门禁共用；
 *     合法集：draft→confirmed、confirmed→draft、confirmed→locked。locked 是终态
 *     （签约锁单不可解，与 §4.6 变更单 client_confirmed 的「唯一受控出口」不同族——
 *     报价锁是合同动作的一部分，解锁要走合同变更，不给静默口子）；
 *  ③ **税率边界**：0–1 之间（0.03=3%），越界拒。税率改动**只**影响下次 computeTotals，
 *     不回溯已 confirmed 的历史报价（同明细快照语义，AGENTS §5）。
 *
 * 本期不做审批 / 多版本（沿 M9 边界裁定：报价多版本 DEFERRED；无消费方）。
 * ──────────────────────────────────────────────────────────────── */

/** 报价状态业务错误：中文文案直达 UI（与 QualityIssueError 同思路）。 */
export class QuoteStatusError extends Error {}

/** 合法状态转移集：源态 → 允许的下一态数组。locked 是终态（不在键上出现即为终态）。 */
const QUOTE_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(["confirmed"]),
  confirmed: new Set(["draft", "locked"]),
};

/** 转移合法性谓词（纯函数，可门禁断言）。 */
export function canTransitionQuote(from: string, to: string): boolean {
  return QUOTE_TRANSITIONS[from]?.has(to) === true;
}

/** 是否处于可编辑态（明细与税率写入门控，同一真源给服务与页面消费）。 */
export function isQuoteEditable(status: string): boolean {
  return status === "draft";
}

/**
 * 状态推进（Server Action 落库）。校验：目标态合法值、当前态 → 目标态在转移集内、
 * 目标态非 locked 时不写 lockedAt；目标态为 locked 时写 lockedAt = now（首次即钉，
 * 后续无出口）。单事务：读现态 + 校验 + 写入原子完成（承 M3-d2 事务内不嵌套自开事务的服务）。
 */
export async function setQuoteStatus(
  projectId: string,
  next: "draft" | "confirmed" | "locked"
): Promise<{ before: string; after: string }> {
  const allowed: ReadonlySet<string> = new Set(["draft", "confirmed", "locked"]);
  if (!allowed.has(next)) throw new QuoteStatusError("目标状态非法");
  return prisma.$transaction(async (tx) => {
    const quote = await tx.budgetQuote.findUnique({
      where: { projectId },
      select: { id: true, status: true },
    });
    if (!quote) throw new QuoteStatusError("报价不存在（请先在报价单页保存至少一行明细）");
    const from = quote.status;
    if (!canTransitionQuote(from, next)) {
      throw new QuoteStatusError(`不允许的状态转移：${from} → ${next}`);
    }
    await tx.budgetQuote.update({
      where: { id: quote.id },
      data: {
        status: next,
        // lockedAt：仅首次进入 locked 才写；反向回退（无出口，此分支实际不到达）保留原值。
        ...(next === "locked" ? { lockedAt: new Date() } : {}),
      },
    });
    return { before: from, after: next };
  });
}

/**
 * 更新税率：0–1 之间（0.03 表示 3%）。守卫：报价存在 + status='draft'（confirmed/locked 拒）。
 * 单行 update；无跨表副作用。
 */
export async function updateQuoteTaxRate(
  projectId: string,
  taxRate: number
): Promise<{ before: number; after: number }> {
  if (!Number.isFinite(taxRate)) throw new QuoteStatusError("税率需为数字");
  if (taxRate < 0 || taxRate > 1) throw new QuoteStatusError("税率需介于 0 到 1（如 3% 传 0.03）");
  return prisma.$transaction(async (tx) => {
    const quote = await tx.budgetQuote.findUnique({
      where: { projectId },
      select: { id: true, status: true, taxRate: true },
    });
    if (!quote) throw new QuoteStatusError("报价不存在（请先在报价单页保存至少一行明细）");
    if (!isQuoteEditable(quote.status)) {
      throw new QuoteStatusError(`当前报价状态为「${quote.status}」，不可改税率（先退回草稿）`);
    }
    await tx.budgetQuote.update({ where: { id: quote.id }, data: { taxRate } });
    return { before: quote.taxRate, after: taxRate };
  });
}

