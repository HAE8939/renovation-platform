import prisma from "@/core/db";
import {
  computeTotals,
  groupByCategory,
  type QuoteItemRow,
} from "@/core/domain/pricing";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/core/domain/types";

/**
 * 项目中心详情读模型（projects 模块 M4-b）。
 * 只读聚合：经共享 core/db 的 prisma 直读 Project/Client/BudgetQuote/QuoteItem，
 * 金额口径复用 core/domain/pricing（不 import budget server 内部，AGENTS §2）。
 * 设计/工期/质量数据源模块（M5/M6/M7）未建 → 本层不产出，UI 显诚实空状态。
 */

export interface HubCategory {
  categoryName: string;
  subtotal: number;
  /** 占直接费比例 0–1 */
  pct: number;
}

export interface ProjectHub {
  id: string;
  code: string;
  name: string;
  status: string;
  statusLabel: string;
  address: string | null;
  area: number;
  houseType: string | null;
  style: string | null;
  source: string | null;
  contractAmount: number;
  startDate: string | null;
  endDate: string | null; // 计划完工
  actualEndDate: string | null;
  client: { name: string; phone: string | null } | null;
  people: {
    designer: string | null;
    pm: string | null;
    inspector: string | null;
    budgetAnalyst: string | null;
  };
  quote: {
    exists: boolean;
    status: string;
    directSubtotal: number;
    tax: number;
    grand: number;
    unitCost: number | null;
    taxRate: number;
    itemCount: number;
    categories: HubCategory[];
  } | null;
}

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export async function getProjectHub(projectId: string): Promise<ProjectHub | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { name: true, phone: true } },
      quotes: {
        include: { items: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!project) return null;

  let quote: ProjectHub["quote"] = null;
  const q = project.quotes[0];
  if (q) {
    const rows: QuoteItemRow[] = q.items.map((it) => ({
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
    const totals = computeTotals(rows, q.taxRate, project.area);
    const groups = groupByCategory(rows);
    const categories: HubCategory[] = groups.map((g) => ({
      categoryName: g.categoryName,
      subtotal: g.subtotal,
      pct: totals.directSubtotal > 0 ? g.subtotal / totals.directSubtotal : 0,
    }));
    quote = {
      exists: true,
      status: q.status,
      directSubtotal: totals.directSubtotal,
      tax: totals.tax,
      grand: totals.grand,
      unitCost: totals.unitCost,
      taxRate: totals.taxRate,
      itemCount: totals.itemCount,
      categories,
    };
  }

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    status: project.status,
    statusLabel: PROJECT_STATUS_LABEL[project.status as ProjectStatus] ?? project.status,
    address: project.address,
    area: project.area,
    houseType: project.houseType,
    style: project.style,
    source: project.source,
    contractAmount: project.contractAmount,
    startDate: fmtDate(project.startDate),
    endDate: fmtDate(project.endDate),
    actualEndDate: fmtDate(project.actualEndDate),
    client: project.client ? { name: project.client.name, phone: project.client.phone } : null,
    people: {
      designer: project.designer,
      pm: project.pm,
      inspector: project.inspector,
      budgetAnalyst: project.budgetAnalyst,
    },
    quote,
  };
}
