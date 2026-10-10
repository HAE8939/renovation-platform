import prisma from "@/core/db";
import {
  overallProgress,
  scheduleLight,
  type Light,
} from "@/core/domain/health";

/**
 * 排程预警看板服务（M6-a，只读）。
 * 跨模块数据一律走 core/db 的 prisma 直读，不 import 其他模块 server 内部。
 * 分区口径＝health.scheduleLight（M2-A 已定并门禁，勿另写阈值）；
 * 项目进度＝health.overallProgress(工序进度)。看板范围＝全部非 archived 项目。
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface ScheduleOverviewRow {
  id: string;
  name: string;
  code: string;
  clientName: string | null;
  area: number;
  startDate: Date | null;
  endDate: Date | null;
  actualEndDate: Date | null;
  progress: number;
  light: Light;
  /** 超期天数（actualEndDate > endDate 时取日差；否则 null） */
  overdueDays: number | null;
  /** 剩余天数（light=yellow → endDate - today；否则 null） */
  daysLeft: number | null;
  taskCount: number;
}

export interface ScheduleOverview {
  /** 已逾期（actualEndDate > endDate） */
  red: ScheduleOverviewRow[];
  /** 预警（距计划完工 ≤7 天且进度 <80） */
  yellow: ScheduleOverviewRow[];
  /** 正常 */
  green: ScheduleOverviewRow[];
  /** 未排程（无 ScheduleTask）—— 灰区，不造假灯 */
  unscheduled: ScheduleOverviewRow[];
}

/**
 * 拉全部非 archived 项目，include 排程工序（只取 progress/dates），
 * 复用 overallProgress + scheduleLight 分四区。区内按紧迫度排序。
 */
export async function getScheduleOverview(
  now: Date = new Date()
): Promise<ScheduleOverview> {
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" } },
    include: {
      client: { select: { name: true } },
      scheduleTasks: { select: { progress: true } },
    },
    orderBy: { code: "asc" },
  });

  const rows: ScheduleOverviewRow[] = projects.map((p) => {
    const tasks = p.scheduleTasks;
    const progress = overallProgress(
      tasks.map((t) => ({ progress: t.progress }))
    );
    const light = scheduleLight(
      { endDate: p.endDate, actualEndDate: p.actualEndDate, progress },
      now
    );

    let overdueDays: number | null = null;
    let daysLeft: number | null = null;
    if (light === "red" && p.actualEndDate && p.endDate) {
      overdueDays = Math.round(
        (startOfDay(p.actualEndDate).getTime() -
          startOfDay(p.endDate).getTime()) /
          MS_PER_DAY
      );
    } else if (light === "yellow" && p.endDate) {
      daysLeft = Math.round(
        (startOfDay(p.endDate).getTime() - startOfDay(now).getTime()) /
          MS_PER_DAY
      );
    }

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      clientName: p.client?.name ?? null,
      area: p.area,
      startDate: p.startDate,
      endDate: p.endDate,
      actualEndDate: p.actualEndDate,
      progress,
      light,
      overdueDays,
      daysLeft,
      taskCount: tasks.length,
    };
  });

  const scheduled = rows.filter((r) => r.taskCount > 0);
  const unscheduled = rows.filter((r) => r.taskCount === 0);

  return {
    // 超期降序（超得越久越靠前）
    red: scheduled
      .filter((r) => r.light === "red")
      .sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0)),
    // 剩余升序（越紧越靠前）
    yellow: scheduled
      .filter((r) => r.light === "yellow")
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    green: scheduled.filter((r) => r.light === "green"),
    unscheduled,
  };
}
