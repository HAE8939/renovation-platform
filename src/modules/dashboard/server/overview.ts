import prisma from "@/core/db";
import {
  budgetLight,
  overallProgress,
  qualityLight,
  scheduleLight,
  type Light,
} from "@/core/domain/health";
import { changeTotal, changeWatch, receivedTotal } from "@/core/domain/ledger";
import { formatSignedCny } from "@/core/domain/pricing";
import {
  collectionLight,
  collectionRate,
  isInProgress,
  riskItemCount,
  signedAmountAt,
  type CollectionLight,
  type RiskCounts,
} from "@/core/domain/dashboard";

/**
 * 数据驾驶舱只读聚合服务（M9-b-1）。
 *
 * - 跨模块纪律：只做 prisma 直读 + 调 core/domain 纯函数口径，
 *   绝不 import 其他模块的 server 内部实现。
 * - 零写入：本文件不写库、不调 syncAcceptanceNodes——驾驶舱保持只读，
 *   验收节点的生成由排程更新的同事务负责。
 * - 查询纪律：一条主查询拿全健康矩阵与 KPI 原料；待办四类各自
 *   count + 前 3 条摘要，与主查询合并为一次 Promise.all，禁 N+1。
 * - 口径纪律：在建三态 / 签单月键 / 回款率与色档 / 风险红灯全部收敛在
 *   core/domain/{dashboard,health,ledger}，本文件不出现阈值字面量；
 *   回款率进度条宽度换算只在此处做一次，页面直接消费不再计算。
 */

/**
 * 日期展示：与 `projects/server/projectDetail.ts` 的 fmtDate 同款（zh-CN 数字三位，
 * 如「2026/10/11」）——驾驶舱的预计完工要和项目中心、排程页对得上，不另起一种样式。
 */
