import prisma from "@/core/db";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import { nodeDisplayLabel } from "../status";

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
