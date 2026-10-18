/**
 * 质量管控状态纯常量与纯函数（M7-a，仿 design/status.ts + schedule/status.ts）。
 * 不依赖 prisma，客户端可安全 import；服务与 UI 共用同一份定义。
 * 状态机转移谓词集中在此（§1-2），页面与服务不得各写一套。
 */

import type {
  IssueProjection,
  IssueSeverity,
  IssueStatus,
  NodeStatus,
} from "./types";

// ── 节点状态 ──────────────────────────────────────────────────

/** 节点状态有序序列：待提交 → 待审核 → 已退回 → 已通过（重提回到待审核）。 */
export const NODE_STATUS_ORDER = [
  "pending",
  "submitted",
  "returned",
  "passed",
] as const;

/** 节点状态中文标签（非 emoji）。 */
export const NODE_STATUS_LABEL: Record<NodeStatus, string> = {
  pending: "待提交",
  submitted: "待审核",
  returned: "已退回",
  passed: "已通过",
};

/**
 * 节点状态徽章语义色 token 名（非 emoji）：
 * pending=neutral / submitted=accent / returned=danger / passed=success。
 * 模块内自定义同名 type，勿 import 其他模块内部（避免穿设计/排程模块边界）。
 */
export type NodeStatusTone = "neutral" | "accent" | "success" | "danger";

export function nodeStatusTone(status: string): NodeStatusTone {
  switch (status) {
    case "submitted":
      return "accent";
    case "passed":
      return "success";
    case "returned":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * 节点显示标签（含派生文案“整改中”/“待重新提交”，§1-2）：
 * - returned + 有 open 问题 → “整改中”（不落库，派生显示）
 * - returned + 无 open 问题 → “待重新提交”
 * - 其余 → 回 NODE_STATUS_LABEL
 * hasOpenIssues 由调用方先算（问题 status!=="closed" 计数 > 0）。
 */
export function nodeDisplayLabel(
  status: string,
  hasOpenIssues: boolean
): string {
  if (status === "returned") {
    return hasOpenIssues ? "整改中" : "待重新提交";
  }
  return NODE_STATUS_LABEL[status as NodeStatus] ?? status;
}

/**
 * 可提交谓词：pending（首次提交）或 returned（整改后重提）可提交；
 * submitted（已提交待审）、passed（已通过收尾态）不可重复提交。
 */
const SUBMITTABLE_NODE_STATUSES = new Set<string>(["pending", "returned"]);

export function canSubmitNode(status: string): boolean {
  return SUBMITTABLE_NODE_STATUSES.has(status);
}

/**
 * 重提门控（§1-2）：returned 重提须关联问题全部非 open（即 rectified 或 closed）。
 * 空数组 = true（无关联问题的退回节点可直接重提，防御性兼容）。
 * 入参取问题状态投影数组（纯函数，不碰整行）。
 */
export function canResubmitAfterReturn(issues: IssueProjection[]): boolean {
  if (issues.length === 0) return true;
  return issues.every((i) => i.status !== "open");
}

/**
 * 审核后下一状态：通过 → passed；退回 → returned。
 * 与 canReview（仅 submitted 可审）配合，故调用方先校验 submitted。
 */
export function nextNodeStatusAfterReview(approve: boolean): NodeStatus {
  return approve ? "passed" : "returned";
}

/**
 * 校验节点状态转移合法性（§1-2，合法 4 条）：
 *  pending → submitted（首次提交）
 *  returned → submitted（重提）
 *  submitted → passed（审核通过）
 *  submitted → returned（审核退回）
 * 其余转移非法并抛错（防御性，供服务层在事务内兜底，避免状态机漂移）。
 */
export function assertNodeTransition(from: string, to: string): void {
  const legal =
    (from === "pending" && to === "submitted") ||
    (from === "returned" && to === "submitted") ||
    (from === "submitted" && to === "passed") ||
    (from === "submitted" && to === "returned");
  if (!legal) {
    throw new Error(`非法节点状态转移：${from} → ${to}`);
  }
}

// ── 问题状态 ──────────────────────────────────────────────────

/** 问题状态有序序列：待整改 → 待复验 → 已关闭（复验退回回待整改）。 */
export const ISSUE_STATUS_ORDER = ["open", "rectified", "closed"] as const;

/** 问题状态中文标签（非 emoji）。 */
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: "待整改",
  rectified: "待复验",
  closed: "已关闭",
};

/** 问题状态徽章语义色（非 emoji）：open=danger / rectified=warning / closed=neutral。 */
export type IssueStatusTone = "neutral" | "warning" | "danger";

export function issueStatusTone(status: string): IssueStatusTone {
  switch (status) {
    case "open":
      return "danger";
    case "rectified":
      return "warning";
    default:
      return "neutral";
  }
}

/** 可整改谓词：仅 open 态可标记整改完成。 */
export function canRectify(status: string): boolean {
  return status === "open";
}

/** 可关闭谓词：仅 rectified 态可复验通过关闭。 */
export function canClose(status: string): boolean {
  return status === "rectified";
}

/** 可复验退回谓词：仅 rectified 态可复验退回（reopen 到 open）。 */
export function canReopen(status: string): boolean {
  return status === "rectified";
}

/**
 * 校验问题状态转移合法性（合法 3 条）：
 *  open → rectified（整改完成）
 *  rectified → closed（复验通过）
 *  rectified → open（复验退回）
 * 其余转移非法并抛错。
 */
export function assertIssueTransition(from: string, to: string): void {
  const legal =
    (from === "open" && to === "rectified") ||
    (from === "rectified" && to === "closed") ||
    (from === "rectified" && to === "open");
  if (!legal) {
    throw new Error(`非法问题状态转移：${from} → ${to}`);
  }
}

// ── 问题严重度 ─────────────────────────────────────────────────

/** 严重度有序序列：轻微 → 一般 → 严重。 */
export const ISSUE_SEVERITY_ORDER = ["minor", "normal", "major"] as const;

/** 严重度中文标签（非 emoji）。 */
export const ISSUE_SEVERITY_LABEL: Record<IssueSeverity, string> = {
  minor: "轻微",
  normal: "一般",
  major: "严重",
};

/**
 * 严重度徽章语义色（非 emoji）：minor=neutral / normal=warning / major=danger。
 * 轻微不用 accent 蓝（守单点 accent 纪律，§1-2 / V0.3 红线）。
 */
export type IssueSeverityTone = "neutral" | "warning" | "danger";

export function issueSeverityTone(severity: string): IssueSeverityTone {
  switch (severity) {
    case "major":
      return "danger";
    case "normal":
      return "warning";
    default:
      return "neutral";
  }
}
