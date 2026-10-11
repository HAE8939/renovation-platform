/**
 * 财务管控 · 付款计划服务（M8-c）。
 *
 * 在 M8-a 的 payment.ts 纯函数与 M8-b 的台账写路径之上加计划页与计划写服务。
 * 不改 payment.ts / ledger.ts / records.ts / status.ts / types.ts / schema / seed。
 *
 * 跨模块读 AcceptanceNode 走 @/core/db prisma 直读，不 import quality 内部（AGENTS §2）。
 * 派生全在 server 算，客户端只渲染（决策①：解锁＝派生、不落库）。
 * markPaid 绝不写 FinanceRecord（决策②：两本账分离）。
 * 未解锁硬门控（§1-5）：不给绕过的口子。
 *
 * 守卫范式承 schedule/server/generate.ts（任一不满足即抛错不写库，单事务）。
 */

import prisma from "@/core/db";
import { round2 } from "@/core/domain/pricing";
import {
  buildPaymentPlan,
  canMarkPaid,
  paymentTriggerLabel,
  paymentUnlockState,
  type AcceptanceNodeProjection,
  type PaymentNodeProjection,
  type PaymentUnlockState,
} from "../payment";
import { getFinanceUser } from "../currentUser";

/** 付款计划业务错误：中文文案直达 UI（仿 ScheduleGenerateError / FinanceRecordError）。 */
export class PaymentPlanError extends Error {}

/** UTC 月算术：Date.UTC 构造器自动处理月份溢出（如 13 月 → 次年 1 月）。照 seed 写法，别引 dayjs。 */
function addMonthsUTC(base: Date, months: number): Date {
  return new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate())
  );
}

// ── 视图模型 ──────────────────────────────────────────────────

/** 项目下拉选项（含是否已有计划与合同额）。 */
export interface PlanProjectOption {
  id: string;
  name: string;
  code: string;
  hasPlan: boolean;
  contractAmount: number;
}

/** 计划段视图（PaymentNodeProjection 字段 + 服务端算好的派生态）。 */
export interface PlanSegment extends PaymentNodeProjection {
  id: string;
  note: string;
  paidAt: Date | null;
  state: PaymentUnlockState;
  triggerLabel: string;
  canMark: boolean;
}

/** 计划视图模型（供 /finance/payments 页直接渲染）。 */
export interface PlanView {
  projectId: string;
  projectName: string;
  contractAmount: number;
  segments: PlanSegment[];
  hasPlan: boolean;
  canGenerate: boolean;
  /** 对照条三数（§1-2 诚实对照） */
  planPaidTotal: number;
  ledgerContractIncome: number;
  reconDiff: number;
}

// ── listPlanProjects ──────────────────────────────────────────

/**
 * 列非 archived 项目下拉 + 每个是否已有计划 + 合同额。
 * 供页头筛选与默认选中（默认=第一个 hasPlan 的项目，无则第一个项目——选中逻辑在页面）。
 */
export async function listPlanProjects(): Promise<PlanProjectOption[]> {
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" } },
    select: { id: true, name: true, code: true, contractAmount: true },
    orderBy: { code: "asc" },
  });
  const nodes = await prisma.paymentNode.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true },
  });
  const hasPlanSet = new Set(nodes.map((n) => n.projectId));
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    hasPlan: hasPlanSet.has(p.id),
    contractAmount: p.contractAmount ?? 0,
  }));
}

// ── getPlanView ───────────────────────────────────────────────

/**
 * 取选中项目的计划视图模型。
 * - 派生全在 server 算：每段的 state/triggerLabel/canMark 由 payment.ts 纯函数现算。
 * - nodes 取该项目全部 AcceptanceNode 的 {name,status} 投影（跨模块只读 prisma）。
 * - 对照条三数：planPaidTotal / ledgerContractIncome / reconDiff。
 * - today 默认 new Date()，可注入供测试。
 */
export async function getPlanView(
  projectId: string,
  today: Date = new Date()
): Promise<PlanView> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, contractAmount: true },
  });
  if (!project) throw new PaymentPlanError("项目不存在");

  const [nodes, acceptanceNodes, contractIncomeAgg] = await Promise.all([
    prisma.paymentNode.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    }),
    prisma.acceptanceNode.findMany({
      where: { projectId },
      select: { name: true, status: true },
    }),
    prisma.financeRecord.aggregate({
      where: { projectId, type: "income", category: "contract" },
      _sum: { amount: true },
    }),
  ]);

  const acceptanceProjection: AcceptanceNodeProjection[] = acceptanceNodes.map(
    (n) => ({ name: n.name, status: n.status })
  );

  const segments: PlanSegment[] = nodes.map((n) => {
    const projection: PaymentNodeProjection = {
      order: n.order,
      name: n.name,
      percent: n.percent,
      amountDue: n.amountDue,
      trigger: n.trigger,
      triggerStages: n.triggerStages,
      unlocksAt: n.unlocksAt,
      paid: n.paid,
    };
    const state = paymentUnlockState(projection, acceptanceProjection, today);
    const triggerLabel = paymentTriggerLabel(projection);
    const canMark = canMarkPaid(state, n.paid);
    return {
      id: n.id,
      note: n.note,
      paidAt: n.paidAt,
      ...projection,
      state,
      triggerLabel,
      canMark,
    };
  });

  const planPaidTotal = round2(
    nodes.filter((n) => n.paid).reduce((s, n) => s + n.amountDue, 0)
  );
  const ledgerContractIncome = round2(contractIncomeAgg._sum.amount ?? 0);
  const reconDiff = round2(planPaidTotal - ledgerContractIncome);

  return {
    projectId: project.id,
    projectName: project.name,
    contractAmount: project.contractAmount ?? 0,
    segments,
    hasPlan: nodes.length > 0,
    canGenerate: (project.contractAmount ?? 0) > 0 && nodes.length === 0,
    planPaidTotal,
    ledgerContractIncome,
    reconDiff,
  };
}

