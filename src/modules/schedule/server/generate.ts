import prisma from "@/core/db";
import { areaTier, buildSchedule, chainEdges } from "../plan";
import { syncProjectActualEnd } from "@/core/domain/projectCompletion";

/**
 * 排程生成 / 清空服务（M6-b）。
 * 跨模块读走 core/db 的 prisma 直读。生成＝线性链（§1-3）：
 * 面积定档 → 该档模板按 order 排序 → 日期从 startDate 起链 → 相邻落依赖边。
 *
 * 教训（M3-d2）：事务内全程用同一个 tx 客户端，不调用自开事务的其他服务；
 * 依赖边写入复用同一 $transaction（勿嵌套独立事务）。
 */

/** 生成/清空校验类业务错误：中文文案直达 UI（与 DesignSubmissionError 同思路）。 */
export class ScheduleGenerateError extends Error {}

/** 模板标准行数（11 工序 × 3 档）。 */
const EXPECTED_TEMPLATE_ROWS = 11;

/** UTC 0 点归一（取 UTC 年月日重组）：startDate 先归一再传入 buildSchedule。 */
function toUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

/**
 * 一键生成排程（M6-b）。
 * 守卫（任一不满足即失败返回错误串，不写库）：
 *  项目存在；无既有任务（防重复生成）；area>0 且 tier 非空；startDate 非空；
 *  该档模板行齐全（11 行）。startDate 先归一到 UTC 0 点。
 * 生成：buildSchedule(rows, start) + chainEdges → 单事务内逐条 create 收集 id，
 *  再 createMany 依赖边（taskId=后序, dependsOnId=前序）。
 */
export async function generateSchedule(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, area: true, startDate: true },
  });
  if (!project) throw new ScheduleGenerateError("项目不存在");

  const existing = await prisma.scheduleTask.count({ where: { projectId } });
  if (existing > 0)
    throw new ScheduleGenerateError("已存在排程，请先清空再生成");

  if (!(project.area > 0))
    throw new ScheduleGenerateError("未录入建筑面积");
  const tier = areaTier(project.area);
  if (!tier) throw new ScheduleGenerateError("建筑面积无法判定档位");
  if (!project.startDate)
    throw new ScheduleGenerateError("未设置计划开工日期");

  const templates = await prisma.processTemplate.findMany({
    where: { tier },
    orderBy: { order: "asc" },
    select: { name: true, order: true, days: true },
  });
  if (templates.length !== EXPECTED_TEMPLATE_ROWS) {
    throw new ScheduleGenerateError(
      `该面积档模板不齐全（需 ${EXPECTED_TEMPLATE_ROWS} 行，当前 ${templates.length} 行）`
    );
  }

  const startNorm = toUtcDay(project.startDate);
  const chain = buildSchedule(
    templates.map((t) => ({ name: t.name, order: t.order, days: t.days })),
    startNorm
  );
  // 相邻依赖边（i 依赖 i-1，共 n-1 条）。edges 为 [i, i-1] 索引对，与 chain 同序。
  const edges = chainEdges(chain.length);

  return prisma.$transaction(async (tx) => {
    // 逐条 create 收集 id（createMany 不返回 id，依赖边需要 id 才能落）。
    const createdIds: string[] = [];
    for (const row of chain) {
      const created = await tx.scheduleTask.create({
        data: {
          projectId,
          name: row.name,
          order: row.order,
          startDate: row.start,
          endDate: row.end,
          progress: 0,
          status: "pending",
        },
        select: { id: true },
      });
      createdIds.push(created.id);
    }

    // 依赖边：相邻工序（后序 taskId 依赖前序 dependsOnId）。
    const depRows = edges.map(([i, iMinus1]) => ({
      taskId: createdIds[i],
      dependsOnId: createdIds[iMinus1],
    }));
    if (depRows.length > 0) {
      await tx.scheduleTaskDependency.createMany({ data: depRows });
    }
    // 新生成全是 pending → 项目未完工，actualEndDate 归 null（幂等，见 projectCompletion）。
    await syncProjectActualEnd(projectId, tx);
  });
}

/**
 * 清空排程（M6-b）：单事务删除该项目全部 ScheduleTask。
 * 依赖随 Cascade（ScheduleTaskDependency.task/dependsOn onDelete: Cascade）。
 */
export async function clearSchedule(projectId: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    await tx.scheduleTask.deleteMany({ where: { projectId } });
    // 清空后无工序 = 项目未完工：实际完工日复位 null（否则工期红灯/保修金会吃一个已失效的旧完工日）。
    await syncProjectActualEnd(projectId, tx);
  });
}
