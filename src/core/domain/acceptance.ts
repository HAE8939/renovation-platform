import { Prisma } from "@prisma/client";
import prisma from "@/core/db";

/**
 * 核心域 · 验收节点整合器（core/domain，M7-a）。
 *
 * 这是 quality 私有表（AcceptanceNode / NodeCheck / Issue）的【唯一跨模块非 quality 写入点】。
 * 调用点（TASK_M7 §1-1）：
 *  ① schedule/server/updates.ts 的 updateTaskProgress —— 同一事务内调用（进度→100 即生节点）；
 *  ② quality 各读取入口（/quality 列表、节点详情、档案页）读前调用兜底；
 *  ③ projects/server/projectDetail.ts 质量聚合前调用（M7-e）；
 *  ④ seed 在演示数据灌完后调用物化演示节点。
 *
 * 规则（TASK_M7 §1-1）：
 *  - 建：ScheduleTask.status=="completed" 且无节点 → 建节点（name/order 快照自任务；
 *    同时按 CheckItem.stage==task.name 快照检查项为 NodeCheck 行，result=null，
 *    order 取检查项 order）。无检查项的工序照建节点（空清单要能提交，诚实显示）。
 *  - 删：status=="pending" 且其任务不存在或未完工的节点 → 删（deleteMany 即可，
 *    NodeCheck 由 Cascade 清理）。**非 pending 节点永不自动删**（保留历史）。
 *  - 全程幂等。
 *
 * tx 传播写法照 src/core/domain/projects.ts 的 createProject(input, tx?) 范式
 * （M3-d2 教训：跨函数复用事务必须显式传 tx）。
 *
 * 跨模块纪律：本文件不 import quality 模块内部（只 @/core/db + @prisma/client 类型），
 * 避免核心域反向依赖业务模块。
 */

/**
 * 同步项目的验收节点（幂等）。
 * - 传入 externalTx 时复用其事务（调用点①的进度联动场景，节点与进度同事务落库）；
 * - 否则自开一个 $transaction（调用点②/③/④的读取兜底与 seed 场景）。
 */
export async function syncAcceptanceNodes(
  projectId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const run = async (tx: Prisma.TransactionClient): Promise<void> => {
    // 1. 该项目所有 completed 工序（节点生成的真源）
    const completedTasks = await tx.scheduleTask.findMany({
      where: { projectId, status: "completed" },
      select: { id: true, name: true, order: true },
    });
    const completedTaskIds = new Set(completedTasks.map((t) => t.id));

    // 2. 该项目现有节点（taskId + status，用于建/删判定）
    const existingNodes = await tx.acceptanceNode.findMany({
      where: { projectId },
      select: { id: true, taskId: true, status: true },
    });

    // 3. 删：pending 节点其任务不存在或未完工 → 删（自愈误标 100% 场景）。
    //    非 pending 节点永不自动删（保留历史）；pending 节点必无问题关联，删安全。
    const toDelete = existingNodes.filter(
      (n) =>
        n.status === "pending" &&
        (!n.taskId || !completedTaskIds.has(n.taskId))
    );
    if (toDelete.length > 0) {
      await tx.acceptanceNode.deleteMany({
        where: { id: { in: toDelete.map((n) => n.id) } },
      });
      // NodeCheck 由 schema 的 onDelete: Cascade 自动清理
    }

    // 4. 建：completed 任务无节点 → 建（name/order 快照 + 按 stage 快照检查项）。
    //    匹配键 = taskId（@unique）；已存在节点（含 pending/非 pending）的任务跳过。
    const existingTaskIds = new Set(
      existingNodes.map((n) => n.taskId).filter((v): v is string => v !== null)
    );
    const toCreate = completedTasks.filter((t) => !existingTaskIds.has(t.id));

    for (const task of toCreate) {
      // 按 stage==task.name 快照检查项（无检查项的工序照建节点，空清单可提交）
      const items = await tx.checkItem.findMany({
        where: { stage: task.name },
        select: { name: true, standard: true, order: true },
        orderBy: { order: "asc" },
      });

      await tx.acceptanceNode.create({
        data: {
          projectId,
          taskId: task.id,
          name: task.name,
          order: task.order,
          status: "pending",
          // submitNote 默认 ""、submittedBy/At/reviewedBy/At/returnReason 默认空
          checks: {
            create: items.map((it) => ({
              name: it.name,
              standard: it.standard,
              order: it.order,
              // result 默认 null（未检）、note 默认 ""
            })),
          },
        },
      });
    }
  };

  return tx ? run(tx) : prisma.$transaction(run);
}
