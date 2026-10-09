import prisma from "@/core/db";
import { computeTotals } from "@/core/domain/pricing";
import type { QuoteItemRow } from "@/core/domain/pricing";

/**
 * 项目管理服务（projects 模块 M4-a）。
 *
 * 只读聚合：经共享 core/db 的 prisma 直读 Project / Client / BudgetQuote / QuoteItem
 * （AGENTS §2：不 import budget/crm 的 server 内部函数，只直读共享表）。
 *
 * 金额口径单一真源 = src/core/domain/pricing.ts：本文件只调 computeTotals，
 * 不自己写 unitPrice×quantity（verify-quote.mjs 静态断言全仓仅 pricing.ts 一处算法）。
 */

export interface ProjectManagementItem {
  id: string;
  code: string;
  name: string;
  clientName: string;
  status: string;
  area: number;
  /** 合同额（Project.contractAmount 真值，非推算）。 */
  contractAmount: number;
  designer: string | null;
  pm: string | null;
  updatedAt: Date;
  /** 进度：M6 才有，本期恒为 null，UI 显「未接入」。 */
  progress: null;
  /** 报价直接费（Σ 行小计）。 */
  quoteSubtotal: number;
  /** 报价税金（直接费 × taxRate）。 */
  quoteTax: number;
  /** 报价总价（直接费 + 税）。 */
  quoteGrand: number;
}

export interface ListProjectsFilter {
  /** 按 Project.status 过滤（同步 core/domain/types 的 PROJECT_STATUS）。 */
  status?: string;
}

/**
 * 列出项目管理视角的项目。
 * 一项目一报价（BudgetQuote.projectId 唯一），take 1 取最新一张算汇总。
 */
export async function listProjectsForManagement(
  filter?: ListProjectsFilter
): Promise<ProjectManagementItem[]> {
  const projects = await prisma.project.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    include: {
      client: { select: { name: true } },
      quotes: {
        include: { items: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((p) => {
    const quote = p.quotes[0];
    let quoteSubtotal = 0;
    let quoteTax = 0;
    let quoteGrand = 0;
    if (quote) {
      const rows: QuoteItemRow[] = quote.items.map((it) => ({
        id: it.id,
        categoryName: it.categoryName,
        code: it.code,
        name: it.name,
        unit: it.unit,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        materials: it.materials,
        sop: it.sop,
        order: it.order,
      }));
      // 面积传 p.area 仅为 unitCost 计算；管理列表只用 subtotal/tax/grand。
      const totals = computeTotals(rows, quote.taxRate, p.area);
      quoteSubtotal = totals.directSubtotal;
      quoteTax = totals.tax;
      quoteGrand = totals.grand;
    }

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientName: p.client.name,
      status: p.status,
      area: p.area,
      contractAmount: p.contractAmount,
      designer: p.designer,
      pm: p.pm,
      updatedAt: p.updatedAt,
      progress: null,
      quoteSubtotal,
      quoteTax,
      quoteGrand,
    };
  });
}
