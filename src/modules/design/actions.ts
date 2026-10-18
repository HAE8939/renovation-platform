"use server";

import { revalidatePath } from "next/cache";
import { createSubmission, DesignSubmissionError } from "./server/submissions";
import { reviewSubmission, DesignReviewError } from "./server/review";
import {
  createDesignTask,
  assignDesignTask,
  DesignTaskError,
} from "./server/create";
import { DESIGN_TASK_STATUS_LABEL, type DesignTaskStatus } from "./status";
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation } from "@/core/domain/operationLog";
import prisma from "@/core/db";

/**
 * 新建设计任务（M5-e）。projectId 由隐藏字段传入；建单可同时指派（assigneeId 空 → 待分配）。
 * 成功后刷新看板（新建即影响任务池列分布）；校验失败回中文文案，不抛到 UI。
 */
export interface DesignCreateFormState {
  error?: string;
  ok?: boolean;
}

export async function createDesignTaskAction(
  _prev: DesignCreateFormState,
  formData: FormData
): Promise<DesignCreateFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const projectId = text("projectId");
    if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };

    const created = await createDesignTask({
      projectId,
      title: text("title"),
      type: text("type"),
      requirement: text("requirement"),
      deadlineIso: text("deadline") || null,
      priority: text("priority") || "medium",
      assigneeId: text("assigneeId") || null,
    });

    const title = text("title");
    await recordOperation({
      action: "design.create",
      entity: "designTask",
      entityId: created.id,
      projectId,
      summary: `新建设计任务“${title}”（${created.code}${
        text("assigneeId") ? "，已指派" : "，待分配"
      }）`,
      after: created.code,
    });

    revalidatePath("/design");
    revalidatePath(`/design/${created.id}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof DesignTaskError) return { error: e.message };
    logAppError("[createDesignTaskAction]", e);
    return { error: "新建失败，请稍后重试" };
  }
}

/**
 * 指派 / 改派既有任务（M5-e）。taskId / assigneeId 走表单；成功后刷新看板与详情。
 * 流水记 before→after 状态（pending→assigned 是真实推进，改派则前后同态，仍留“换人”事实）。
 */
export interface DesignAssignFormState {
  error?: string;
  ok?: boolean;
}

export async function assignDesignTaskAction(
  _prev: DesignAssignFormState,
  formData: FormData
): Promise<DesignAssignFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const taskId = text("taskId");
    const assigneeId = text("assigneeId");
    if (!taskId) return { error: "缺少任务标识，请刷新页面后重试" };

    const res = await assignDesignTask(taskId, assigneeId);

    const task = await prisma.designTask.findUnique({
      where: { id: taskId },
      select: { code: true, title: true, projectId: true },
    });
    const assignee = await prisma.user.findUnique({
      where: { id: res.assigneeId },
      select: { name: true },
    });
    const beforeLabel = DESIGN_TASK_STATUS_LABEL[res.before as DesignTaskStatus] ?? res.before;
    const afterLabel = DESIGN_TASK_STATUS_LABEL[res.after as DesignTaskStatus] ?? res.after;
    await recordOperation({
      action: "design.assign",
      entity: "designTask",
      entityId: taskId,
      projectId: task?.projectId ?? null,
      summary: `指派设计任务“${task?.title ?? taskId}”给 ${assignee?.name ?? "负责人"}（${beforeLabel} → ${afterLabel}）`,
      before: res.before,
      after: res.after,
    });

    revalidatePath("/design");
    revalidatePath(`/design/${taskId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof DesignTaskError) return { error: e.message };
    logAppError("[assignDesignTaskAction]", e);
    return { error: "指派失败，请稍后重试" };
  }
}

export interface SubmitTaskFormState {
  error?: string;
  ok?: boolean;
}

/**
 * 执行者提交成果（M5-b）。仿 crm/actions.ts：
 * taskId 走表单隐藏字段；提交人由 createSubmission 内取占位当前用户（不接真登录）。
 * 成功后刷新看板与任务详情；校验失败回中文文案，不抛到 UI。
 */
export async function submitDesignTaskAction(
  _prev: SubmitTaskFormState,
  formData: FormData
): Promise<SubmitTaskFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const taskId = text("taskId");
    if (!taskId) return { error: "缺少任务标识，请刷新页面后重试" };

    const files = formData.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
    await createSubmission(taskId, { note: text("note"), assetRef: text("assetRef"), files });

    revalidatePath("/design");
    revalidatePath("/design/[id]", "page");
    return { ok: true };
  } catch (e) {
    if (e instanceof DesignSubmissionError) return { error: e.message };
    logAppError("[submitDesignTaskAction]", e);
    return { error: "提交失败，请稍后重试" };
  }
}

export interface ReviewFormState {
  error?: string;
  ok?: boolean;
}

/**
 * 审核提交（M5-c）：通过 / 退回（原因必填）。
 * taskId/submissionId 走隐藏字段；approve 由前端模式切换写入 "true"|"false"。
 * 成功后刷新看板与任务详情；DesignReviewError 的中文文案回传 UI。
 */
export async function reviewDesignTaskAction(
  _prev: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const taskId = text("taskId");
    const submissionId = text("submissionId");
    const approve = text("approve") === "true";
    if (!taskId || !submissionId) {
      return { error: "缺少任务或提交标识，请刷新页面后重试" };
    }

    await reviewSubmission(taskId, submissionId, {
      approve,
      rejectReason: text("rejectReason"),
    });

    revalidatePath("/design");
    revalidatePath("/design/[id]", "page");
    return { ok: true };
  } catch (e) {
    if (e instanceof DesignReviewError) return { error: e.message };
    logAppError("[reviewDesignTaskAction]", e);
    return { error: "审核失败，请稍后重试" };
  }
}
