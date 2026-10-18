/**
 * 财务管控 · 收支台账只读服务（M8-a）。
 *
 * 本单元只读：listRecords 不写任何 create/update/delete（写操作归 M8-b）。
 * 跨模块读走 core/db prisma 直读，不 import 其他模块内部（AGENTS §2）。
 * 口径全走 core/domain/ledger.ts 与 finance/payment.ts 的纯函数 ——
 * 页面/服务里不得出现第二处算式（TASK_M8 §5）。
 *
 * 变更聚合（M9-a）：汇总条 grossProfit/marginRate 的 changeTotal 由留位 0 改为
 * 真值（按筛选范围：单项目→该项目变更和；全量→全部变更）；pendingTotal 分母改
 * max(0, contractAmount + changeTotal − received)（变更后应收含变更）。
 * 直读 ChangeOrder（budget 私有表经 quote→project），不 import budget 模块内部。
 *
 * 归档口径（M10-c，HAE 2026-10-13 拍板“钱按事实 · 事按可见性”）：
 * - **事实类一律照算**——已收、支出、合同额、变更、毛利/毛利率含已归档项目。
 *   归档只是可见性开关（AGENTS §4.3），不该回溯改写已经交付出去的对账数字：
 *   八月实收的五万，不会因为十一月点了“归档”而在报表里凭空消失。
 * - **前瞻类排除已归档**——待收款与计划未付合计只算未归档项目。归档＝这个项目
 *   的经营事项已收场，不再挂账催收、不再出现在催款视野里。
 * - 两者口径不同是**有意**的，故必须让页面把它说清楚：结果带 `archivedFacts`
 *   （归档项目的历史已收/支出）与 `filteredArchived`（正筛着一个归档项目），
 *   页面据此出说明行。沉默地少一个数字，比数字小更糟。
 */

import prisma from "@/core/db";
import {
  changeTotal,
  expenseTotal,
  grossProfit,
  marginLight,
  marginRate,
  receivedTotal,
  type ChangeRow,
} from "@/core/domain/ledger";
import { round2 } from "@/core/domain/pricing";
import { categoriesFor, type FinanceCategory, type FinanceType } from "../types";
import { getFinanceUser } from "../currentUser";

/** 项目下拉选项（非 archived）。 */
export interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

/** 台账行（视图模型，供 /finance 页直接渲染）。 */
export interface FinanceRecordRow {
  id: string;
  date: Date;
  type: string;
  category: string;
  amount: number;
  description: string;
  projectName: string;
  recordedByName: string | null;
}

/** 汇总条（当前项目或全部口径，不受 Tab 切换影响）。 */
export interface FinanceSummary {
  contractAmount: number;
  receivedTotal: number;
  /**
   * 待收款 = round2(max(0, 合同额 + 变更 − 已收))，**只算未归档项目**
   * （收款缺口是前瞻数，归档即从催款视野摘出，M10-c）。
   */
  pendingTotal: number;
  /** 计划未付合计 = Σ PaymentNode.amountDue(paid=false 且项目未归档)（与待收款不同不合并） */
  unpaidPlanTotal: number;
  expenseTotal: number;
  grossProfit: number;
  /** 毛利率（合同额未录入 → null，UI 显“—”） */
  marginRate: number | null;
  /** 毛利率色档（neutral = 不可算） */
  marginLight: "green" | "yellow" | "red" | "neutral";
}

/**
 * 已归档项目仍计入汇总的“历史事实”（M10-c）——供页面出一行诚实说明。
 * 不说明就等于让“待收款比已收款小得说不清”这种问题静默存在。
 */
export interface ArchivedFacts {
  /** 当前筛选范围内已归档项目数（0 → 页面不出说明行） */
  projectCount: number;
  /** 这些项目的历史已收（已计入上方“已收款”格） */
  receivedTotal: number;
  /** 这些项目的历史支出（已计入上方“总支出”格） */
  expenseTotal: number;
}

export interface ListRecordsResult {
  rows: FinanceRecordRow[];
  projectOptions: ProjectOption[];
  summary: FinanceSummary;
  archivedFacts: ArchivedFacts;
  /** 单项目筛选且该项目已归档 → true（页面据此说明“前瞻数不计入”）。 */
  filteredArchived: boolean;
}

export interface ListRecordsFilters {
  projectId?: string;
  view?: "income" | "expense";
}

/** 把 FinanceRecord 行映射为 ledger 纯函数所需的最小形状。 */
function toLedderRecord(r: { type: string; amount: number }) {
  return { type: r.type, amount: r.amount };
}

/**
 * 列收支台账（只读）。
 * - view 过滤 type（默认 income）；rows 按 date 倒序、同日 createdAt 倒序。
 * - 汇总条口径不受 view 影响（取当前筛选范围下的全部记录，收入+支出都算）。
 * - projectId 给定则限定该项目，否则聚合全部项目。
 */