// ── generatePlan ──────────────────────────────────────────────

/**
 * 生成付款计划（守卫仿 schedule/generate.ts）。
 * - 项目不存在 → 「项目不存在」
 * - 已有付款段 → 「已存在付款计划，请先清空再生成」（防重复）
 * - contractAmount <= 0 → 「先在项目设置录入合同额」（UI 链 /budget/[projectId]/settings）
 * 守卫过后 buildPaymentPlan(contractAmount)，对 unlocksAtOffsetMonths 的段算
 * unlocksAt = addMonthsUTC(actualEndDate ?? endDate ?? today, offset)（UTC 月算术），
 * 其余 unlocksAt=null；单事务 createMany 五行（paid 默认 false）。
 */
export async function generatePlan(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, contractAmount: true, actualEndDate: true, endDate: true },
  });
  if (!project) throw new PaymentPlanError("项目不存在");

  const existing = await prisma.paymentNode.count({ where: { projectId } });
  if (existing > 0)
    throw new PaymentPlanError("已存在付款计划，请先清空再生成");

  const contractAmount = project.contractAmount ?? 0;
  if (contractAmount <= 0)
    throw new PaymentPlanError("先在项目设置录入合同额");

  const plan = buildPaymentPlan(contractAmount);
  if (plan.length === 0)
    throw new PaymentPlanError("先在项目设置录入合同额");

  const today = new Date();
  const warrantyBase = project.actualEndDate ?? project.endDate ?? today;
  const rows = plan.map((row) => ({
    projectId,
    order: row.order,
    name: row.name,
    percent: row.percent,
    amountDue: row.amountDue,
    trigger: row.trigger,
    triggerStages: row.triggerStages,
    unlocksAt: row.unlocksAtOffsetMonths
      ? addMonthsUTC(warrantyBase, row.unlocksAtOffsetMonths)
      : null,
  }));

  return prisma.$transaction(async (tx) => {
    await tx.paymentNode.createMany({ data: rows });
  });
}

// ── clearPlan ─────────────────────────────────────────────────

/**
 * 清空付款计划。
 * - 存在 paid==true 的段 → 抛「已标记已付的段不可清空（付款事实会丢失）——如需纠正请先撤销已付」
 * - 否则单事务 deleteMany。
 */
export async function clearPlan(projectId: string): Promise<void> {
  const paidCount = await prisma.paymentNode.count({
    where: { projectId, paid: true },
  });
  if (paidCount > 0)
    throw new PaymentPlanError(
      "已标记已付的段不可清空（付款事实会丢失）——如需纠正请先撤销已付"
    );

  return prisma.$transaction(async (tx) => {
    await tx.paymentNode.deleteMany({ where: { projectId } });
  });
}

// ── markPaid ──────────────────────────────────────────────────

/**
 * 标记已付（硬门控 §1-5）。
 * - 段不存在 → 「付款段不存在」
 * - canMarkPaid(state, paid) 为 false：
 *   - 已付 → 「该段已标记已付」
 *   - 未解锁 → 「未解锁不可标记已付：{state.reason}」
 * - 通过则 paid=true, paidAt=new Date(), paidBy=getFinanceUser()?.id ?? null
 * - **绝不写 FinanceRecord**（决策②：两本账分离）
 */
export async function markPaid(id: string): Promise<void> {
  const node = await prisma.paymentNode.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      order: true,
      name: true,
      percent: true,
      amountDue: true,
      trigger: true,
      triggerStages: true,
      unlocksAt: true,
      paid: true,
    },
  });
  if (!node) throw new PaymentPlanError("付款段不存在");

  const acceptanceNodes = await prisma.acceptanceNode.findMany({
    where: { projectId: node.projectId },
    select: { name: true, status: true },
  });
  const today = new Date();
  const projection: PaymentNodeProjection = {
    order: node.order,
    name: node.name,
    percent: node.percent,
    amountDue: node.amountDue,
    trigger: node.trigger,
    triggerStages: node.triggerStages,
    unlocksAt: node.unlocksAt,
    paid: node.paid,
  };
  const state = paymentUnlockState(
    projection,
    acceptanceNodes.map((n) => ({ name: n.name, status: n.status })),
    today
  );
  if (!canMarkPaid(state, node.paid)) {
    if (node.paid) throw new PaymentPlanError("该段已标记已付");
    throw new PaymentPlanError(`未解锁不可标记已付：${state.reason}`);
  }

  const me = await getFinanceUser();
  await prisma.paymentNode.update({
    where: { id },
    data: {
      paid: true,
      paidAt: today,
      paidBy: me?.id ?? null,
    },
  });
}

// ── unmarkPaid ────────────────────────────────────────────────

/**
 * 撤销已付（恒允许）。
 * - 段不存在 → 「付款段不存在」
 * - 置 paid=false, paidAt=null, paidBy=null
 */
export async function unmarkPaid(id: string): Promise<void> {
  const node = await prisma.paymentNode.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!node) throw new PaymentPlanError("付款段不存在");

  await prisma.paymentNode.update({
    where: { id },
    data: {
      paid: false,
      paidAt: null,
      paidBy: null,
    },
  });
}
