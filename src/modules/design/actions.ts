"use server";

import { revalidatePath } from "next/cache";
import { createSubmission, DesignSubmissionError } from "./server/submissions";

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
    console.error("[submitDesignTaskAction]", e);
    return { error: "提交失败，请稍后重试" };
  }
}
