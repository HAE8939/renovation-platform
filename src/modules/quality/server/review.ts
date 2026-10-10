import prisma from "@/core/db";
import { getPlaceholderUser } from "../currentUser";
import { assertNodeTransition } from "../status";
import type { IssueSeverity } from "../types";

/**
 * 质量管控 · 节点审核服务（M7-b）。
 *
 * 通过 → 节点 status=passed、reviewedBy/reviewedAt 落库（不动 returnReason，
 * 保留历史，通过态详情页不展示即可）；
 * 退回 → 节点 status=returned、returnReason=reason、reviewedBy/At 同上，
 * 且同一事务内建 Issue（§1-4：title=`${node.name}验收退回`、desc=reason、
 * severity、status=open、reportedBy=审核人、nodeId、projectId）。
 *
 * 审核人用占位当前用户 kind="review"（PM，缺则 inspector）。
 * 跨模块读走 core/db prisma 直读，不 import 其他模块内部。
 */

/** 审核校验类业务错误：中文文案直达 UI（仿 QualityNodeError / DesignReviewError）。 */
export class QualityReviewError extends Error {}

/** 合法严重度集合（枚举校验用）。 */
const VALID_SEVERITIES: ReadonlySet<string> = new Set(["minor", "normal", "major"]);

/** 通过入参。 */
export interface ReviewApproveInput {
  approve: true;
}

/** 退回入参：原因必填 + 严重度枚举校验。 */
export interface ReviewRejectInput {
  approve: false;
  reason: string;
  severity: IssueSeverity;
}

export type ReviewInput = ReviewApproveInput | ReviewRejectInput;

/**
 * 审核节点（M7-b）：一个 $transaction 内原子完成 ——
 * ① 取占位审核人（开事务前只读，无则拒绝「未找到演示用户」）；
 * ② 退回时 reason 去空白非空（「退回原因不能为空」）、severity 枚举校验；
 * ③ 事务内取节点校验存在 + status==="submitted"（「仅待审核节点可审核」）；
 * ④ assertNodeTransition(submitted, passed|returned) 兜底；
 * ⑤ approve=true → status=passed、reviewedBy/At（不动 returnReason）；
 *    approve=false → status=returned、returnReason、reviewedBy/At + 同事务建 Issue。
 *
 * 教训（M3-d2）：事务内全程用同一个 tx 客户端，不调用自开事务的其他服务；
 * 占位当前用户是只读查询（无事务），在开事务前先取。
 */
export async function reviewNode(id: string, input: ReviewInput): Promise<void> {
  const me = await getPlaceholderUser("review");
  if (!me) {
    throw new QualityReviewError(
      "未找到演示审核人（pm/inspector 角色均缺失），请先运行 seed 初始化用户"
    );
  }

  // 退回原因必填 + 严重度枚举校验：在开事务前校验，避免无谓的 DB 轮次。
  if (!input.approve) {
    const reason = (input.reason ?? "").trim();
    if (!reason) {
      throw new QualityReviewError("退回原因不能为空");
    }
    if (!VALID_SEVERITIES.has(input.severity)) {
      throw new QualityReviewError("严重度取值非法");
    }
  }

  return prisma.$transaction(async (tx) => {
    const node = await tx.acceptanceNode.findUnique({
      where: { id },
      select: { id: true, name: true, projectId: true, status: true },
    });
    if (!node) throw new QualityReviewError("验收节点不存在");

    if (node.status !== "submitted") {
      throw new QualityReviewError("仅待审核节点可审核");
    }

    const nextStatus = input.approve ? "passed" : "returned";
    // 防御性：status==="submitted" 已保证 from，这里再兜底转移合法性。
    assertNodeTransition(node.status, nextStatus);

    const now = new Date();
    if (input.approve) {
      // 通过：不动 returnReason（保留历史，通过态详情页不展示）
      await tx.acceptanceNode.update({
        where: { id },
        data: {
          status: "passed",
          reviewedBy: me.id,
          reviewedAt: now,
        },
      });
    } else {
      const reason = (input.reason ?? "").trim();
      await tx.acceptanceNode.update({
        where: { id },
        data: {
          status: "returned",
          returnReason: reason,
          reviewedBy: me.id,
          reviewedAt: now,
        },
      });
      // 同事务内建 Issue（§1-4：退回必建，title/字面、desc=原因、severity、open）
      await tx.issue.create({
        data: {
          projectId: node.projectId,
          nodeId: id,
          title: `${node.name}验收退回`,
          desc: reason,
          severity: input.severity,
          status: "open",
          reportedBy: me.id,
        },
      });
    }
  });
}
