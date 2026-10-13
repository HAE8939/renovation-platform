import prisma from "@/core/db";
import {
  budgetLight,
  overallProgress,
  qualityLight,
  scheduleLight,
  type Light,
} from "@/core/domain/health";
import {
  changeTotal,
  changeWatch,
  expenseTotal,
  marginLight,
  marginRate,
  receivedTotal,
  type MarginLight,
} from "@/core/domain/ledger";
import { formatSignedCny, round2 } from "@/core/domain/pricing";
import {
  cashPeak,
  cashSeries,
  cashTone,
  collectionLight,
  collectionRate,
  funnelCounts,
  FUNNEL_STAGE_ORDER,
  isInProgress,
  leadConversion,
  monthKeysDescending,
  riskItemCount,
  signedAmountAt,
  type CashRow,
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
 * - 现金序列与毛利率排行同样「零写入、零新增查询、算式只在本文件一次」（M9-b-2b）。
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
  /**
   * 本月 vs 上月的对比条高度（CSS 百分比串，以两者较大者为 100%）。
   * 与 collectionBar 同一条纪律：几何换算在服务层做一次，页面不出现算式。
   * 上月为 0 时 prev=null（页面只画本月一根，不画"零高度的幽灵条"）。
   */
  momBar: { cur: string; prev: string | null } | null;
  risk: RiskCounts & { total: number };
}

/**
 * 项目健康度行（M10-b 起：从「只列在建」改为「列全部未归档项目」）。
 *
 * 为什么扩范围：原来这里只给在建项目（实测 2 条），页面右半因此大片空白，
 * 而老板看驾驶舱要的是"每一单现在怎样"，筹备中/已竣工同样是账上的一部分。
 * 排序＝在建优先、其余按编号，KPI「在建项目数」口径不变（仍 isInProgress 计数）。
 */
