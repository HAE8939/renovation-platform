import prisma from "@/core/db";
import { recordOperation } from "@/core/domain/operationLog";
import { getHrPageData } from "./people";
import { isWorkLogCategory, WORKLOG_CATEGORY_LABEL } from "../worklogs";

export class WorkLogError extends Error {}

export async function getWorkLogPageData() {
  const [base, logs] = await Promise.all([
    getHrPageData(),
    prisma.workLog.findMany({
      where: { archived: false },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: { project: { select: { code: true, name: true, status: true } }, user: { select: { name: true } } },
    }),
  ]);
  return { ...base, logs: logs.map((l) => ({ ...l, categoryLabel: WORKLOG_CATEGORY_LABEL[l.category] ?? l.category })) };
}

export async function createWorkLog(input: { projectId: string; userId: string; workDate: string; category: string; title: string; description?: string; minutes?: string; outputNote?: string }) {
  const title = input.title.trim();
  if (!input.projectId || !input.userId || !title) throw new WorkLogError("请完整填写项目、人员和工作事项");
  if (!isWorkLogCategory(input.category)) throw new WorkLogError("工作类型不合法");
  const date = new Date(input.workDate);
  if (Number.isNaN(date.getTime())) throw new WorkLogError("工作日期格式非法");
  const minutes = input.minutes?.trim() ? Number(input.minutes) : null;
  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)) throw new WorkLogError("工时应为 0 至 1440 分钟");
  const row = await prisma.workLog.create({ data: { projectId: input.projectId, userId: input.userId, workDate: date, category: input.category, title, description: (input.description ?? "").trim(), minutes: minutes === null ? null : Math.round(minutes), outputNote: (input.outputNote ?? "").trim() } });
  await recordOperation({ action: "worklog.create", entity: "workLog", entityId: row.id, projectId: row.projectId, summary: `新增工作记录「${row.title}」`, after: `${WORKLOG_CATEGORY_LABEL[row.category] ?? row.category} · ${row.workDate.toLocaleDateString("zh-CN")}` });
  return row;
}

export async function archiveWorkLog(id: string) {
  const row = await prisma.workLog.findUnique({ where: { id } });
  if (!row) return;
  await prisma.workLog.update({ where: { id }, data: { archived: true } });
  await recordOperation({ action: "worklog.archive", entity: "workLog", entityId: id, projectId: row.projectId, summary: `归档工作记录「${row.title}」`, before: "active", after: "archived" });
}
