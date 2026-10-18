import { Prisma } from "@prisma/client";
import prisma from "@/core/db";
import { computeProjectActualEnd } from "@/core/domain/health";

/**
 * 核心域 · 项目实际完工日集成器（core/domain，M15 断点④）。
 *
 * 一句话：把“所有工序都 completed”这一事实回写成 `Project.actualEndDate`，
 * 让工期红灯（core/domain/health.scheduleLight 读 actualEndDate）与保修金基准
 * （modules/finance/server/payments.buildProjectPaymentPlan 的 warrantyBase）不再
 * 静默回落到“计划完工日 endDate”——那正是 §8.2 点名的断点。
 *
 * 与 acceptance.ts 同一套纪律：
 *  - 传入 externalTx 复用其事务（进度联动的 updateTaskProgress 场景，工序与完工日同事务）；
 *  - 否则自开一个 $transaction（读取入口的幂等兜底自愈场景）；
 *  - **只在值真正变化时写**（幂等：null→null、同日期→no-op），不在事务里多写别表（§4.4）。
 *
 * 跨模块纪律：本文件不 import schedule 模块 server 内部，只用纯算式
 * computeProjectActualEnd（schedule/status.ts，客户端安全、无 prisma）+ core/db prisma 直读。
 */
export async function syncProjectActualEnd(
  projectId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const run = async (t: Prisma.TransactionClient): Promise<void> => {
    const tasks = await t.scheduleTask.findMany({
      where: { projectId },
      select: { status: true, actualEnd: true },
    });
    const next = computeProjectActualEnd(tasks);

    const project = await t.project.findUnique({
      where: { id: projectId },
      select: { actualEndDate: true },
    });
    if (!project) return; // 项目已不存在：不动

    const cur = project.actualEndDate ?? null;
    const same =
      (cur === null && next === null) ||
      (cur !== null && next !== null && cur.getTime() === next.getTime());
    if (same) return; // 幂等：值没变不写（避免无谓 updatedAt 抖动）

    await t.project.update({
      where: { id: projectId },
      data: { actualEndDate: next },
    });
  };

  return tx ? run(tx) : prisma.$transaction(run);
}