export async function listRecords(
  filters: ListRecordsFilters = {}
): Promise<ListRecordsResult> {
  const { projectId, view } = filters;

  const where = {
    ...(projectId ? { projectId } : {}),
    ...(view ? { type: view as FinanceType } : {}),
  };

  const [records, projectOptions, projects, paymentNodes, changeOrders] = await Promise.all([
    prisma.financeRecord.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { project: { select: { name: true } } },
    }),
    prisma.project.findMany({
      where: { status: { not: "archived" } },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.project.findMany({
      where: projectId ? { id: projectId } : {},
      // status 必带：它是“事实照算 / 前瞻隐身”二分的分区依据（M10-c）
      select: { id: true, contractAmount: true, status: true },
    }),
    prisma.paymentNode.findMany({
      where: projectId ? { projectId } : {},
      select: { amountDue: true, paid: true, projectId: true },
    }),
    // 变更单按筛选范围读（projectId 给定 → 该项目变更；否则全量），口径走 ledger.changeTotal
    prisma.changeOrder.findMany({
      where: projectId ? { quote: { projectId }, status: "client_confirmed" } : { status: "client_confirmed" },
      select: { amount: true, quote: { select: { project: { select: { id: true } } } } },
    }),
  ]);

  // recordedBy → name（无 @relation，按 userId 批量取名字）
  const userIds = Array.from(
    new Set(records.map((r) => r.recordedBy).filter((v): v is string => v !== null))
  );
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  const rows: FinanceRecordRow[] = records.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type,
    category: r.category,
    amount: r.amount,
    description: r.description,
    projectName: r.project.name,
    recordedByName: r.recordedBy ? userNameById.get(r.recordedBy) ?? null : null,
  }));

  // ── 汇总（口径来自 ledger.ts 纯函数，禁第二处算式）──
  // 取该筛选范围（含全部 type）的记录做汇总：若 view 限定了 type，需另查全部 type。
  let allTypeRecords: { type: string; amount: number; projectId: string }[] = [];
  if (view) {
    allTypeRecords = await prisma.financeRecord.findMany({
      where: { ...(projectId ? { projectId } : {}) },
      select: { type: true, amount: true, projectId: true },
    });
  } else {
    allTypeRecords = records.map((r) => ({
      type: r.type,
      amount: r.amount,
      projectId: r.projectId,
    }));
  }

  // ── 归档分区（M10-c“钱按事实 · 事按可见性”）──
  // 已归档项目的 id 集合：事实类（已收/支出/合同/变更/毛利）不看它，
  // 前瞻类（待收款、计划未付）只看非归档那一半。
  const archivedIds = new Set(
    projects.filter((p) => p.status === "archived").map((p) => p.id)
  );
  const activeProjects = projects.filter((p) => !archivedIds.has(p.id));
  const sumContract = (list: { contractAmount: number | null }[]) =>
    round2(list.reduce((s, p) => s + (p.contractAmount ?? 0), 0));

  const ledgerRecords = allTypeRecords.map(toLedderRecord);
  const activeLedger = allTypeRecords
    .filter((r) => !archivedIds.has(r.projectId))
    .map(toLedderRecord);
  const archivedLedger = allTypeRecords
    .filter((r) => archivedIds.has(r.projectId))
    .map(toLedderRecord);

  // 事实类：含已归档项目（历史现金事实不因归档消失）
  const contractAmount = sumContract(projects);
  const received = receivedTotal(ledgerRecords);
  const expense = expenseTotal(ledgerRecords);
  // 变更额按筛选范围聚合（ledger.changeTotal 单一真源，带符号）
  const changeRows: ChangeRow[] = changeOrders.map((c) => ({ amount: c.amount }));
  const changeTotalVal = changeTotal(changeRows);
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

  // 前瞻类：排除已归档项目（同一批 ledger 纯函数，只是喂非归档子集，不另立算式）
  const activeContract = sumContract(activeProjects);
  const activeChangeRows: ChangeRow[] = changeOrders
    .filter((c) => !archivedIds.has(c.quote.project.id))
    .map((c) => ({ amount: c.amount }));
  const activeChangeTotal = changeTotal(activeChangeRows);
  const activeReceived = receivedTotal(activeLedger);
  const unpaidPlanTotal = round2(
    paymentNodes
      .filter((n) => !n.paid && !archivedIds.has(n.projectId))
      .reduce((s, n) => s + (n.amountDue ?? 0), 0)
  );

  const summary: FinanceSummary = {
    contractAmount,
    receivedTotal: round2(received),
    // 待收款 = max(0, 合同额 + 变更 − 已收)，**限未归档项目**（M9-a 公式 + M10-c 范围）
    pendingTotal: round2(
      Math.max(0, activeContract + activeChangeTotal - activeReceived)
    ),
    unpaidPlanTotal,
    expenseTotal: round2(expense),
    grossProfit: profit,
    marginRate: rate,
    marginLight: marginLight(rate),
  };

  const archivedFacts: ArchivedFacts = {
    projectCount: archivedIds.size,
    receivedTotal: round2(receivedTotal(archivedLedger)),
    expenseTotal: round2(expenseTotal(archivedLedger)),
  };

  return {
    rows,
    projectOptions,
    summary,
    archivedFacts,
    // 单项目筛选时 projects 只含被筛的那一个 → 它归档即 filteredArchived
    filteredArchived: !!projectId && archivedIds.size > 0,
  };
}

