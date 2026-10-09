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
