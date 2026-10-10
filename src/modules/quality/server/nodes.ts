import { Prisma } from "@prisma/client";
import prisma from "@/core/db";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import { getPlaceholderUser } from "../currentUser";
import {
  assertNodeTransition,
  canResubmitAfterReturn,
  canSubmitNode,
  nodeDisplayLabel,
} from "../status";
import type { IssueProjection } from "../types";

/**
 * 质量管控 · 节点查询服务（M7-a）。
 * 读前对全部非 archived 项目调用 syncAcceptanceNodes（调用点②兜底），
 * 确保节点与排程完工态一致（即便进度被外部直接改库也能自愈）。
 * 跨模块读走 core/db prisma 直读，不 import schedule/projects 内部。
 */

/** 节点列表行（视图模型，供 /quality 页直接渲染）。 */
export interface NodeListItem {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  name: string; // 节点名 = 工序名快照
  order: number;
  status: string;
  displayLabel: string; // 含「整改中」/「待重新提交」派生文案
  submitterName: string | null;
  submittedAt: Date | null;
  checkPassed: number; // result=="pass" 计数
  checkTotal: number; // 检查项总数
  openIssueCount: number; // 未关闭问题数（status!=="closed"）
}

/** 项目筛选项（下拉用）。 */
export interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

/** listNodes 返回：节点行 + 项目选项。 */
export interface NodeListResult {
  nodes: NodeListItem[];
  projects: ProjectOption[];
}

/**
 * 列表查询：读全部非 archived 项目 → 逐个 syncAcceptanceNodes（调用点②）→ 查节点。
 * filter.projectId 非空时仅返回该项目的节点（同步仍走全部非 archived 项目，保兜底一致）。
 * 排序：项目 code 升序 → 节点 order 升序。
 */
export async function listNodes(filter: {
  projectId?: string;
} = {}): Promise<NodeListResult> {
  // 非 archived 项目（archived 项目不出现在质量页）
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" } },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });

  // 调用点②：读前同步全部非 archived 项目（兜底自愈）
  for (const p of projects) {
    await syncAcceptanceNodes(p.id);
  }

  // 查节点（含项目名、检查项结果、问题状态）
  const nodes = await prisma.acceptanceNode.findMany({
    where: filter.projectId ? { projectId: filter.projectId } : {},
    include: {
      project: { select: { name: true, code: true } },
      checks: { select: { result: true } },
      issues: { select: { status: true } },
    },
    orderBy: [{ project: { code: "asc" } }, { order: "asc" }],
  });

  // 用户名字典：收集 submittedBy / reviewedBy（本期列表只用 submittedBy，预留扩展）
  const userIds = [
    ...new Set(
      nodes
        .map((n) => n.submittedBy)
        .filter((v): v is string => v !== null)
    ),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const rows: NodeListItem[] = nodes.map((n) => {
    const checkPassed = n.checks.filter((c) => c.result === "pass").length;
    const checkTotal = n.checks.length;
    const openIssueCount = n.issues.filter((i) => i.status !== "closed").length;
    const hasOpenIssue = n.issues.some((i) => i.status === "open");
    return {
      id: n.id,
      projectId: n.projectId,
      projectName: n.project.name,
      projectCode: n.project.code,
      name: n.name,
      order: n.order,
      status: n.status,
      displayLabel: nodeDisplayLabel(n.status, hasOpenIssue),
      submitterName: n.submittedBy ? (nameById.get(n.submittedBy) ?? null) : null,
      submittedAt: n.submittedAt,
      checkPassed,
      checkTotal,
      openIssueCount,
    };
  });

  return {
    nodes: rows,
    projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
  };
}

/** resolveTaskNode 返回：命中节点 / 仅有项目 / 任务不存在。 */
export type ResolveTaskNodeResult =
  | { nodeId: string }
  | { projectId: string }
  | null;

/**
 * 按 taskId 解析验收节点（供 /quality?taskId= 深链跳转，§3 / M7-e）。
 * - 任务不存在 → null（页面不跳转，显示列表）；
 * - 任务存在 → sync 其项目（调用点②兜底）→ 按 taskId 查节点：
 *   - 命中 → { nodeId }（页面 redirect 到节点详情）；
 *   - 未命中 → { projectId }（页面 redirect 到 ?projectId= 筛选）。
 * taskId 是 AcceptanceNode.taskId 的逻辑引用（@unique），直接 findUnique。
 */
export async function resolveTaskNode(
  taskId: string
): Promise<ResolveTaskNodeResult> {
  const task = await prisma.scheduleTask.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true },
  });
  if (!task) return null;

  // 调用点②：读前同步该任务所属项目（兜底自愈）
  await syncAcceptanceNodes(task.projectId);

  const node = await prisma.acceptanceNode.findUnique({
    where: { taskId: task.id },
    select: { id: true },
  });
  if (node) return { nodeId: node.id };
  return { projectId: task.projectId };
}

