import prisma from "@/core/db";
import { AREA_TIER_LABEL, areaTier, buildSchedule } from "../plan";
import type { AreaTier } from "../types";

/**
 * 排程甘特取数服务（M6-b，只读）。
 * 跨模块读一律经 core/db 的 prisma 直读，不 import 其他模块 server 内部。
 * 日期一律转 ISO 字符串返回（可序列化，勿把 Date 传给客户端组件）。
 * 项目不存在 → 返回 null（页面 notFound()）。
 *
 * 空态所需数据（面积档 areaTier 结果、可否生成与原因、生成预览行）也在此函数
 * 一并组装返回：用 buildSchedule 干跑生成预览；模板行读该档 processTemplate。
 */

/** 模板标准行数（11 工序 × 3 档，照抄 v5.1 §6.5.2）。 */
const EXPECTED_TEMPLATE_ROWS = 11;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** UTC 0 点归一（取 UTC 年月日重组），与 generate 保持同一口径。 */
function toUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** 甘特行视图模型（日期均为 ISO 字符串）。 */
export interface ScheduleTaskRow {
  id: string;
  name: string;
  order: number;
  startDate: string;
  endDate: string;
  actualStart: string | null;
  actualEnd: string | null;
  progress: number;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  /** 前置任务名（供悬停浮层展示）。 */
  dependsOnTaskNames: string[];
}

/** 依赖边视图模型（taskId 依赖 dependsOnId）。 */
export interface ScheduleDependencyEdge {
  taskId: string;
  dependsOnId: string;
}

/** 空态预览行（11 工序 × 天数 + 计划起止）。 */
export interface SchedulePreviewRow {
  name: string;
  order: number;
  days: number;
  startDate: string;
  endDate: string;
}

export interface ProjectScheduleData {
  project: {
    id: string;
    name: string;
    code: string;
    area: number;
    startDate: string | null;
    endDate: string | null;
  };
  tasks: ScheduleTaskRow[];
  dependencies: ScheduleDependencyEdge[];
  /** 面积档（area>0 时非空）。 */
  tier: AreaTier | null;
  tierLabel: string;
  /** 空态：可否一键生成。 */
  canGenerate: boolean;
  cannotGenerateReason: string | null;
  previewRows: SchedulePreviewRow[];
  previewTotalDays: number;
  previewPlannedStart: string | null;
  previewPlannedEnd: string | null;
  /** 今日 UTC 0 点，供客户端今日线定位。 */
  todayIso: string;
}

/**
 * 取项目排程视图数据：project（name/code/area/startDate/endDate）+ 本项目 tasks
 * （order 升序）+ 依赖边 + ownerId→用户名映射（user.findMany 按 ownerId 集合）。
 * 空态所需数据（面积档 / 可否生成与原因 / 生成预览行）一并组装返回。
 */
export async function getProjectSchedule(
  projectId: string
): Promise<ProjectScheduleData | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      code: true,
      area: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!project) return null;

  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: {
      deps: { select: { id: true, taskId: true, dependsOnId: true } },
    },
  });

  // ownerId → 用户名映射（与 design/server/submissions.ts 同做法：批量 findMany）。
  const ownerIds = [
    ...new Set(
      tasks.map((t) => t.ownerId).filter((v): v is string => v !== null)
    ),
  ];
  const users = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const taskNameById = new Map(tasks.map((t) => [t.id, t.name]));

  const dependencies: ScheduleDependencyEdge[] = tasks.flatMap((t) =>
    t.deps.map((d) => ({ taskId: d.taskId, dependsOnId: d.dependsOnId }))
  );

  const taskRows: ScheduleTaskRow[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    order: t.order,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate.toISOString(),
    actualStart: iso(t.actualStart),
    actualEnd: iso(t.actualEnd),
    progress: t.progress,
    status: t.status,
    ownerId: t.ownerId,
    ownerName: t.ownerId ? (nameById.get(t.ownerId) ?? null) : null,
    dependsOnTaskNames: t.deps.map(
      (d) => taskNameById.get(d.dependsOnId) ?? "—"
    ),
  }));

  // ── 空态预览（仅当无任务时计算；有任务不预览，图体展示）──────────
  const tier = project.area > 0 ? areaTier(project.area) : null;
  const tierLabel = tier ? AREA_TIER_LABEL[tier] : "—";
  const todayIso = toUtcDay(new Date()).toISOString();

  let canGenerate = false;
  let cannotGenerateReason: string | null = null;
  let previewRows: SchedulePreviewRow[] = [];
  let previewTotalDays = 0;
  let previewPlannedStart: string | null = null;
  let previewPlannedEnd: string | null = null;

  if (tasks.length === 0) {
    if (!(project.area > 0)) {
      cannotGenerateReason = "未录入建筑面积";
    } else if (!tier) {
      cannotGenerateReason = "建筑面积无法判定档位";
    } else if (!project.startDate) {
      cannotGenerateReason = "未设置计划开工日期";
    } else {
      const templates = await prisma.processTemplate.findMany({
        where: { tier },
        orderBy: { order: "asc" },
        select: { name: true, order: true, days: true },
      });
      if (templates.length !== EXPECTED_TEMPLATE_ROWS) {
        cannotGenerateReason = `该面积档模板不齐全（需 ${EXPECTED_TEMPLATE_ROWS} 行，当前 ${templates.length} 行）`;
      } else {
        try {
          const startNorm = toUtcDay(project.startDate);
          const chain = buildSchedule(
            templates.map((t) => ({
              name: t.name,
              order: t.order,
              days: t.days,
            })),
            startNorm
          );
          previewRows = chain.map((r) => ({
            name: r.name,
            order: r.order,
            days: Math.round((r.end.getTime() - r.start.getTime()) / MS_PER_DAY) + 1,
            startDate: r.start.toISOString(),
            endDate: r.end.toISOString(),
          }));
          previewTotalDays = previewRows.reduce((s, r) => s + r.days, 0);
          previewPlannedStart = chain[0]?.start.toISOString() ?? null;
          previewPlannedEnd = chain[chain.length - 1]?.end.toISOString() ?? null;
          canGenerate = true;
        } catch {
          cannotGenerateReason = "模板数据异常，请联系管理员";
        }
      }
    }
  } else {
    cannotGenerateReason = "已有排程";
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      code: project.code,
      area: project.area,
      startDate: iso(project.startDate),
      endDate: iso(project.endDate),
    },
    tasks: taskRows,
    dependencies,
    tier,
    tierLabel,
    canGenerate,
    cannotGenerateReason,
    previewRows,
    previewTotalDays,
    previewPlannedStart,
    previewPlannedEnd,
    todayIso,
  };
}
