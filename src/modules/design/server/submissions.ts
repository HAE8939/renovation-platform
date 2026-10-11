import prisma from "@/core/db";
import { getPlaceholderUser } from "../currentUser";
import {
  canSubmit,
  DESIGN_TASK_STATUS_LABEL,
  isOverdue,
  type DesignTaskStatus,
} from "../status";

/**
 * 设计任务提交服务（M5-b）。
 * 读：任务详情（含倒序版本历史）；写：创建 TaskSubmission 并推进任务状态。
 * 提交人用占位当前用户（P4 接登录后只换数据源，不改表）。
 */

/** 提交校验类业务错误：中文文案直达 UI（与 crm LeadValidationError 同思路）。 */
export class DesignSubmissionError extends Error {}

/** 版本历史单条视图模型（倒序列表用）。 */
export interface TaskSubmissionItem {
  id: string;
  version: number;
  note: string;
  assetRef: string | null;
  submittedByName: string | null;
  result: string;
  rejectReason: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

/** 任务详情视图模型：基础字段 + 倒序提交历史。 */
export interface DesignTaskDetail {
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
  reviewerId: string | null;
  reviewerName: string | null;
  requirement: string;
  deadline: Date | null;
  priority: string;
  overdue: boolean;
  submissions: TaskSubmissionItem[];
}

/**
 * 取任务详情：DesignTask + 项目 code/name + 提交历史（version 倒序）。
 * assignee/reviewer/submittedBy/reviewedBy 与 User 仅逻辑引用（无 @relation），
 * 故取行后按 id 批量查名（同 server/tasks.ts 的做法）。
 * 任务不存在返回 null，由页面走 notFound()。
 */
export async function getTaskDetail(id: string): Promise<DesignTaskDetail | null> {
  const task = await prisma.designTask.findUnique({
    where: { id },
    include: {
      project: { select: { code: true, name: true } },
      submissions: { orderBy: { version: "desc" } },
    },
  });
  if (!task) return null;

  const userIds = [
    ...new Set(
      [
        task.assigneeId,
        task.reviewerId,
        ...task.submissions.flatMap((s) => [s.submittedBy, s.reviewedBy]),
      ].filter((v): v is string => v !== null)
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return {
    id: task.id,
    code: task.code,
    title: task.title,
    type: task.type,
    status: task.status,
    projectId: task.projectId,
    projectCode: task.project.code,
    projectName: task.project.name,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeId ? (nameById.get(task.assigneeId) ?? null) : null,
    reviewerId: task.reviewerId,
    reviewerName: task.reviewerId ? (nameById.get(task.reviewerId) ?? null) : null,
    requirement: task.requirement,
    deadline: task.deadline,
    priority: task.priority,
    overdue: isOverdue(task.deadline, task.status),
    submissions: task.submissions.map((s) => ({
      id: s.id,
      version: s.version,
      note: s.note,
      assetRef: s.assetRef,
      submittedByName: nameById.get(s.submittedBy) ?? null,
      result: s.result,
      rejectReason: s.rejectReason,
      reviewedByName: s.reviewedBy ? (nameById.get(s.reviewedBy) ?? null) : null,
      reviewedAt: s.reviewedAt,
      createdAt: s.createdAt,
    })),
  };
}

export interface CreateSubmissionInput {
  /** 提交说明（必填）。 */
  note: string;
  /** 交付物链接占位（可空，本期无上传）。 */
  assetRef?: string | null;
}

export interface CreatedSubmission {
  id: string;
  version: number;
}

/**
 * 执行者提交成果（M5-b）：一个 $transaction 内原子完成 ——
 * ① 校验任务存在且状态可提交（canSubmit）；
 * ② version = 该任务当前最大 version + 1；
 * ③ 建 TaskSubmission（result 固定 pending，审核是 M5-c 的事）；
 * ④ 任务状态推进为 submitted。
 *
 * 教训（M3-d2）：事务内全程用同一个 tx 客户端，不调用自开事务的其他服务；
 * 占位当前用户是只读查询（无事务），在开事务前先取。
 */
export async function createSubmission(
  taskId: string,
  input: CreateSubmissionInput
): Promise<CreatedSubmission> {
  const note = (input.note ?? "").trim();
  if (!note) throw new DesignSubmissionError("请填写提交说明");

  const assetRef = input.assetRef?.trim() || null;
  if (assetRef && !/^https?:\/\//i.test(assetRef)) {
    throw new DesignSubmissionError("交付物链接需以 http:// 或 https:// 开头");
  }

  const me = await getPlaceholderUser();
  if (!me) {
    throw new DesignSubmissionError(
      "当前无可用提交人（未找到 designer 角色用户），请先运行 seed 初始化用户"
    );
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.designTask.findUnique({
      where: { id: taskId },
      select: { id: true, status: true },
    });
    if (!task) throw new DesignSubmissionError("设计任务不存在");

    if (!canSubmit(task.status)) {
      const label = DESIGN_TASK_STATUS_LABEL[task.status as DesignTaskStatus] ?? task.status;
      throw new DesignSubmissionError(`当前任务状态为「${label}」，不可提交成果`);
    }

    const latest = await tx.taskSubmission.findFirst({
      where: { taskId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const submission = await tx.taskSubmission.create({
      data: {
        taskId,
        version,
        note,
        assetRef,
        submittedBy: me.id,
        result: "pending",
      },
    });

    await tx.designTask.update({
      where: { id: taskId },
      data: { status: "submitted" },
    });

    return { id: submission.id, version: submission.version };
  });
}
