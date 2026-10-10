/**
 * 质量管控模块共享类型（M7-a）。纯类型，无 prisma，客户端可安全 import。
 * 状态常量与标签见 status.ts。
 */

/** 验收节点状态：pending=待提交 / submitted=待审核 / returned=已退回 / passed=已通过。 */
export type NodeStatus = "pending" | "submitted" | "returned" | "passed";

/** 问题状态：open=待整改 / rectified=待复验 / closed=已关闭。 */
export type IssueStatus = "open" | "rectified" | "closed";

/** 问题严重度：minor=轻微 / normal=一般 / major=严重。 */
export type IssueSeverity = "minor" | "normal" | "major";

/** 节点检查项结果：null=未检 / pass=通过 / fail=不通过。 */
export type NodeCheckResult = "pass" | "fail" | null;

/**
 * 问题状态投影输入（供 canResubmitAfterReturn 等纯函数消费）。
 * 只取 status 一字段，避免把整张 Issue 行透传进纯函数（保持测试友好）。
 */
export interface IssueProjection {
  status: string;
}
