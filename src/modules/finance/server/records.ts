/**
 * 财务管控 · 收支台账只读服务（M8-a）。
 *
 * 本单元只读：listRecords 不写任何 create/update/delete（写操作归 M8-b）。
 * 跨模块读走 core/db prisma 直读，不 import 其他模块内部（AGENTS §2）。
 * 口径全走 core/domain/ledger.ts 与 finance/payment.ts 的纯函数 ——
 * 页面/服务里不得出现第二处算式（TASK_M8 §5）。
 */

import prisma from "@/core/db";
import {
  expenseTotal,
  grossProfit,
  marginLight,
  marginRate,
  receivedTotal,
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
  /** 待收款 = round2(max(0, 合同额 − 已收))（收款缺口口径，与计划段解耦，§7-12） */
  pendingTotal: number;
  /** 计划未付合计 = Σ PaymentNode.amountDue(paid=false)（与待收款不同不合并） */
  unpaidPlanTotal: number;
  expenseTotal: number;
  grossProfit: number;
  /** 毛利率（合同额未录入 → null，UI 显「—」） */
  marginRate: number | null;
  /** 毛利率色档（neutral = 不可算） */
  marginLight: "green" | "yellow" | "red" | "neutral";
}

export interface ListRecordsResult {
  rows: FinanceRecordRow[];
  projectOptions: ProjectOption[];
  summary: FinanceSummary;
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

  const [records, projectOptions, projects, paymentNodes] = await Promise.all([
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
      select: { id: true, contractAmount: true },
    }),
    prisma.paymentNode.findMany({
      where: projectId ? { projectId } : {},
      select: { amountDue: true, paid: true },
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
  let allTypeRecords: { type: string; amount: number }[] = [];
  if (view) {
    allTypeRecords = await prisma.financeRecord.findMany({
      where: { ...(projectId ? { projectId } : {}) },
      select: { type: true, amount: true },
    });
  } else {
    allTypeRecords = records.map((r) => ({ type: r.type, amount: r.amount }));
  }

  const ledgerRecords = allTypeRecords.map(toLedderRecord);
  const contractAmount = round2(
    projects.reduce((s, p) => s + (p.contractAmount ?? 0), 0)
  );
  const received = receivedTotal(ledgerRecords);
  const expense = expenseTotal(ledgerRecords);
  const unpaidPlanTotal = round2(
    paymentNodes.filter((n) => !n.paid).reduce((s, n) => s + (n.amountDue ?? 0), 0)
  );
  const profit = grossProfit({
    contractAmount,
    changeTotal: 0, // 变更额留 M9（§0 红线 / §7-9）
    expenseTotal: expense,
  });
  const rate = marginRate({
    contractAmount,
    changeTotal: 0,
    expenseTotal: expense,
  });

  const summary: FinanceSummary = {
    contractAmount,
    receivedTotal: round2(received),
    pendingTotal: round2(Math.max(0, contractAmount - received)),
    unpaidPlanTotal,
    expenseTotal: round2(expense),
    grossProfit: profit,
    marginRate: rate,
    marginLight: marginLight(rate),
  };

  return { rows, projectOptions, summary };
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
 * - type ∈ {income, expense}（「收支类型非法」）；
 * - category ∈ categoriesFor(type)（「科目与收支类型不匹配」——防错账第一道闸）；
 * - amount 有限数且 > 0（「金额需为大于 0 的数字」；方向由 type 决定、不接受负数）；
 * - dateIso 可解析（「日期格式非法」）；
 * - 占位录入人 getFinanceUser()，null → 「未找到录入人，请先运行 seed 初始化用户」；
 * - description 去空白、可空（存 ""）。
 * 事务内：project.findUnique 不存在 → 「项目不存在」。写 recordedBy=占位用户 id。
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
 * 守卫同 createRecord；额外：id 不存在 → 「记录不存在」。
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
 * id 不存在 → 「记录不存在」。删除不需要 getFinanceUser。
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
