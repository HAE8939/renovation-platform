"use server";

import { revalidatePath } from "next/cache";
import {
  generateSchedule,
  clearSchedule,
  ScheduleGenerateError,
} from "./server/generate";

/**
 * 排程 Server Actions（M6-b）。
 * 仿 design/actions.ts：调 server 层；成功 revalidatePath 两条（甘特页 + 看板）；
 * 失败把错误信息返回给表单展示，不抛给用户白屏。
 */

export interface ScheduleActionState {
  error?: string;
  ok?: boolean;
}

/** 一键生成排程：projectId 走表单隐藏字段。 */
export async function generateScheduleAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };
  try {
    await generateSchedule(projectId);
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleGenerateError) return { error: e.message };
    console.error("[generateScheduleAction]", e);
    return { error: "生成失败，请稍后重试" };
  }
}

/** 清空排程：projectId 走表单隐藏字段。 */
export async function clearScheduleAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };
  try {
    await clearSchedule(projectId);
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleGenerateError) return { error: e.message };
    console.error("[clearScheduleAction]", e);
    return { error: "清空失败，请稍后重试" };
  }
}
