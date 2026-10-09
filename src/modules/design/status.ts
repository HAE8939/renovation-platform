/**
 * 设计任务状态纯常量与纯函数（M5-a，仿 crm/stages.ts）。
 * 不依赖 prisma，客户端可安全 import；服务与 UI 共用同一份定义。
 * 状态机转移谓词（canSubmit 已建，M5-b 提交用；canReview 等审核谓词 M5-c 再补）。
 */

/** 设计任务状态有序序列：看板按此排成 5 列。 */
export const DESIGN_TASK_STATUS_ORDER = [
  "pending",
  "assigned",
  "submitted",
  "revisions",
  "approved",
] as const;
export type DesignTaskStatus = (typeof DESIGN_TASK_STATUS_ORDER)[number];

export const DESIGN_TASK_STATUS_LABEL: Record<DesignTaskStatus, string> = {
  pending: "待分配",
  assigned: "进行中",
  submitted: "待审核",
  revisions: "待返修",
  approved: "已通过",
};

/**
 * 是否逾期：deadline 已过且尚未通过（approved 是收尾态，过线不算逾期）。
 * deadline 兼容 Date / ISO 字符串 / null；now 由调用方传入便于测试。
 */
export function isOverdue(
  deadline: Date | string | null,
  status: string,
  now: Date = new Date()
): boolean {
  if (!deadline || status === "approved") return false;
  const d = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

/** Badge 语义色令牌名（非 emoji）：approved=ok、revisions=danger、submitted=warn、其余=neutral。 */
export type StatusBadgeTone = "neutral" | "success" | "warning" | "danger";

export function statusBadgeTone(status: string): StatusBadgeTone {
  switch (status) {
    case "approved":
      return "success";
    case "revisions":
      return "danger";
    case "submitted":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * 可提交谓词（M5-b）：仅 待分配 / 进行中 / 待返修 可提交成果；
 * 待审核（已有 pending 提交）与已通过（收尾态）不可重复提交。
 */
const SUBMITTABLE_STATUSES = new Set<string>(["pending", "assigned", "revisions"]);

export function canSubmit(status: string): boolean {
  return SUBMITTABLE_STATUSES.has(status);
}

/** 单次提交的审核结果标签（版本历史徽章文案）。 */
export const SUBMISSION_RESULT_LABEL: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已退回",
};

/** 提交结果徽章语义色（非 emoji）：approved=success、rejected=danger、pending=neutral。 */
export function submissionResultTone(result: string): StatusBadgeTone {
  switch (result) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}