function fmtDate(d: Date): string {
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 生成时刻串：zh-CN 数字日期 + 24 小时制到分（同款取数风格）。 */
function fmtStamp(d: Date): string {
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface DashboardKpi {
  /** isInProgress(status) 计数（范围已排除 archived） */
  activeProjects: number;
  /** 本月签单额（只计「签约建项」，按 createdAt 落本地日历月） */
  signedThisMonth: number;
  prevMonthSigned: number;
  momPct: number | null;
  /** 全司回款率：Σ收入 / Σmax(0, 合同额+变更)，非 archived 范围 */
  collectionRate: number | null;
  collectionLight: CollectionLight;
  /** 回款率进度条的 CSS 宽度（>1 钳满 100%）；rate 为 null → null（页面不渲条、显「—」）。算式只在此处一次。 */
  collectionBar: string | null;
  risk: RiskCounts & { total: number };
}

export interface HealthRow {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  pm: string | null;
  /** 计划完工日（zh-CN 三位）；null → 页面显「—」 */
  plannedEnd: string | null;
  progress: number;
  /** 是否已有排程工序（false 时页面显灰「未排程」，不假绿） */
  hasSchedule: boolean;
  lights: { schedule: Light; quality: Light; budget: Light };
  /** 累计变更预警（changeWatch.warn，用带符号变更原值判定） */
  changeWarn: boolean;
}

export interface TodoItem {
  id: string;
  label: string;
  href: string;
}

export interface TodoGroup {
  key: string;
  label: string;
  count: number;
  href: string;
  items: TodoItem[];
  /** 灰占位组（模块未上线）：页面渲占位文案 + 「未接入」徽标，不给链 */
  placeholder?: boolean;
}

export interface DashboardOverview {
  kpi: DashboardKpi;
  health: HealthRow[];
  todos: TodoGroup[];
  generatedAt: string;
}

/** 主查询单行的中间计算结果（KPI / 健康矩阵 / 待办共用，避免重复展开关系）。 */
interface CalcRow {
  id: string;
  code: string;
  name: string;
  status: string;
  clientName: string | null;
  pm: string | null;
  endDate: Date | null;
  progress: number;
  hasSchedule: boolean;
  schedule: Light;
  quality: Light;
  budget: Light;
  changeWarn: boolean;
  changeAmount: number;
}

export async function getDashboardOverview(
  now: Date = new Date()
): Promise<DashboardOverview> {
  const [
    projects,
    nodeCount,
    nodeList,
    issueCount,
    issueList,
    designCount,
    designList,
    payCount,
    payList,
  ] = await Promise.all([
    // 主查询：全部非 archived 项目，一次带齐矩阵与 KPI 原料
    prisma.project.findMany({
      where: { status: { not: "archived" } },
      include: {
        client: { select: { name: true } },
        lead: { select: { id: true } },
        scheduleTasks: { select: { progress: true } },
        acceptanceNodes: { select: { status: true } },
        issues: { select: { status: true } },
        financeRecords: { select: { type: true, amount: true } },
        quotes: { select: { status: true, changes: { select: { amount: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    // 待办四类：count + 前 3 条（createdAt 升序 = 最久未处理优先）
    prisma.acceptanceNode.count({
      where: { status: "submitted", project: { status: { not: "archived" } } },
    }),
    prisma.acceptanceNode.findMany({
      where: { status: "submitted", project: { status: { not: "archived" } } },
      select: { id: true, name: true, project: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
      take: 3,
    }),
    prisma.issue.count({
      where: { status: { not: "closed" }, project: { status: { not: "archived" } } },
    }),
    prisma.issue.findMany({
      where: { status: { not: "closed" }, project: { status: { not: "archived" } } },
      select: { id: true, title: true, project: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
      take: 3,
    }),
    prisma.designTask.count({
      where: { status: "submitted", project: { status: { not: "archived" } } },
    }),
    prisma.designTask.findMany({
      where: { status: "submitted", project: { status: { not: "archived" } } },
      select: { id: true, title: true, project: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
      take: 3,
    }),
    prisma.paymentNode.count({
      where: { paid: false, project: { status: { not: "archived" } } },
    }),
    prisma.paymentNode.findMany({
      where: { paid: false, project: { status: { not: "archived" } } },
      select: { id: true, name: true, projectId: true, project: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
      take: 3,
    }),
  ]);

  let receivedSum = 0;
  let receivableSum = 0;

  const rows: CalcRow[] = projects.map((p) => {
    const changeAmount = changeTotal(p.quotes.flatMap((q) => q.changes));
    const paidTotal = receivedTotal(p.financeRecords);
    const openIssues = p.issues.filter((i) => i.status !== "closed").length;
    const pendingNodes =
      p.acceptanceNodes.length - p.acceptanceNodes.filter((n) => n.status === "passed").length;
    const progress = overallProgress(p.scheduleTasks.map((t) => ({ progress: t.progress })));

    // 同一遍循环顺带累计全司回款率原料（Σ收入 / Σmax(0, 合同额+变更)），避免二次展开
    receivedSum += paidTotal;
    receivableSum += Math.max(0, p.contractAmount + changeAmount);

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      clientName: p.client?.name ?? null,
      pm: p.pm ?? null,
      endDate: p.endDate,
      progress,
      hasSchedule: p.scheduleTasks.length > 0,
      schedule: scheduleLight(
        { endDate: p.endDate, actualEndDate: p.actualEndDate, progress },
        now
      ),
      quality: qualityLight({ openIssues, pendingNodes }),
      budget: budgetLight({
        contractAmount: p.contractAmount,
        changeTotal: changeAmount,
        paidTotal,
      }),
      changeWarn: changeWatch(p.contractAmount, changeAmount).warn,
      changeAmount,
    };
  });

  const activeRows = rows.filter((r) => isInProgress(r.status));

  const signed = signedAmountAt(
    projects.map((p) => ({
      contractAmount: p.contractAmount,
      createdAt: p.createdAt,
      signed: p.lead !== null, // lead 非空即「由签约建项而来」
    })),
    now
  );

  const rate = collectionRate(receivedSum, receivableSum);

  const risk: RiskCounts & { total: number } = {
    scheduleRed: rows.filter((r) => r.schedule === "red").length,
    qualityRed: rows.filter((r) => r.quality === "red").length,
    budgetRed: rows.filter((r) => r.budget === "red").length,
    changeWarn: rows.filter((r) => r.changeWarn).length,
    total: 0,
  };
  risk.total = riskItemCount(risk);

  const health: HealthRow[] = activeRows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    clientName: r.clientName,
    pm: r.pm,
    plannedEnd: r.endDate ? fmtDate(r.endDate) : null,
    progress: r.progress,
    hasSchedule: r.hasSchedule,
    lights: { schedule: r.schedule, quality: r.quality, budget: r.budget },
    changeWarn: r.changeWarn,
  }));

  const warnRows = rows.filter((r) => r.changeWarn);
  const redRows = rows.filter((r) => r.schedule === "red");

  // 七组待办，顺序与口径固定；第 7 组为灰占位（人员管控模块未上线）
  const todos: TodoGroup[] = [
    {
      key: "nodes-review",
      label: "待审验收节点",
      count: nodeCount,
      href: "/quality",
      items: nodeList.map((n) => ({
        id: n.id,
        label: `${n.project.code} · ${n.name}`,
        href: `/quality/nodes/${n.id}`,
      })),
    },
    {
      key: "issues-open",
      label: "未关闭质量问题",
      count: issueCount,
      href: "/quality/issues",
      items: issueList.map((it) => ({
        id: it.id,
        label: `${it.project.code} · ${it.title}`,
        href: "/quality/issues",
      })),
    },
    {
      key: "design-review",
      label: "待审设计任务",
      count: designCount,
      href: "/design",
      items: designList.map((t) => ({
        id: t.id,
        label: `${t.project.code} · ${t.title}`,
        href: `/design/${t.id}`,
      })),
    },
    {
      key: "payment-unpaid",
      label: "待收付款段",
      count: payCount,
      href: "/finance/payments",
      items: payList.map((n) => ({
        id: n.id,
        label: `${n.project.code} · ${n.name}`,
        href: `/finance/payments?projectId=${n.projectId}`,
      })),
    },
    {
      key: "change-watch",
      label: "变更超 5% 预警项目",
      count: warnRows.length,
      href: "/budget",
      items: warnRows.slice(0, 3).map((r) => ({
        id: r.id,
        label: `${r.code} · 累计变更 ${formatSignedCny(r.changeAmount)}`,
        href: `/budget/${r.id}/changes`,
      })),
    },
    {
      key: "schedule-red",
      label: "工期红灯项目",
      count: redRows.length,
      href: "/schedule",
      items: redRows.slice(0, 3).map((r) => ({
        id: r.id,
        label: `${r.code} · ${r.name}`,
        href: `/schedule/${r.id}`,
      })),
    },
    {
      key: "hr-review",
      label: "待审批绩效报告",
      count: 0,
      href: "",
      items: [],
      placeholder: true,
    },
  ];

  return {
    kpi: {
      activeProjects: activeRows.length,
      signedThisMonth: signed.month,
      prevMonthSigned: signed.prevMonth,
      momPct: signed.momPct,
      collectionRate: rate,
      collectionLight: collectionLight(rate),
      // 进度条宽度换算唯一一次：rate > 1 钳满 100%；两位小数消浮点尾差（CSS 里不出现 15.620000000000001%）
      collectionBar: rate === null ? null : `${Math.round(Math.min(1, rate) * 10000) / 100}%`,
      risk,
    },
    health,
    todos,
    generatedAt: fmtStamp(now),
  };
}
