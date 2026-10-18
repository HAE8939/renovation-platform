import prisma from "@/core/db";
import { getPlaceholderUser } from "../currentUser";
import {
  canReview,
  nextStatusAfterReview,
  assertReviewTransition,
  DESIGN_TASK_STATUS_LABEL,
  type DesignTaskStatus,
} from "../status";

/**
 * 设计任务审核服务（M5-c）。
 * 通过 → submission.result=approved + task.status=approved；
 * 退回 → submission.result=rejected（rejectReason 必填）+ task.status=revisions。
 * 审核人用占位当前用户（P4 接登录后只换数据源，不改表）。
 */

/** 审核校验类业务错误：中文文案直达 UI（与 DesignSubmissionError 同思路）。 */
export class DesignReviewError extends Error {}

export interface ReviewInput {
  approve: boolean;
  /** 退回原因：退回时必填，通过时忽略。 */
  rejectReason?: string;
}

/**
 * 审核提交（M5-c）：一个 $transaction 内原子完成 ——
 * ① 取占位当前用户（开事务前只读，无则拒绝并给可读错误）；
 * ② 退回必填原因（空/纯空格 → 抛错，前端拦后再保险）；
 * ③ 事务内取 task 校验 canReview（仅 submitted 可审）；
 * ④ 取 submission 校验归属该 task 且 result==="pending"（只审待审那版，防重复审核）；
 * ⑤ 写 submission.result/reviewedBy/reviewedAt + task.status。
 *
 * 教训（M3-d2）：事务内全程用同一个 tx 客户端，不调用自开事务的其他服务；
 * 占位当前用户是只读查询（无事务），在开事务前先取。
 */
export async function reviewSubmission(
  taskId: string,
  submissionId: string,
  input: ReviewInput
): Promise<void> {
  const me = await getPlaceholderUser();
  if (!me) {
    throw new DesignReviewError(
      "当前无可用审核人（未找到 designer 角色用户），请先运行 seed 初始化用户"
    );
  }

  // 退回原因必填：在开事务前校验，避免无谓的 DB 轮次（与 createSubmission 校验 note 同思路）。
  if (!input.approve) {
    const reason = (input.rejectReason ?? "").trim();
    if (!reason) {
      throw new DesignReviewError("退回必须填写原因");
    }
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.designTask.findUnique({
      where: { id: taskId },
      select: { id: true, status: true },
    });
    if (!task) throw new DesignReviewError("设计任务不存在");

    if (!canReview(task.status)) {
      const label = DESIGN_TASK_STATUS_LABEL[task.status as DesignTaskStatus] ?? task.status;
      throw new DesignReviewError(`当前任务状态为“${label}”，不可审核`);
    }

    const submission = await tx.taskSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, taskId: true, result: true },
    });
    if (!submission) throw new DesignReviewError("提交记录不存在");
    if (submission.taskId !== taskId) {
      throw new DesignReviewError("提交记录不属于该任务");
    }
    if (submission.result !== "pending") {
      throw new DesignReviewError("该版本已审核，不可重复审核");
    }

    const nextStatus = nextStatusAfterReview(input.approve);
    // 防御性：canReview 已保证 from=submitted，这里再兜底转移合法性。
    assertReviewTransition(task.status, nextStatus);

    const now = new Date();
    if (input.approve) {
      await tx.taskSubmission.update({
        where: { id: submissionId },
        data: { result: "approved", reviewedBy: me.id, reviewedAt: now },
      });
    } else {
      const reason = (input.rejectReason ?? "").trim();
      await tx.taskSubmission.update({
        where: { id: submissionId },
        data: {
          result: "rejected",
          rejectReason: reason,
          reviewedBy: me.id,
          reviewedAt: now,
        },
      });
    }

    await tx.designTask.update({
      where: { id: taskId },
      data: { status: nextStatus },
    });
  });
}