// ── M7-b：节点详情 + 提交 ────────────────────────────────────────

/** 节点详情检查项视图（快照自 CheckItem，含提交结果）。 */
export interface NodeCheckItem {
  id: string;
  name: string;
  standard: string;
  order: number;
  result: string | null; // null=未检 | "pass" | "fail"
  note: string;
}

/** 节点详情关联问题视图（退回自动建或手工关联）。 */
export interface NodeIssueItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  createdAt: Date;
}

/** 节点关联工序任务信息（taskId 逻辑引用 ScheduleTask；查无则 null）。 */
export interface NodeTaskInfo {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  ownerId: string | null;
  ownerName: string | null; // 负责人名（ownerId 解析；null=未指派）
}

/** 节点详情视图模型（可序列化；日期给 Date，页面自行格式化）。 */
export interface NodeDetail {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  taskId: string | null;
  name: string;
  order: number;
  status: string;
  displayLabel: string; // 含「整改中」/「待重新提交」派生文案
  submitNote: string;
  submittedByName: string | null;
  submittedAt: Date | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  returnReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  checks: NodeCheckItem[];
  issues: NodeIssueItem[];
  task: NodeTaskInfo | null;
  hasOpenIssues: boolean; // 派生：是否存在 status==="open" 问题（重提门控/UI 提示用）
}

/**
 * 取节点详情（M7-b）：节点 + 项目名 + 检查项（order asc）+ 关联问题（createdAt asc，
 * 含 severity/status/title）+ 用户名字字典（submittedBy/reviewedBy → name）+
 * 关联任务信息（prisma 直读 ScheduleTask by taskId，查无则 null）。
 *
 * submittedBy/reviewedBy 与 User 仅逻辑引用（无 @relation），故取行后按 id 批量查名
 * （同 design/submissions 的 nameById 做法）。
 * 节点不存在返回 null，由页面走 notFound()。
 */
export async function getNodeDetail(id: string): Promise<NodeDetail | null> {
  const node = await prisma.acceptanceNode.findUnique({
    where: { id },
    include: {
      project: { select: { name: true, code: true } },
      checks: { orderBy: { order: "asc" } },
      issues: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, severity: true, status: true, createdAt: true } },
    },
  });
  if (!node) return null;

  // 用户名字字典：submittedBy / reviewedBy
  const userIds = [
    ...new Set([node.submittedBy, node.reviewedBy].filter((v): v is string => v !== null)),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  // 关联工序任务（taskId 为逻辑引用，无 @relation；悬垂允许）
  const task = node.taskId
    ? await prisma.scheduleTask.findUnique({
        where: { id: node.taskId },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          actualStart: true,
          actualEnd: true,
          ownerId: true,
        },
      })
    : null;

  // 负责人名（任务 ownerId 为 userId 逻辑引用）
  const ownerName = task?.ownerId
    ? (await prisma.user.findUnique({
        where: { id: task.ownerId },
        select: { name: true },
      }))?.name ?? null
    : null;

  const hasOpenIssues = node.issues.some((i) => i.status === "open");

  return {
    id: node.id,
    projectId: node.projectId,
    projectName: node.project.name,
    projectCode: node.project.code,
    taskId: node.taskId,
    name: node.name,
    order: node.order,
    status: node.status,
    displayLabel: nodeDisplayLabel(node.status, hasOpenIssues),
    submitNote: node.submitNote,
    submittedByName: node.submittedBy ? (nameById.get(node.submittedBy) ?? null) : null,
    submittedAt: node.submittedAt,
    reviewedByName: node.reviewedBy ? (nameById.get(node.reviewedBy) ?? null) : null,
    reviewedAt: node.reviewedAt,
    returnReason: node.returnReason,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    checks: node.checks.map((c) => ({
      id: c.id,
      name: c.name,
      standard: c.standard,
      order: c.order,
      result: c.result,
      note: c.note,
    })),
    issues: node.issues.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      createdAt: i.createdAt,
    })),
    task: task
      ? {
          id: task.id,
          name: task.name,
          startDate: task.startDate,
          endDate: task.endDate,
          actualStart: task.actualStart,
          actualEnd: task.actualEnd,
          ownerId: task.ownerId,
          ownerName: ownerName,
        }
      : null,
    hasOpenIssues,
  };
}

