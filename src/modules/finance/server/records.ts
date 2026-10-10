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
import type { FinanceType } from "../types";

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