// ── 写操作（M8-b）──────────────────────────────────────────────

/** 台账业务错误：中文文案直达 UI（仿 QualityIssueError）。 */
export class FinanceRecordError extends Error {}

/** 合法收支类型集合（枚举校验用）。 */
const VALID_TYPES: ReadonlySet<string> = new Set(["income", "expense"]);

/** 新建/编辑记录的公共入参（全字段覆盖式编辑）。 */
export interface RecordInput {
  projectId: string;
  type: string;
  category: string;
  amount: number;
  dateIso: string;
  description?: string;
}

/**
 * 校验纯输入（开事务前）：type / category 匹配 / amount 正有限 / date 可解析 / description 去空白。
 * 占位录入人也在事务前取（null → 拒绝）。返回可直接落库的归一化字段。
 */
function validateRecordInput(input: RecordInput): {
  type: FinanceType;
  category: FinanceCategory;
  amount: number;
  date: Date;
  description: string;
} {
  if (!VALID_TYPES.has(input.type)) {
    throw new FinanceRecordError("收支类型非法");
  }
  const type = input.type as FinanceType;
  const cats = categoriesFor(type);
  if (!cats.includes(input.category as FinanceCategory)) {
    throw new FinanceRecordError("科目与收支类型不匹配");
  }
  const category = input.category as FinanceCategory;

  // amount 必须为有限数且 > 0（方向由 type 决定，不接受负数）
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new FinanceRecordError("金额需为大于 0 的数字");
  }

  // dateIso 可解析为有效日期
  const d = new Date(input.dateIso);
  if (isNaN(d.getTime())) {
    throw new FinanceRecordError("日期格式非法");
  }

  const description = (input.description ?? "").trim();

  return { type, category, amount, date: d, description };
}

/**
 * 新建收支记录（M8-b）。
 * 守卫（纯输入校验在开事务前，存在性校验在事务内，仿 createIssue）：
 * - type ∈ {income, expense}（“收支类型非法”）；
 * - category ∈ categoriesFor(type)（“科目与收支类型不匹配”——防错账第一道闸）；
 * - amount 有限数且 > 0（“金额需为大于 0 的数字”；方向由 type 决定、不接受负数）；
 * - dateIso 可解析（“日期格式非法”）；
 * - 占位录入人 getFinanceUser()，null → “未找到录入人，请先运行 seed 初始化用户”；
 * - description 去空白、可空（存 ""）。
 * 事务内：project.findUnique 不存在 → “项目不存在”。写 recordedBy=占位用户 id。
 */
export async function createRecord(input: RecordInput): Promise<{ id: string }> {
  const { type, category, amount, date, description } = validateRecordInput(input);

  const me = await getFinanceUser();
  if (!me) {
    throw new FinanceRecordError("未找到录入人，请先运行 seed 初始化用户");
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) throw new FinanceRecordError("项目不存在");

    const created = await tx.financeRecord.create({
      data: {
        projectId: input.projectId,
        type,
        category,
        amount,
        date,
        description,
        recordedBy: me.id,
      },
      select: { id: true },
    });
    return { id: created.id };
  });
}

/**
 * 编辑记录（M8-b，全字段覆盖式编辑）。
 * 守卫同 createRecord；额外：id 不存在 → “记录不存在”。
 * 不改 recordedBy（保留原录入人=创建者）；updatedAt 由 @updatedAt 自动。
 */
export async function updateRecord(id: string, input: RecordInput): Promise<void> {
  const { type, category, amount, date, description } = validateRecordInput(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.financeRecord.findUnique({
      where: { id },
      select: { id: true, recordedBy: true },
    });
    if (!existing) throw new FinanceRecordError("记录不存在");

    await tx.financeRecord.update({
      where: { id },
      data: {
        type,
        category,
        amount,
        date,
        description,
        // recordedBy 保留原值（不改录入人）
        recordedBy: existing.recordedBy,
      },
    });
  });
}

/**
 * 删除记录（M8-b，硬删——单用户无回收站，TASK §4-M8-b）。
 * id 不存在 → “记录不存在”。删除不需要 getFinanceUser。
 */
export async function deleteRecord(id: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.financeRecord.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new FinanceRecordError("记录不存在");

    await tx.financeRecord.delete({ where: { id } });
  });
}
