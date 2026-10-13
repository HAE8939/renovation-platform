"use server";

import { revalidatePath } from "next/cache";
import { createSubmission, DesignSubmissionError } from "./server/submissions";
import { reviewSubmission, DesignReviewError } from "./server/review";
import { logAppError } from "@/core/domain/telemetry";

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

    await createSubmission(taskId, { note: text("note"), assetRef: text("assetRef") });

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
