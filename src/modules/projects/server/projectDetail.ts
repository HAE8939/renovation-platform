import prisma from "@/core/db";
import {
  computeTotals,
  groupByCategory,
  type QuoteItemRow,
} from "@/core/domain/pricing";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/core/domain/types";
import {
  overallProgress,
  scheduleLight,
  type Light,
} from "@/core/domain/health";

/**
 * 项目中心详情读模型（projects 模块 M4-b）。
 * 只读聚合：经共享 core/db 的 prisma 直读 Project/Client/BudgetQuote/QuoteItem，
 * 金额口径复用 core/domain/pricing（不 import budget server 内部，AGENTS §2）。
 * 排程聚合经 prisma 直读 ScheduleTask，工期口径复用 core/domain/health
 * （overallProgress / scheduleLight）；不 import schedule 模块内部。
 * 设计聚合经 prisma 直读 DesignTask 计数；不 import design 模块内部。
 */

export interface HubCategory {
  categoryName: string;
  subtotal: number;
  /** 占直接费比例 0–1 */
  pct: number;
}

export interface HubScheduleTask {
  name: string;
  order: number;
  status: string;
  progress: number;
}

export interface HubSchedule {
  hasSchedule: boolean;
  taskCount: number;
  progress: number;
  light: Light;
  tasks: HubScheduleTask[];
  /** 最后一条工序的计划完工（沿用本文件 fmtDate 风格）；无排程 → null。 */
  plannedEnd: string | null;
}

export interface HubDesign {
  total: number;
  byStatus: {
    pending: number;
    assigned: number;
    submitted: number;
    revisions: number;
    approved: number;
  };
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
  schedule: HubSchedule;
  design: HubDesign;
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
      scheduleTasks: {
        select: {
          name: true,
          order: true,
          status: true,
          progress: true,
          endDate: true,
        },
        orderBy: { order: "asc" },
      },
      designTasks: { select: { status: true } },
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

  // ── 排程聚合（prisma 直读 ScheduleTask，口径复用 core/domain/health）──
  const scheduleTasks = project.scheduleTasks;
  const progress = overallProgress(
    scheduleTasks.map((t) => ({ progress: t.progress }))
  );
  const now = new Date();
  const light = scheduleLight(
    { endDate: project.endDate, actualEndDate: project.actualEndDate, progress },
    now
  );
  const lastTask =
    scheduleTasks.length > 0 ? scheduleTasks[scheduleTasks.length - 1] : null;
  const schedule: HubSchedule = {
    hasSchedule: scheduleTasks.length > 0,
    taskCount: scheduleTasks.length,
    progress,
    light,
    tasks: scheduleTasks.map((t) => ({
      name: t.name,
      order: t.order,
      status: t.status,
      progress: t.progress,
    })),
    plannedEnd: lastTask ? fmtDate(lastTask.endDate) : null,
  };

  // ── 设计聚合（prisma 直读 DesignTask 计数，不 import design 模块内部）──
  const byStatus: HubDesign["byStatus"] = {
    pending: 0,
    assigned: 0,
    submitted: 0,
    revisions: 0,
    approved: 0,
  };
  for (const t of project.designTasks) {
    if (t.status in byStatus) {
      byStatus[t.status as keyof typeof byStatus]++;
    }
  }
  const design: HubDesign = {
    total: project.designTasks.length,
    byStatus,
  };

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
    schedule,
    design,
  };
}
