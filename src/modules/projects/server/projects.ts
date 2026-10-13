import prisma from "@/core/db";
import type { Prisma } from "@prisma/client";
import { computeTotals } from "@/core/domain/pricing";
import type { QuoteItemRow } from "@/core/domain/pricing";
import { overallProgress } from "@/core/domain/health";
import { filterProjectIdsByCustomFields } from "@/core/domain/customFieldRepo";
import type { FilterInput } from "@/core/domain/customField";

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
  /** 进度：来自排程工序的 overallProgress；无排程 → null（UI 显「未排程」）。 */
  progress: number | null;
  /** 报价直接费（Σ 行小计）。 */
  quoteSubtotal: number;
  /** 报价税金（直接费 × taxRate）。 */
  quoteTax: number;
  /** 报价总价（直接费 + 税）。 */
  quoteGrand: number;
  /**
   * 未闭环事项（M10-c「归档允许但提示」，HAE 2026-10-13 拍板）：
   * 归档一个还有问题没整改、款没收齐的项目是合法动作，但必须**知情**——
   * 确认框里如实列出这些，归档后它们只是从待办视野消失，数据一律保留。
   */
  unclosed: { issues: number; unpaidSegs: number; unpaidAmount: number };
}

export interface ListProjectsFilter {
  /** 按 Project.status 过滤（同步 core/domain/types 的 PROJECT_STATUS）。 */
  status?: string;
  /**
   * 自定义字段筛选条件（M9-c c-2）。条件之间取**交集**（"同时满足"，本期不做"或"）；
   * 类型真值已由 core 从定义表取好，调用方只负责传条件本身。
   */
  cfv?: FilterInput[];
}

/**
 * 列出项目管理视角的项目。
 * 一项目一报价（BudgetQuote.projectId 唯一），take 1 取最新一张算汇总。
 */
export async function listProjectsForManagement(
  filter?: ListProjectsFilter
): Promise<ProjectManagementItem[]> {
  // 自定义字段先筛出命中的项目 id，再与 status 合并成**一个** where。
  // null＝无条件；[] ＝筛不到 → 直接返回空列表（**绝不退化成"没筛子"**，那是骗人的全量结果）。
  const hitIds =
    filter?.cfv && filter.cfv.length > 0
      ? await filterProjectIdsByCustomFields(filter.cfv)
      : null;
  if (hitIds !== null && hitIds.length === 0) return [];

  const where: Prisma.ProjectWhereInput = {};
  if (filter?.status) where.status = filter.status;
  if (hitIds !== null) where.id = { in: hitIds };

  const projects = await prisma.project.findMany({
    where,
    include: {
      client: { select: { name: true } },
      quotes: {
        include: { items: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      scheduleTasks: { select: { progress: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const items = projects.map((p) => {
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
      progress:
        p.scheduleTasks.length > 0
          ? overallProgress(p.scheduleTasks.map((t) => ({ progress: t.progress })))
          : null,
      quoteSubtotal,
      quoteTax,
      quoteGrand,
    };
  });

  // 未闭环读数（M10-c「归档允许但提示」）：两条 groupBy 拿全部项目的计数与金额，
  // 不做 N+1——一项目一查，30 个项目时就难看了。
  const ids = items.map((i) => i.id);
  const [issueGroups, payGroups] = await Promise.all([
    prisma.issue.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: { not: "closed" } },
      _count: { _all: true },
    }),
    prisma.paymentNode.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, paid: false },
      _count: { _all: true },
      _sum: { amountDue: true },
    }),
  ]);
  const issuesById = new Map(issueGroups.map((g) => [g.projectId, g._count._all]));
  const payById = new Map(payGroups.map((g) => [g.projectId, g]));
  return items.map((i) => ({
    ...i,
    unclosed: {
      issues: issuesById.get(i.id) ?? 0,
      unpaidSegs: payById.get(i.id)?._count._all ?? 0,
      unpaidAmount: Math.round((payById.get(i.id)?._sum.amountDue ?? 0) * 100) / 100,
    },
  }));
}
