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
import {
  updateTemplateDays,
  ScheduleTemplateError,
} from "./server/templates";
import { AREA_TIERS, AREA_TIER_LABEL } from "./plan";
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation } from "@/core/domain/operationLog";
import prisma from "@/core/db";

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
    const gen = await generateSchedule(projectId);
    await recordOperation({
      action: "schedule.generate",
      entity: "schedule",
      projectId,
      summary: `一键生成排程 ${Array.isArray(gen) ? gen.length : ""} 道工序`,
      after: Array.isArray(gen) ? gen.map((t) => t.name).join("→").slice(0, 480) : null,
    });
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleGenerateError) return { error: e.message };
    logAppError("[generateScheduleAction]", e);
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
    const oldTasks = await prisma.scheduleTask.findMany({ where: { projectId }, select: { name: true, progress: true } });
    await clearSchedule(projectId);
    await recordOperation({
      action: "schedule.clear",
      entity: "schedule",
      projectId,
      summary: `清空排程（原 ${oldTasks.length} 道工序）`,
      before: oldTasks.map((t) => `${t.name} ${t.progress}%`).join("；").slice(0, 480),
    });
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleGenerateError) return { error: e.message };
    logAppError("[clearScheduleAction]", e);
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
    logAppError("[updateTaskInfoAction]", e);
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
    const taskOld = await prisma.scheduleTask.findUnique({ where: { id: taskId }, select: { name: true, progress: true, projectId: true } });
    await updateTaskProgress(taskId, progress);
    const nodeNow = await prisma.acceptanceNode.findFirst({ where: { taskId }, select: { id: true, status: true } });
    await recordOperation({
      action: "schedule.progress",
      entity: "scheduleTask",
      entityId: taskId,
      projectId: taskOld?.projectId ?? null,
      summary: `工序“${taskOld?.name ?? taskId}”进度 ${taskOld?.progress ?? 0}% → ${progress}%${nodeNow ? `（验收节点 ${nodeNow.status}）` : ""}`,
      before: `${taskOld?.progress ?? 0}%`,
      after: `${progress}%`,
    });
    revalidatePath(`/schedule/${projectId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleUpdateError) return { error: e.message };
    logAppError("[updateTaskProgressAction]", e);
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
    logAppError("[shiftTaskDatesAction]", e);
    return { error: "调期失败，请稍后重试" };
  }
}

/**
 * 更新工序模板天数（M6-d）：三档 id + 三档 days 走 FormData。
 * 先逐档预校验（缺档跳过、天数须 1–999 整数），全过再逐条 updateTemplateDays，
 * 防止前几档已写库、后一档校验失败导致部分更新。成功 revalidate 模板库页。
 */
export async function updateTemplateDaysAction(
  _prev: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const entries: { id: string; days: number }[] = [];
  for (const tier of AREA_TIERS) {
    const id = String(formData.get(`id_${tier}`) ?? "").trim();
    const daysRaw = String(formData.get(`days_${tier}`) ?? "").trim();
    if (!id) continue; // 该档模板行缺失，跳过不写
    const days = Number(daysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 999) {
      return { error: `${AREA_TIER_LABEL[tier]}：天数须为 1–999 的整数` };
    }
    entries.push({ id, days });
  }
  try {
    for (const e of entries) {
      await updateTemplateDays(e.id, e.days);
    }
    revalidatePath("/schedule/templates");
    return { ok: true };
  } catch (e) {
    if (e instanceof ScheduleTemplateError) return { error: e.message };
    logAppError("[updateTemplateDaysAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}
