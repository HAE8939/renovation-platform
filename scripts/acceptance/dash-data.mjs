/**
 * dash-data.mjs —— 把驾驶舱要用的真数一次性导出，供静态样张使用（只读实库，不写）
 */
import { prisma } from "../../src/core/db/index.ts";

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const cents = (n) => Math.round(Number(n || 0) * 100);
const now = new Date();

// 预言机口径（M10-c 同步）：主查询含已归档——钱按事实；
  // 风险/待办/健康表另用 live 子集——事按可见性。
const ps = await prisma.project.findMany({
  select: {
    id: true, code: true, name: true, status: true, contractAmount: true, area: true,
    client: { select: { name: true } },
    scheduleTasks: { select: { name: true, progress: true, endDate: true } },
    acceptanceNodes: { select: { name: true, status: true } },
    financeRecords: { select: { type: true, amount: true } },
    paymentNodes: { select: { name: true, paid: true, amountDue: true } },
    issues: { select: { status: true } },
    quotes: { select: { id: true, changes: { select: { amount: true } } } },
  },
  orderBy: { code: "asc" },
});

const rec = await prisma.financeRecord.findMany({ select: { type: true, amount: true, date: true } });
const signed = await prisma.lead.findMany({
  where: { stage: "signed" },
  select: { project: { select: { contractAmount: true, createdAt: true } } },
});

const received = rec.filter((r) => r.type === "income").reduce((s, r) => s + cents(r.amount), 0);
const spent = rec.filter((r) => r.type === "expense").reduce((s, r) => s + cents(r.amount), 0);
const live = ps.filter((p) => p.status !== "archived");
const contract = ps.reduce((s, p) => s + cents(p.contractAmount), 0);
const changeAll = ps.reduce(
  (s, p) => s + p.quotes.reduce((t, q) => t + q.changes.reduce((u, c) => u + cents(c.amount), 0), 0), 0
);

let thisMonth = 0;
let prevMonth = 0;
const prevKey = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
for (const l of signed) {
  if (!l.project) continue;
  const k = ym(l.project.createdAt);
  if (k === ym(now)) thisMonth += cents(l.project.contractAmount);
  else if (k === prevKey) prevMonth += cents(l.project.contractAmount);
}

const monthly = [];
for (let i = 5; i >= 0; i--) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  const k = ym(d);
  monthly.push({
    key: k,
    income: rec.filter((r) => r.type === "income" && ym(r.date) === k).reduce((s, r) => s + cents(r.amount), 0) / 100,
    expense: rec.filter((r) => r.type === "expense" && ym(r.date) === k).reduce((s, r) => s + cents(r.amount), 0) / 100,
  });
}

const projects = ps.map((p) => {
  const inc = p.financeRecords.filter((r) => r.type === "income").reduce((s, r) => s + cents(r.amount), 0);
  const exp = p.financeRecords.filter((r) => r.type === "expense").reduce((s, r) => s + cents(r.amount), 0);
  const ch = p.quotes.reduce((t, q) => t + q.changes.reduce((u, c) => u + cents(c.amount), 0), 0);
  const base = cents(p.contractAmount) + ch;
  const tasks = p.scheduleTasks;
  const progress = tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : null;
  const overdue = tasks.filter((t) => t.progress < 100 && new Date(t.endDate) < now).length;
  const openIssues = p.issues.filter((i) => i.status !== "closed").length;
  return {
    code: p.code,
    name: p.name,
    client: p.client?.name ?? "—",
    status: p.status,
    area: p.area,
    contract: cents(p.contractAmount) / 100,
    income: inc / 100,
    expense: exp / 100,
    change: ch / 100,
    profit: (base - exp) / 100,
    margin: base ? ((base - exp) / base) * 100 : null,
    progress,
    scheduled: tasks.length > 0,
    overdue,
    nodes: p.acceptanceNodes.length,
    nodesPending: p.acceptanceNodes.filter((n) => n.status !== "passed").length,
    openIssues,
    paidSegs: p.paymentNodes.filter((n) => n.paid).length,
    segs: p.paymentNodes.length,
    paidPct: base ? inc / base : 0,
    changeWarn: base > 0 && Math.abs(ch) / base > 0.05,
  };
});

const out = {
  generatedAt: now.toISOString().slice(0, 16).replace("T", " "),
  thisMonth: thisMonth / 100,
  prevMonth: prevMonth / 100,
  momPct: prevMonth ? ((thisMonth - prevMonth) / prevMonth) * 100 : null,
  inProgress: projects.filter((p) => ["design", "in_progress", "acceptance"].includes(p.status)).length,
  projectCount: projects.length,
  archivedCount: ps.length - live.length,
  rate: contract + changeAll ? (received / (contract + changeAll)) * 100 : 0,
  received: received / 100,
  spent: spent / 100,
  contract: contract / 100,
  changeAll: changeAll / 100,
  receivable: (contract + changeAll - received) / 100,
  // 风险只看未归档（live 的 code 集）
  risk: (() => {
    const liveCodes = new Set(live.map((p) => p.code));
    const lp = projects.filter((p) => liveCodes.has(p.code));
    return {
      schedule: lp.reduce((s, p) => s + (p.overdue ? 1 : 0), 0),
      quality: lp.filter((p) => p.openIssues > 0).length,
      budget: lp.filter((p) => p.scheduled && p.paidPct < 0.4).length,
      change: lp.filter((p) => p.changeWarn).length,
    };
  })(),
  todos: {
    nodeReview: await prisma.acceptanceNode.count({ where: { status: "submitted", project: { status: { not: "archived" } } } }),
    issuesOpen: await prisma.issue.count({ where: { status: { not: "closed" }, project: { status: { not: "archived" } } } }),
    designReview: await prisma.designTask.count({ where: { status: "submitted" } }),
    unpaidSegs: await prisma.paymentNode.count({ where: { paid: false, project: { status: { not: "archived" } } } }),
    overdueTasks: await prisma.scheduleTask.count({ where: { progress: { lt: 100 }, endDate: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }, project: { status: { not: "archived" } } } }),
  },
  monthly,
  projects,
  // 表格行数＝未归档项目数
  rosterCount: live.length,
};

console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
