import prisma from "@/core/db";
import type { ScheduleTaskStatus } from "../types";
import { applyProgressUpdate } from "../status";
import { shiftDates } from "../plan";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import { syncProjectActualEnd } from "@/core/domain/projectCompletion";

/**
 * 排程任务更新服务（M6-c）。
 * 三个服务全部单事务；中文错误类 ScheduleUpdateError（仿 ScheduleGenerateError）。
 * 跨模块读走 core/db 的 prisma 直读；进度联动唯一口径 = applyProgressUpdate
 * （§1-4），本服务不重写规则，只调用纯函数并把返回值写回。
 */

/** 更新类业务错误：中文文案直达 UI（不 silent fail）。 */
export class ScheduleUpdateError extends Error {}

/** UTC 0 点归一（取 UTC 年月日重组），与 generate / tasks 同口径。 */
function toUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** 解析 ISO 字符串为 Date；非法返回 null。 */
function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 更新任务基本信息：计划起止日期 + 负责人（M6-c）。
 * 守卫：
 *  - 任务须存在；
 *  - 日期可解析（非空、合法 ISO）；
 *  - end ≥ start（同日合法，当天起止）；
 *  - ownerId 为 null（未指派）或库中真实 userId；
 * 两日期归一到 UTC 0 点写回。
 */
export async function updateTaskInfo(
  taskId: string,
  input: {
    startDateIso: string | null;
    endDateIso: string | null;
    ownerId: string | null;
  }
): Promise<void> {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true },
  });
  if (!task) throw new ScheduleUpdateError("任务不存在");

  const start = parseIso(input.startDateIso);
  const end = parseIso(input.endDateIso);
  if (!start) throw new ScheduleUpdateError("计划开始日期不能为空");
  if (!end) throw new ScheduleUpdateError("计划结束日期不能为空");
  if (end.getTime() < start.getTime()) {
    throw new ScheduleUpdateError("计划结束日期不能早于开始日期");
  }

  // ownerId：null 或库中真实 userId
  let nextOwnerId: string | null = null;
  if (input.ownerId !== null && input.ownerId !== "") {
    const owner = await prisma.user.findUnique({
      where: { id: input.ownerId },
      select: { id: true },
    });
    if (!owner) throw new ScheduleUpdateError("负责人不存在");
    nextOwnerId = input.ownerId;
  }

  const startNorm = toUtcDay(start);
  const endNorm = toUtcDay(end);

  return prisma.$transaction(async (tx) => {
    await tx.scheduleTask.update({
      where: { id: taskId },
      data: { startDate: startNorm, endDate: endNorm, ownerId: nextOwnerId },
    });
  });
}

/**
 * 更新任务进度（M6-c）：读当前行 → 调 applyProgressUpdate → 写回四字段。
 * progress 取整钳 0–100（applyProgressUpdate 内部已钳，此处再钳一次防越界）。
 * today 为入参便于测试，默认当前时刻。
 */
export async function updateTaskProgress(
  taskId: string,
  progress: number,
  today: Date = new Date()
): Promise<void> {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true, // M7-a：进度联动同事务建/删验收节点需读 projectId
      progress: true,
      status: true,
      actualStart: true,
      actualEnd: true,
    },
  });
  if (!task) throw new ScheduleUpdateError("任务不存在");

  const next = applyProgressUpdate(
    {
      progress: task.progress,
      status: task.status as ScheduleTaskStatus,
      actualStart: task.actualStart,
      actualEnd: task.actualEnd,
    },
    progress,
    today
  );

  return prisma.$transaction(async (tx) => {
    await tx.scheduleTask.update({
      where: { id: taskId },
      data: {
        progress: next.progress,
        status: next.status,
        actualStart: next.actualStart,
        actualEnd: next.actualEnd,
      },
    });
    // M7-a 调用点①：进度→100 即生验收节点 / 回落清 pending 节点（同事务，幂等）。
    // syncAcceptanceNodes 是 quality 私有表唯一跨模块写入点（见 core/domain/acceptance.ts）。
    await syncAcceptanceNodes(task.projectId, tx);
    // M15 断点④：同一进度联动里回写项目实际完工日（全工序 completed → 各 actualEnd 最大值；
    // 未完工 → null）。放同一事务，让「工序完工」与「项目实际完工日」原子一致，工期红灯与
    // 保修金基准据此读到真值、不再回落计划日。syncProjectActualEnd 幂等（见 core/domain/projectCompletion.ts）。
    await syncProjectActualEnd(task.projectId, tx);
  });
}

/**
 * 拖拽平移调期（M6-c）：把任务计划起止整体平移 dayDelta 天。
 * 守卫：
 *  - 任务须存在；
 *  - dayDelta 须为整数；|delta|=0 不写（恒等，节省一次写）；
 *  - |delta|>365 报错（防误操作出合理范围）。
 * 读当前行 → shiftDates → 写回 start/end。不级联后续工序。
 */
export async function shiftTaskDates(
  taskId: string,
  dayDelta: number
): Promise<void> {
  if (!Number.isInteger(dayDelta)) {
    throw new ScheduleUpdateError("位移天数须为整数");
  }
  if (Math.abs(dayDelta) > 365) {
    throw new ScheduleUpdateError("位移天数超出合理范围（±365 天）");
  }
  if (dayDelta === 0) return; // 恒等不写

  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!task) throw new ScheduleUpdateError("任务不存在");

  const shifted = shiftDates(task.startDate, task.endDate, dayDelta);
  const startNorm = toUtcDay(shifted.start);
  const endNorm = toUtcDay(shifted.end);

  return prisma.$transaction(async (tx) => {
    await tx.scheduleTask.update({
      where: { id: taskId },
      data: { startDate: startNorm, endDate: endNorm },
    });
  });
}
