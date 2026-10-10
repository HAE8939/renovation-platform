"use server";

import { revalidatePath } from "next/cache";
import {
  generateSchedule,
  clearSchedule,
  ScheduleGenerateError,
} from "./server/generate";
import {
  updateTaskInfo,
  updateTaskProgress,
  shiftTaskDates,
  ScheduleUpdateError,
} from "./server/updates";

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

/** 更新任务基本信息（日期 + 负责人）：taskId + projectId 走表单隐藏字段。 */
export async function updateTaskInfoAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!taskId) return { error: "缺少任务标识，请刷新页面后重试" };
  const startDateIso = String(formData.get("startDateIso") ?? "").trim();
  const endDateIso = String(formData.get("endDateIso") ?? "").trim();
  const ownerIdRaw = String(formData.get("ownerId") ?? "").trim();
  const ownerId = ownerIdRaw === "" ? null : ownerIdRaw;
  try {
    await updateTaskInfo(taskId, {
      startDateIso,
      endDateIso,
      ownerId,
    });
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleUpdateError) return { error: e.message };
    console.error("[updateTaskInfoAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

/** 更新任务进度：taskId + projectId 走表单隐藏字段。 */
export async function updateTaskProgressAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!taskId) return { error: "缺少任务标识，请刷新页面后重试" };
  const progressRaw = String(formData.get("progress") ?? "").trim();
  const progress = Number(progressRaw);
  if (!Number.isFinite(progress)) {
    return { error: "进度须为 0–100 的数字" };
  }
  try {
    await updateTaskProgress(taskId, progress);
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleUpdateError) return { error: e.message };
    console.error("[updateTaskProgressAction]", e);
    return { error: "更新失败，请稍后重试" };
  }
}

/** 拖拽平移调期：taskId + projectId + dayDelta 走表单隐藏字段。 */
export async function shiftTaskDatesAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!taskId) return { error: "缺少任务标识，请刷新页面后重试" };
  const deltaRaw = String(formData.get("dayDelta") ?? "").trim();
  const dayDelta = Number(deltaRaw);
  if (!Number.isInteger(dayDelta)) {
    return { error: "位移天数须为整数" };
  }
  try {
    await shiftTaskDates(taskId, dayDelta);
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleUpdateError) return { error: e.message };
    console.error("[shiftTaskDatesAction]", e);
    return { error: "调期失败，请稍后重试" };
  }
}