/** 提交校验类业务错误：中文文案直达 UI（仿 ScheduleUpdateError）。 */
export class QualityNodeError extends Error {}

/** 提交检查项输入（按检查项 id 填结果与备注）。 */
export interface SubmitCheckInput {
  id: string;
  result: "pass" | "fail";
  note: string;
}

/** submitNode 入参。 */
export interface SubmitNodeInput {
  checks: SubmitCheckInput[];
  submitNote: string;
}

/**
 * 提交验收（M7-b）：一个事务内原子完成 ——
 * ① 取占位提交人（开事务前只读，无则拒绝「未找到演示用户」）；
 * ② 事务内取节点校验存在 / canSubmitNode（pending|returned 可提交）；
 * ③ returned 重提 → 读关联问题，canResubmitAfterReturn 不过则报
 *   「存在未整改问题，整改完成后可重新提交」；
 * ④ checks 全覆盖：按 id 对照节点检查项，缺报「还有 N 项未检」，
 *   多余 id 报「检查项不匹配」（空清单工序可提交）；
 * ⑤ assertNodeTransition(from,"submitted") 兜底；
 * ⑥ 逐项 updateMany 写 result/note；节点 status→submitted、submitNote、
 *   submittedBy/submittedAt。
 *
 * tx 传播照 core/domain/projects.ts 的 createProject(input, tx?) 范式
 * （M3-d2 教训：跨函数复用事务必须显式传 tx）。
 */
export async function submitNode(
  id: string,
  input: SubmitNodeInput,
  externalTx?: Prisma.TransactionClient
): Promise<void> {
  const me = await getPlaceholderUser("submit");
  if (!me) {
    throw new QualityNodeError("未找到演示用户（inspector/pm 角色均缺失），请先运行 seed 初始化用户");
  }

  const run = async (tx: Prisma.TransactionClient): Promise<void> => {
    const node = await tx.acceptanceNode.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        projectId: true,
        checks: { select: { id: true }, orderBy: { order: "asc" } },
      },
    });
    if (!node) throw new QualityNodeError("验收节点不存在");

    if (!canSubmitNode(node.status)) {
      throw new QualityNodeError("当前状态不可提交");
    }

    // returned 重提门控：关联问题须全部非 open
    if (node.status === "returned") {
      const issues = await tx.issue.findMany({
        where: { nodeId: id },
        select: { status: true },
      });
      if (!canResubmitAfterReturn(issues as IssueProjection[])) {
        throw new QualityNodeError("存在未整改问题，整改完成后可重新提交");
      }
    }

    // checks 全覆盖：按 id 对照（空清单节点 = 0 检查项，空 input 合法）
    const nodeCheckIds = new Set(node.checks.map((c) => c.id));
    const inputIds = new Set(input.checks.map((c) => c.id));
    const missingCount = [...nodeCheckIds].filter((cid) => !inputIds.has(cid)).length;
    if (missingCount > 0) {
      throw new QualityNodeError(`还有 ${missingCount} 项未检`);
    }
    const extraIds = [...inputIds].filter((iid) => !nodeCheckIds.has(iid));
    if (extraIds.length > 0) {
      throw new QualityNodeError("检查项不匹配");
    }

    // 兜底状态转移合法性（canSubmitNode 已保证 from∈{pending,returned}）
    assertNodeTransition(node.status, "submitted");

    // 逐项写结果与备注（按检查项 id updateMany）
    for (const c of input.checks) {
      await tx.nodeCheck.update({
        where: { id: c.id },
        data: { result: c.result, note: (c.note ?? "").trim() },
      });
    }

    await tx.acceptanceNode.update({
      where: { id },
      data: {
        status: "submitted",
        submitNote: (input.submitNote ?? "").trim(),
        submittedBy: me.id,
        submittedAt: new Date(),
      },
    });
  };

  return externalTx ? run(externalTx) : prisma.$transaction(run);
}
