import prisma from "@/core/db";
import {
  computeTotals,
  groupByCategory,
  round2,
  type QuoteItemRow,
} from "@/core/domain/pricing";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/core/domain/types";
import {
  budgetLight,
  overallProgress,
  scheduleLight,
  qualityLight,
  type Light,
} from "@/core/domain/health";
import {
  changeTotal,
  changeWatch,
  expenseTotal,
  grossProfit,
  marginLight,
  marginRate,
  receivedTotal,
  type ChangeRow,
  type LedgerRecord,
} from "@/core/domain/ledger";
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
 * 财务聚合（M8-d / M9-a）：prisma 直读 financeRecord 与 ChangeOrder，口径复用
 * core/domain/ledger（receivedTotal/expenseTotal/grossProfit/marginRate/marginLight/
 * changeTotal/changeWatch）与 core/domain/health.budgetLight（合同执行/收款进度灯，
 * changeTotal 传真实变更累计）；不 import finance / budget 模块内部
 * （records.ts/payments.ts/changes.ts 是禁区，TASK_M8 §5 / TASK_M9 §3-4）。
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

/**
 * 财务聚合（M8-d）：prisma 直读 financeRecord，口径全走 core/domain/ledger.ts
 * 与 core/domain/health.ts。budgetLight 为合同执行/收款进度（已收 vs 合同额），
 * 与 marginLight（毛利率色档）不同灯位（§1-3、§7-12）。
 * 变更聚合（M9-a）：prisma 直读 ChangeOrder（budget 私有表，经 quoteId 挂报价单级），
 * 口径复用 ledger.changeTotal / changeWatch —— 不 import budget 模块内部；
 * budgetLight/grossProfit/marginRate 的 changeTotal 改真值；paidPct 分母改
 * contractAmount + changeTotal（变更后应收口径）。
 */
export interface HubFinance {
  hasRecords: boolean;
  /** 合同额（哨兵：0 = 未录入，毛利/计划/灯下游第一次用到它） */
  contractAmount: number;
  /** 累计变更额（带符号：正=增加、负=减少；ledger.changeTotal 单一真源） */
  changeTotal: number;
  /** 变更超 5% 预警（ledger.changeWatch；合同额≤0 → false） */
  changeWarn: boolean;
  receivedTotal: number;
  expenseTotal: number;
  grossProfit: number;
  /** 毛利率（合同额未录入 → null，UI 显「—」不造 0%） */
  marginRate: number | null;
  marginLight: "green" | "yellow" | "red" | "neutral";
  /** 已收/(合同额+变更)（分母≤0 → null，UI 显「未录入合同额」不假绿） */
  paidPct: number | null;
  /** 预算灯（health.budgetLight，合同执行/收款进度） */
  budgetLight: Light;
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
  finance: HubFinance;
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

  // ── 财务聚合（prisma 直读 financeRecord，口径复用 core/domain/ledger.ts /
  //    health.ts；不 import finance 模块内部，AGENTS §2 / TASK_M8 §5）──
  //    变更聚合（M9-a）：prisma 直读 ChangeOrder（budget 私有表经 quoteId 挂报价单级），
  //    口径走 ledger.changeTotal / changeWatch —— 不 import budget 模块内部。
  const [financeRecords, changeOrders] = await Promise.all([
    prisma.financeRecord.findMany({
      where: { projectId },
      select: { type: true, amount: true },
    }),
    prisma.changeOrder.findMany({
      where: { quote: { projectId } },
      select: { amount: true },
    }),
  ]);
  const ledgerRecords: LedgerRecord[] = financeRecords.map((r) => ({
    type: r.type,
    amount: r.amount,
  }));
  const changeRows: ChangeRow[] = changeOrders.map((c) => ({ amount: c.amount }));
  const contractAmount = project.contractAmount;
  const received = receivedTotal(ledgerRecords);
  const expense = expenseTotal(ledgerRecords);
  const changeTotalVal = changeTotal(changeRows);
  const { warn: changeWarn } = changeWatch(contractAmount, changeTotalVal);
  const profit = grossProfit({
    contractAmount,
    changeTotal: changeTotalVal,
    expenseTotal: expense,
  });
  const rate = marginRate({
    contractAmount,
    changeTotal: changeTotalVal,
    expenseTotal: expense,
  });
  // paidPct 分母 = 合同额 + 变更（变更后应收口径）；≤0 → null
  const paidDenom = contractAmount + changeTotalVal;
  const finance: HubFinance = {
    hasRecords: financeRecords.length > 0,
    contractAmount,
    changeTotal: changeTotalVal,
    changeWarn,
    receivedTotal: round2(received),
    expenseTotal: round2(expense),
    grossProfit: profit,
    marginRate: rate,
    marginLight: marginLight(rate),
    paidPct: paidDenom > 0 ? round2(received / paidDenom) : null,
    budgetLight: budgetLight({
      contractAmount,
      changeTotal: changeTotalVal,
      paidTotal: received,
    }),
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
    finance,
  };
}
