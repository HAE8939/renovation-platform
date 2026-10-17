/**
 * 排程任务状态纯常量与纯函数（M6-a，仿 design/status.ts）。
 * 不依赖 prisma，客户端可安全 import；服务与 UI 共用同一份定义。
 * 进度→状态联动是唯一更新口径（§1-4），页面与服务不得各写一套。
 */

import type {
  ScheduleTaskStatus,
  TaskProgressInput,
  TaskProgressUpdate,
} from "./types";

/** 排程任务状态有序序列：未开始 → 进行中 → 已完成。 */
export const SCHEDULE_TASK_STATUS_ORDER = [
  "pending",
  "in_progress",
  "completed",
] as const;

/** 状态中文标签。 */
export const SCHEDULE_TASK_STATUS_LABEL: Record<ScheduleTaskStatus, string> = {
  pending: "未开始",
  in_progress: "进行中",
  completed: "已完成",
};

/**
 * 状态徽章语义色 token 名（非 emoji）：
 * pending=neutral / in_progress=accent / completed=success。
 * 模块内自定义同名 type，勿 import design 内部（避免穿设计模块边界）。
 */
export type StatusBadgeTone = "neutral" | "accent" | "success";

export function statusBadgeTone(status: string): StatusBadgeTone {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
      return "accent";
    default:
      return "neutral";
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toDate(v: Date | string | null): Date | null {
  if (v === null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 工序是否逾期：progress<100 且 now 落在 endDate 当天之后（now >= endDate+1天）。
 * endDate 含当天施工；次日 0 点起算逾期（仍处完工当天不算超期）。
 * endDate 空 / 非法 → false（不误报）。now 由调用方传入便于测试。
 */
export function isTaskOverdue(
  a: { endDate: Date | string | null; progress: number },
  now: Date = new Date()
): boolean {
  if (a.progress >= 100) return false;
  const end = toDate(a.endDate);
  if (!end) return false;
  const overdueAt = new Date(startOfDay(end).getTime() + MS_PER_DAY);
  return now.getTime() >= overdueAt.getTime();
}

/**
 * 项目完工日语义（M15 · 断点④）已上收 core/domain/health.ts 的 computeProjectActualEnd。
 * 原因：这是跨模块共享派生（health.scheduleLight 与 finance 保修金基准都吃它），
 * core 不得反向依赖单一模块（AGENTS §2 边界纪律），故不放本文件；调用方直接引 core。
 */

/**
 * 进度更新联动（单一真源，§1-4）：
 * - 钳 0–100 取整（非法输入归 0 或 100 端点）
 * - 0 → 重置为 pending（清 actualStart 与 actualEnd，不留"未开始却有开工日"矛盾态）
 * - 1..99 → in_progress + actualStart 首写（不覆盖已有值）
 * - 100 → completed + actualEnd 缺则补写（不覆盖已有完成日）
 * - 从 completed 回落 1..99 → in_progress 且清 actualEnd
 * today 入参便于测试；返回新快照值，不改原对象。
 */
export function applyProgressUpdate(
  task: TaskProgressInput,
  progress: number,
  today: Date = new Date()
): TaskProgressUpdate {
  const p = Math.max(0, Math.min(100, Math.trunc(progress)));
  const prevStart = toDate(task.actualStart);
  const prevEnd = toDate(task.actualEnd);

  let nextStatus: ScheduleTaskStatus;
  let nextStart: Date | null = prevStart;
  let nextEnd: Date | null = prevEnd;

  if (p === 0) {
    nextStatus = "pending";
    nextStart = null;
    nextEnd = null;
  } else if (p >= 100) {
    nextStatus = "completed";
    if (prevEnd === null) nextEnd = today; // 缺则补写，不覆盖已有完成日
  } else {
    nextStatus = "in_progress";
  }

  // 首写 actualStart：进入非 0 进度且此前无 actualStart
  if (p > 0 && prevStart === null) {
    nextStart = today;
  }

  // 从 completed 回落 <100：清 actualEnd
  if (task.status === "completed" && p < 100) {
    nextEnd = null;
  }

  return {
    progress: p,
    status: nextStatus,
    actualStart: nextStart,
    actualEnd: nextEnd,
  };
}
