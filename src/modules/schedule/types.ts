/**
 * 排程模块共享类型（M6-a）。纯类型，无 prisma，客户端可安全 import。
 * 状态常量与标签见 status.ts；面积档与排程函数见 plan.ts。
 */

/** 排程任务状态：pending=未开始 / in_progress=进行中 / completed=已完成。 */
export type ScheduleTaskStatus = "pending" | "in_progress" | "completed";

/** 面积档：lt90 / b90_130 / gt130（见 plan.ts 的 areaTier）。 */
export type AreaTier = "lt90" | "b90_130" | "gt130";

/** applyProgressUpdate 输入快照（只取所需字段，便于纯函数测试）。 */
export interface TaskProgressInput {
  progress: number;
  status: ScheduleTaskStatus;
  actualStart: Date | string | null;
  actualEnd: Date | string | null;
}

/** applyProgressUpdate 输出（新快照值，调用方写回 DB；不改原对象）。 */
export interface TaskProgressUpdate {
  progress: number;
  status: ScheduleTaskStatus;
  actualStart: Date | null;
  actualEnd: Date | null;
}

/** buildSchedule 的行输入（来自 ProcessTemplate 的快照字段）。 */
export interface ScheduleRowInput {
  name: string;
  order: number;
  days: number;
}

/** buildSchedule 的行输出（含算好的计划起止日期）。 */
export interface ScheduleRow {
  name: string;
  order: number;
  start: Date;
  end: Date;
}
