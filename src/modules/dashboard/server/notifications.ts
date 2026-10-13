/**
 * notifications.ts —— 顶栏通知中心取数（M10-a UI-12 · dashboard 模块）
 *
 * 为什么放 dashboard 模块而不是 core：它聚合的是跨模块"该看一眼的事"，
 * 与驾驶舱「全局待办中心」同一语义（同一批谓词、同一套链接），只是更轻——
 * 驾驶舱整页要算矩阵/折线/排行，通知铃铛只要五个数。
 *
 * 为什么不复用 getDashboardOverview：那个函数一次拉全司项目 + 全部工序 + 节点 + 台账，
 * 铃铛是**每页都挂在顶栏**的东西，不能为它付整页成本。故本函数按需拉最小集，
 * 且前端**首次点开才请求**（见 NotificationBell）。
 *
 * 口径全部沿用既有纯函数与既有谓词，不另立一套判断（避免"两处算得不一样"这类老坑）：
 * · 待审核节点 = AcceptanceNode.status=="submitted"
 * · 未整改问题 = Issue.status=="open"
 * · 超期工序   = ScheduleTask.endDate < 今天 且 progress < 100（同 health.scheduleLight 的超期定义）
 * · 变更预警   = ledger.changeWatch(合同额, Σ变更).warn（>5%）
 * · 待跟进线索 = Lead.nextFollowAt <= 今天 且未签约未作废
 * 三条既有纪律照守：范围排除 archived 项目与已作废线索；不造假数据；空则不出组。
 */

import prisma from "@/core/db";
import { changeWatch } from "@/core/domain/ledger";

export interface NotificationRow {
  /** 展示文案（中文，含主体名） */
  label: string;
  /** 点进去的页（项目级深链用 id，见 AGENTS §4.1） */
  href: string;
}

export interface NotificationGroup {
  id: "node-review" | "issue-open" | "schedule-overdue" | "change-watch" | "lead-followup";
  title: string;
  count: number;
  rows: NotificationRow[];
  /** 该组的"全部"入口（例如问题台账页） */
  allHref: string;
}

export interface NotificationSummary {
  /** 未读总数（各组计数之和，用于铃铛角标） */
  total: number;
  groups: NotificationGroup[];
  /** 生成时刻，界面显示"更新于 …"用 */
  at: string;
}

const MAX_ROWS = 3;
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function getNotificationSummary(): Promise<NotificationSummary> {
  const t0 = today();
  const notArchived = { status: { not: "archived" } } as const;

  const [nodes, issues, overdueTasks, leads, projects] = await Promise.all([
    prisma.acceptanceNode.findMany({
      where: { status: "submitted", project: notArchived },
      select: { id: true, name: true, project: { select: { id: true, code: true, name: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    prisma.issue.findMany({
      where: { status: "open", project: notArchived },
      select: { id: true, title: true, project: { select: { id: true, code: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.scheduleTask.findMany({
      where: { progress: { lt: 100 }, endDate: { lt: t0 }, project: notArchived },
      select: { id: true, name: true, endDate: true, project: { select: { id: true, code: true, name: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.lead.findMany({
      where: { archived: false, stage: { not: "signed" }, nextFollowAt: { not: null, lte: new Date(t0.getTime() + 86400000 - 1) } },
      select: { id: true, name: true, code: true, nextFollowAt: true },
      orderBy: { nextFollowAt: "asc" },
    }),
    prisma.project.findMany({
      where: { ...notArchived, contractAmount: { gt: 0 } },
      select: { id: true, code: true, name: true, contractAmount: true, quotes: { select: { id: true, changes: { select: { amount: true } } } } },
    }),
  ]);

  // 变更预警：走 core 纯函数 changeWatch，不在这里重算 5% 口径
  const changeRows = projects
    .map((p) => {
      const total = (p.quotes[0]?.changes ?? []).reduce((s, c) => s + Number(c.amount || 0), 0);
      const w = changeWatch(p.contractAmount, total);
      return { p, total, warn: w.warn, ratio: w.ratio };
    })
    .filter((r) => r.warn);

  const groups: NotificationGroup[] = [];
  const push = (g: NotificationGroup) => {
    if (g.count > 0) groups.push(g);
  };

  push({
    id: "node-review",
    title: "待审核验收",
    count: nodes.length,
    allHref: "/quality",
    rows: nodes.slice(0, MAX_ROWS).map((n) => ({
      label: `${n.project?.code ?? ""} ${n.name}`,
      href: `/quality/nodes/${n.id}`,
    })),
  });

  push({
    id: "issue-open",
    title: "未整改问题",
    count: issues.length,
    allHref: "/quality/issues",
    rows: issues.slice(0, MAX_ROWS).map((i) => ({
      label: `${i.project?.code ?? ""} ${i.title}`,
      href: `/quality/issues?focus=${i.id}`,
    })),
  });

  // 超期按项目归并（同项目多条超期只占一行，否则一个项目就能刷满面板）
  const byProject = new Map<string, { code: string; name: string; n: number; id: string }>();
  for (const t of overdueTasks) {
    const key = t.project?.id ?? "—";
    const cur = byProject.get(key);
    if (cur) cur.n += 1;
    else byProject.set(key, { code: t.project?.code ?? "", name: t.project?.name ?? "", n: 1, id: key });
  }
  const overdueList = [...byProject.values()];
  push({
    id: "schedule-overdue",
    title: "工期超期",
    count: overdueTasks.length,
    allHref: "/schedule",
    rows: overdueList.slice(0, MAX_ROWS).map((p) => ({
      label: `${p.code} ${p.name} · ${p.n} 道工序超期`,
      href: `/schedule/${p.id}`,
    })),
  });

  push({
    id: "change-watch",
    title: "变更超合同额 5%",
    count: changeRows.length,
    allHref: "/projects",
    rows: changeRows.slice(0, MAX_ROWS).map((r) => ({
      label: `${r.p.code} ${r.p.name} · 累计 ${(r.ratio ?? 0) >= 0 ? "+" : ""}${Math.round((r.ratio ?? 0) * 1000) / 10}%`,
      href: `/budget/${r.p.id}/changes`,
    })),
  });

  push({
    id: "lead-followup",
    title: "该跟进的线索",
    count: leads.length,
    allHref: "/crm",
    rows: leads.slice(0, MAX_ROWS).map((l) => ({
      label: `${l.code} ${l.name} · 约定 ${l.nextFollowAt ? new Date(l.nextFollowAt).toLocaleDateString("zh-CN") : "—"}`,
      href: `/crm?view=list`,
    })),
  });

  return {
    total: groups.reduce((s, g) => s + g.count, 0),
    groups,
    at: new Date().toISOString(),
  };
}
