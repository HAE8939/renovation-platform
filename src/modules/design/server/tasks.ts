import prisma from "@/core/db";
import { getPlaceholderUser } from "../currentUser";
import { isOverdue } from "../status";

/**
 * 设计任务列表服务（M5-a，只读）。
 * 跨模块数据一律走 core/db 的 prisma 直读，不 import 其他模块 server 内部。
 */

/** 看板卡片视图模型。 */
export interface DesignTaskListItem {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  deadline: Date | null;
  priority: string;
  overdue: boolean;
}

export interface ListDesignTasksOpts {
  /** all=设计任务池（全部）；mine=按占位当前用户过滤 assigneeId。 */
  scope?: "all" | "mine";
  /** 可选状态过滤（取值见 design/status.ts）。 */
  status?: string;
}

/**
 * 列出设计任务（按创建时间倒序），关联项目 code/name 与负责人姓名。
 * assignee 姓名是手工 join：DesignTask.assigneeId 对 User 仅逻辑引用（无 @relation，P4 再定），
 * 故先取行再按 id 批量查 User 名。
 */
export async function listDesignTasks(
  opts: ListDesignTasksOpts = {}
): Promise<DesignTaskListItem[]> {
  const where: { status?: string; assigneeId?: string } = {};
  if (opts.status) where.status = opts.status;
  if (opts.scope === "mine") {
    const me = await getPlaceholderUser();
    // 无占位用户（如未 seed designer）→ 过滤成空集，页面走诚实空态，不造假数据。
    where.assigneeId = me?.id ?? "__no_placeholder_user__";
  }

  const rows = await prisma.designTask.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { project: { select: { code: true, name: true } } },
  });

  const assigneeIds = [
    ...new Set(rows.map((r) => r.assigneeId).filter((v): v is string => v !== null)),
  ];
  const users = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    type: r.type,
    status: r.status,
    projectId: r.projectId,
    projectCode: r.project.code,
    projectName: r.project.name,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeId ? (nameById.get(r.assigneeId) ?? null) : null,
    deadline: r.deadline,
    priority: r.priority,
    overdue: isOverdue(r.deadline, r.status, now),
  }));
}

/** 任务总数（页头统计用；取 DB 真值，不抄常量）。 */
export async function getDesignTaskCount(): Promise<number> {
  return prisma.designTask.count();
}