export interface HealthRow {
  id: string;
  code: string;
  name: string;
  /** 项目状态机器值（中文标签在页面经 core 的 PROJECT_STATUS_LABEL 映射） */
  status: string;
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
  /** 密集表列：合同额 / 已收 / 毛利 / 毛利率 / 风险计数（口径全部沿用 ledger，页面不算数） */
  contractAmount: number;
  incomeAmount: number;
  expenseAmount: number;
  changeAmount: number;
  profit: number;
  margin: number | null;
  marginLight: MarginLight;
  /** 未录入支出 ⇒ 毛利率不可算（决策 15 同族），页面显「—」而非 100% */
  rankable: boolean;
  openIssues: number;
  pendingNodes: number;
  nodesTotal: number;
  overdueTasks: number;
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

/** 归档参与量：页面据此出「哪些格子含它、为什么含」的说明行（M10-c）。 */
export interface ArchivedFacts {
  projectCount: number;
  income: number;
  expense: number;
}

export interface DashboardOverview {
  kpi: DashboardKpi;
  /** 已归档项目的历史事实量（0 个归档 → projectCount 0，页面不加任何说明） */
  archivedFacts: ArchivedFacts;
  health: HealthRow[];
  todos: TodoGroup[];
  funnel: DashboardFunnel;
  cash: DashboardCash;
  margins: DashboardMargins;
  generatedAt: string;
}

/**
 * 商务漏斗视图模型（M9-b-2a）。
 *
 * 只画当前 stage 存量分布，不画相邻阶段转化率——见 core/domain/dashboard.ts
 * 的 funnelCounts 注释。`stages` 按 LEAD_STAGE_ORDER 顺序输出，stage 为串、
 * 中文映射在页面本地（不 import crm/stages.ts 模块内部）。`barWidth` 为预
 * 计算的 CSS 宽度串（口径换算收敛在服务层，页面不做算式）。
 */
export interface FunnelStageRow {
  stage: string;
  count: number;
  /** 0–1 小数，四位舍入（与 collectionRate 同式）；total 0 → 0 */
  pct: number;
  /** 存量条 CSS 宽度（两位小数消浮点尾差，如 "20%" / "33.33%"）；total 0 → "0%" */
  barWidth: string;
}
export interface DashboardFunnel {
  stages: FunnelStageRow[];
  /** 全部线索数（含 order 外的，若手测脏数据） */
  total: number;
  /** 签约率 = signed / total；total 0 → null（UI 显「—」） */
  conversionRate: number | null;
}

/**
 * 线索阶段顺序取 `core/domain/dashboard.FUNNEL_STAGE_ORDER`（与 `crm/stages.ts`
 * 的同序同值由 `verify-dashboard.mjs` 断言锁死）；中文标签在页面本地映射
 * （不 import crm/stages.ts 模块内部，TASK_M9 §7-1）。
 */

/**
 * 现金序列视图模型（M9-b-2b）——现金收付口径（当月 Σincome、当月 Σexpense）。
 * 与项目毛利率口径（合同额+变更−支出）没有时间维度，二者并存但不混用；
 * 某几个月为 0 是真实现金流空白（演示项目最早 2026-08 开工），不是缺数据也不是 mock。
 * 几何值（xPct 与两个 y）在服务层换算一次，页面不再做算式。
 */

/** 现金折线单点。 */
export interface CashMonthPoint {
  /** 月键，如 "2026-08" */
  key: string;
  /** 中文月标，如 "8月"（年份由 rangeLabel 交代） */
  label: string;
  income: number;
  expense: number;
  /** income − expense，可负（两位舍入） */
  net: number;
  /** 净额色档：负 → warning */
  cashTone: "success" | "warning";
  /** 0–100，一位小数；中心等分，与页面月份轴 grid-cols-6 对齐 */
  xPct: number;
  /** 0＝峰顶、100＝基线，一位小数 */
  incomeY: number;
  expenseY: number;
}

export interface DashboardCash {
  /** 近 6 个月，左→右时间升序（最早在左） */
  points: CashMonthPoint[];
  /** max(income, expense)，空 → 0；y 映射分母 */
  peak: number;
  totalIncome: number;
  totalExpense: number;
  totalNet: number;
  /** "2026-05 ~ 2026-10"（升序键，最早在前） */
  rangeLabel: string;
  /** false → 页面可显「无现金流」空态 */
  hasAnyCash: boolean;
}

/**
 * 项目毛利率排行视图模型（M9-b-2b）。
 *
 * 范围＝主查询全部非 archived 项目（不筛在建，与健康矩阵的在建口径不同）。
 * 顺序：rankable 组按 rate 降序、同值按 code 升序；其后接「未录入支出」组、
 * 最后接「未录入合同额，不可算」组（后两组按 code 升序）。
 */
export interface MarginRankRow {
  id: string;
  code: string;
  name: string;
  /** ledger.marginRate 原值；null ＝ 合同额+变更 分母 ≤ 0 */
  rate: number | null;
  light: MarginLight;
  /** 条 CSS 宽度，rankable 才给；灰态 null（页面不渲条）。率为负时条为 "0%" 但率数值照显 */
  barWidth: string | null;
  rankable: boolean;
  /** 灰态文案；rankable 时 null */
  note: string | null;
}

export interface DashboardMargins {
  rows: MarginRankRow[];
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
  /** 毛利率与其色档在 map 里一次算出，供排行块消费，不二次计算 */
  expenseAmount: number;
  margin: number | null;
  marginLight: MarginLight;
  /** M10-b 密集健康表所需：合同额 / 已收 / 未关闭问题 / 未通过节点 / 超期工序 */
  contractAmount: number;
  incomeAmount: number;
  openIssues: number;
  pendingNodes: number;
  nodesTotal: number;
  overdueTasks: number;
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
    leads,
  ] = await Promise.all([
    // 主查询：全部项目（**含已归档**）。M10-c 口径「钱按事实 · 事按可见性」——
    // 已发生的（已收/支出/合同额/变更/毛利/毛利率）不因归档而消失，否则归档一次，
    // 历史月份的现金线与回款率会凭空少一截，已经交付出去的对账数字变得不可信。
    // 「还要做什么」（风险、待办、健康表）另用 liveRows 收窄。
    prisma.project.findMany({
      include: {
        client: { select: { name: true } },
        lead: { select: { id: true } },
        scheduleTasks: { select: { progress: true, endDate: true } },
        acceptanceNodes: { select: { status: true } },
        issues: { select: { status: true } },
        financeRecords: { select: { type: true, amount: true, date: true } },
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
    // 商务漏斗：全部线索的 stage 分布（单条查询，不进 N+1；单 org 部署，不设 org 过滤）
    // M10-a：排除已作废线索——作废＝从漏斗摘出去，否则阶段存量与签约率被死数据污染
    prisma.lead.findMany({ where: { archived: false }, select: { stage: true } }),
  ]);

  let receivedSum = 0;
  let receivableSum = 0;
  // 超期基准＝今天零点（未完工 且 计划结束日早于今天，与 health.scheduleLight 同口径）
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const rows: CalcRow[] = projects.map((p) => {
    const changeAmount = changeTotal(p.quotes.flatMap((q) => q.changes));
    const paidTotal = receivedTotal(p.financeRecords);
    // 毛利率原料：同一遍循环一次算出，供排行块消费，不二次计算
    const expenseAmount = expenseTotal(p.financeRecords);
    const margin = marginRate({
      contractAmount: p.contractAmount,
      changeTotal: changeAmount,
      expenseTotal: expenseAmount,
    });
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
      // 毛利率与其色档在 map 里一次算出，供排行块消费，不二次计算
      expenseAmount,
      margin,
      marginLight: marginLight(margin),
      contractAmount: p.contractAmount,
      incomeAmount: paidTotal,
      openIssues,
      pendingNodes,
      nodesTotal: p.acceptanceNodes.length,
      overdueTasks: p.scheduleTasks.filter(
        (t) => t.progress < 100 && t.endDate !== null && t.endDate < dayStart
      ).length,
    };
  });

  // 事按可见性：风险计数、待办、项目健康表只看未归档项目
  const liveRows = rows.filter((r) => r.status !== "archived");
  const activeRows = liveRows.filter((r) => isInProgress(r.status));

  // 归档参与量（页面据此出说明行；无归档时 projectCount=0，页面一个字都不加）
  const archivedOnly = rows.filter((r) => r.status === "archived");
  const archivedFacts = {
    projectCount: archivedOnly.length,
    income: Math.round(archivedOnly.reduce((t, r) => t + r.incomeAmount, 0) * 100) / 100,
    expense: Math.round(archivedOnly.reduce((t, r) => t + r.expenseAmount, 0) * 100) / 100,
  };

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
    scheduleRed: liveRows.filter((r) => r.schedule === "red").length,
    qualityRed: liveRows.filter((r) => r.quality === "red").length,
    budgetRed: liveRows.filter((r) => r.budget === "red").length,
    changeWarn: liveRows.filter((r) => r.changeWarn).length,
    total: 0,
  };
  risk.total = riskItemCount(risk);

  // 项目健康度表＝运营视野，只看未归档（归档的单子不再挂在待管清单里）；
  // 它的历史钱仍体现在上方签单额/回款率/现金线与右侧毛利排行中。
  const health: HealthRow[] = [...liveRows]
    .sort((a, b) => {
      const ai = isInProgress(a.status) ? 0 : 1;
      const bi = isInProgress(b.status) ? 0 : 1;
      return ai !== bi ? ai - bi : a.code.localeCompare(b.code);
    })
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      status: r.status,
      clientName: r.clientName,
      pm: r.pm,
      plannedEnd: r.endDate ? fmtDate(r.endDate) : null,
      progress: r.progress,
      hasSchedule: r.hasSchedule,
      lights: { schedule: r.schedule, quality: r.quality, budget: r.budget },
      changeWarn: r.changeWarn,
      contractAmount: r.contractAmount,
      incomeAmount: r.incomeAmount,
      expenseAmount: r.expenseAmount,
      changeAmount: r.changeAmount,
      profit: Math.round((r.contractAmount + r.changeAmount - r.expenseAmount) * 100) / 100,
      margin: r.margin,
      marginLight: r.marginLight,
      rankable: r.expenseAmount > 0,
      openIssues: r.openIssues,
      pendingNodes: r.pendingNodes,
      nodesTotal: r.nodesTotal,
      overdueTasks: r.overdueTasks,
    }));

  const warnRows = liveRows.filter((r) => r.changeWarn);
  const redRows = liveRows.filter((r) => r.schedule === "red");

  // 商务漏斗：funnelCounts + leadConversion（纯函数口径，stage 串回传，页面本地映射中文）
  const leadStages = leads.map((l) => ({ stage: l.stage }));
  const funnelStages = funnelCounts(leadStages, FUNNEL_STAGE_ORDER);
  const funnel: DashboardFunnel = {
    stages: funnelStages.map((s) => ({
      ...s,
      // 进度条宽度唯一一次换算：pct（0–1）→ 两位小数 CSS 百分比串，消浮点尾差
      barWidth: `${Math.round(s.pct * 10000) / 100}%`,
    })),
    total: leads.length,
    conversionRate: leadConversion(leadStages),
  };

  // ── 现金序列（M9-b-2b）：现金收付口径 ─────────────────────────────────────
  // 当月 Σincome、当月 Σexpense，与项目毛利率口径（合同额+变更−支出）没有
  // 时间维度，二者并存但不混用；某几个月为 0 是真实现金流空白（演示项目
  // 最早 2026-08 开工），不是缺数据也不是 mock。
  const descKeys = monthKeysDescending(6, now);
  // 时间升序（最早在左）：monthKeysDescending 由近到远，故浅拷贝后反转
  const keys = [...descKeys].reverse();
  // 全司口径：与 KPI 同一批非 archived 项目，复用主查询 financeRecords（带 date），不另发查询
  const cashRows: CashRow[] = projects.flatMap((p) =>
    p.financeRecords.map((r) => ({ type: r.type, amount: r.amount, date: r.date }))
  );
  const pts = cashSeries(cashRows, keys);
  const peak = cashPeak(pts);
  const n = keys.length;
  // 纵坐标映射：峰顶＝0、基线＝100，一位小数消浮点尾差；peak<=0 时两点都贴基线
  const yOf = (v: number): number => (peak > 0 ? Math.round((1 - v / peak) * 1000) / 10 : 100);
  const totalIncome = round2(pts.reduce((s, p) => s + p.income, 0));
  const totalExpense = round2(pts.reduce((s, p) => s + p.expense, 0));
  const cash: DashboardCash = {
    points: pts.map((p, i) => ({
      key: p.key,
      label: `${Number(p.key.slice(5, 7))}月`,
      income: p.income,
      expense: p.expense,
      net: p.net,
      cashTone: cashTone(p.net),
      // 中心等分：第 i 点落在横轴 (i+0.5)/n 处，与页面月份轴 grid-cols-6 对齐
      xPct: n > 0 ? Math.round(((i + 0.5) / n) * 1000) / 10 : 50,
      incomeY: yOf(p.income),
      expenseY: yOf(p.expense),
    })),
    peak,
    totalIncome,
    totalExpense,
    totalNet: round2(totalIncome - totalExpense),
    rangeLabel: `${keys[0]} ~ ${keys[n - 1]}`,
    hasAnyCash: pts.some((p) => p.income > 0 || p.expense > 0),
  };

  // ── 项目毛利率排行（M9-b-2b）──────────────────────────────────────────────
  // 范围＝主查询全部非 archived 项目（不筛在建，与健康矩阵的在建口径不同）。
  // 灰态剔除规则已拍板：只录合同额、没录任何支出的项目按公式恰得 100%，
  // 摆进榜首必误导 → 不入榜、率不展示（light 字段留着给巡检用，页面灰态不渲色点）。
  // 三档 tier（优先级从高到低）：0 rankable / 1 未录入支出 / 2 不可算。
  // 一次 sort 做完：tier 升序；rankable 组 rate 降序、同值 code 升序；
  // tier 1 的率恒为恰值 1（支出为 0）、tier 2 的率全为 null，故「rate 降序」
  // 这把次级键在这两组内不生效，自然落到 code 升序。
  type MarginTierRow = MarginRankRow & { tier: 0 | 1 | 2 };
  const marginTierRows: MarginTierRow[] = rows.map((r) => {
    if (r.margin === null) {
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        rate: null,
        light: "neutral",
        barWidth: null,
        rankable: false,
        note: "未录入合同额，不可算",
        tier: 2,
      };
    }
    if (r.expenseAmount === 0) {
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        rate: r.margin,
        light: r.marginLight,
        barWidth: null,
        rankable: false,
        note: "未录入支出",
        tier: 1,
      };
    }
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      rate: r.margin,
      light: r.marginLight,
      // 一位小数消浮点尾差；支出超合同+变更时率可为负 → 条宽 "0%" 但率数值照显
      barWidth: r.margin > 0 ? `${Math.round(r.margin * 1000) / 10}%` : "0%",
      rankable: true,
      note: null,
      tier: 0,
    };
  });
  const margins: DashboardMargins = {
    // tier 仅参与排序，交付前剥掉
    rows: marginTierRows
      .sort(
        (a, b) =>
          a.tier - b.tier || (b.rate ?? 0) - (a.rate ?? 0) || a.code.localeCompare(b.code)
      )
      .map(({ tier: _tier, ...row }) => row),
  };

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

  // 对比条几何（M10-b）：以两值较大者为 100%，另一个按比例；两者皆 0 → 不画条。
  // 与 collectionBar 同一条纪律——换算在服务层做一次，页面不出现算式。
  const barMax = Math.max(signed.month, signed.prevMonth);
  const momBar: DashboardKpi["momBar"] =
    barMax > 0
      ? {
          cur: `${Math.round((signed.month / barMax) * 100)}%`,
          prev: signed.prevMonth > 0 ? `${Math.round((signed.prevMonth / barMax) * 100)}%` : null,
        }
      : null;

  return {
    archivedFacts,
    kpi: {
      activeProjects: activeRows.length,
      signedThisMonth: signed.month,
      prevMonthSigned: signed.prevMonth,
      momPct: signed.momPct,
      collectionRate: rate,
      collectionLight: collectionLight(rate),
      // 进度条宽度换算唯一一次：rate > 1 钳满 100%；两位小数消浮点尾差（CSS 里不出现 15.620000000000001%）
      collectionBar: rate === null ? null : `${Math.round(Math.min(1, rate) * 10000) / 100}%`,
      momBar,
      risk,
    },
    health,
    todos,
    funnel,
    cash,
    margins,
    generatedAt: fmtStamp(now),
  };
}
