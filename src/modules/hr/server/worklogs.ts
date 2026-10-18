import prisma from "@/core/db";
import { getHrPageData } from "./people";
import { isWorkLogCategory, WORKLOG_CATEGORY_LABEL } from "../worklogs";

export class WorkLogError extends Error {}

/**
 * 工时列表页数据。
 *
 * 归档口径（M13 体检 · 已由业务拍板）：工时属“钱按事实”族——已发生的工时是既成事实，
 * 所以 `archived` 位**只隐藏这里的列表可见性**，不作为统计的减项。
 * 将来做“人效 / 工时投入”聚合时，**必须包含已归档记录**，不得复用本查询的 archived:false，
 * 否则某人一旦归档过记录，他的历史投入就会凭空少一截——与已收/支出同源（AGENTS §4.3）。
 * archivedCount 随页返回，避免员工以为归档掉的记录消失了。
 */
export async function getWorkLogPageData() {
  const [base, logs, archivedCount] = await Promise.all([
    getHrPageData(),
    prisma.workLog.findMany({
      where: { archived: false },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      include: { project: { select: { code: true, name: true, status: true } }, user: { select: { name: true } } },
    }),
    prisma.workLog.count({ where: { archived: true } }),
  ]);
  return { ...base, logs: logs.map((l) => ({ ...l, categoryLabel: WORKLOG_CATEGORY_LABEL[l.category] ?? l.category })), archivedCount };
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
  // 流水由动作层写（§4.4-③：动作层埋点，不在服务层）——服务函数将来被别处
  // 包进 $transaction 复用时，流水一旦进事务就会连业务一起滚掉。
  return row;
}

/**
 * 归档一条工作记录。返回被归档的行（供动作层写流水与提示），行不存在返回 null。
 * 口径见 getWorkLogPageData 上方注释：归档只隐藏列表，不减工时统计。
 */
export async function archiveWorkLog(id: string) {
  const row = await prisma.workLog.findUnique({ where: { id } });
  if (!row) return null;
  await prisma.workLog.update({ where: { id }, data: { archived: true } });
  return row;
}
