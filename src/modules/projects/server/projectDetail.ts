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
  qualityLight,
  type Light,
} from "@/core/domain/health";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";

/**
 * 项目中心详情读模型（projects 模块 M4-b）。
 * 只读聚合：经共享 core/db 的 prisma 直读 Project/Client/BudgetQuote/QuoteItem，
 * 金额口径复用 core/domain/pricing（不 import budget server 内部，AGENTS §2）。
 * 排程聚合经 prisma 直读 ScheduleTask，工期口径复用 core/domain/health
 * （overallProgress / scheduleLight）；不 import schedule 模块内部。
 * 设计聚合经 prisma 直读 DesignTask 计数；不 import design 模块内部。
 * 质量聚合：读前先 syncAcceptanceNodes 兜底（core 整合器，M7-e 调用点③），
 * 再 prisma 直读 AcceptanceNode/Issue 计数；灯复用 core/domain/health.qualityLight
 * （不改公式）；不 import quality 模块内部。
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

export interface HubQuality {
  hasNodes: boolean;
  total: number;
  passed: number;
  submitted: number;
  returned: number;
  pending: number;
  /** status !== "closed" 计数（§1-5 口径） */
  openIssues: number;
  light: Light;
  /** order asc，≤11 行 */
  nodes: { id: string; name: string; order: number; status: string }[];
  /** 未关闭，createdAt desc，≤3 */
  recentIssues: {
    id: string;
    title: string;
    severity: string;
    status: string;
  }[];
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
  quality: HubQuality;
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

  // 调用点③（§1-1）：质量聚合前先同步验收节点（core 整合器兜底）。
  await syncAcceptanceNodes(projectId);

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

  // ── 质量聚合（prisma 直读 AcceptanceNode/Issue，灯复用 core/domain/health；
  //    不 import quality 模块内部。计数口径 §1-5：openIssues=未关闭问题，pendingNodes=未通过节点）──
  const acceptanceNodes = await prisma.acceptanceNode.findMany({
    where: { projectId },
    select: { id: true, name: true, order: true, status: true },
    orderBy: { order: "asc" },
  });
  const recentIssues = await prisma.issue.findMany({
    where: { projectId, status: { not: "closed" } },
    select: { id: true, title: true, severity: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const openIssues = await prisma.issue.count({
    where: { projectId, status: { not: "closed" } },
  });
  const nodeCounts: Record<string, number> = {
    pending: 0,
    submitted: 0,
    returned: 0,
    passed: 0,
  };
  for (const n of acceptanceNodes) {
    if (n.status in nodeCounts) nodeCounts[n.status]++;
  }
  const totalNodes = acceptanceNodes.length;
  const passed = nodeCounts.passed;
  const quality: HubQuality = {
    hasNodes: totalNodes > 0,
    total: totalNodes,
    passed,
    submitted: nodeCounts.submitted,
    returned: nodeCounts.returned,
    pending: nodeCounts.pending,
    openIssues,
    light: qualityLight({ openIssues, pendingNodes: totalNodes - passed }),
    nodes: acceptanceNodes.slice(0, 11).map((n) => ({
      id: n.id,
      name: n.name,
      order: n.order,
      status: n.status,
    })),
    recentIssues: recentIssues.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
    })),
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
    quality,
  };
}
