import prisma from "@/core/db";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import type {
  TimelineNode,
  TimelineIssue,
} from "../timeline";

/**
 * 质量管控 · 档案查询服务（M7-d，TASK_M7 §4-M7-d）。
 *
 * 索引页与项目档案页的取数入口：读前对（非 archived）项目调用
 * syncAcceptanceNodes（调用点②兜底），确保节点与排程完工态一致；
 * counts 一律取 DB 真值，不另算。
 *
 * 跨模块读走 core/db prisma 直读，不 import 其他模块内部。
 */

/** 档案索引行（每项目一行，供 /quality/archive 索引页直接渲染）。 */
export interface ArchiveIndexItem {
  id: string;
  code: string;
  name: string;
  startDate: Date | null;
  totalNodes: number;
  passedNodes: number;
  openIssues: number;
}

/**
 * 档案索引：全部非 archived 项目逐个 syncAcceptanceNodes → 节点/问题统计（DB 真值）。
 * 排序照项目 code 升序（与 /quality 列表页一致）。
 */
export async function getArchiveIndex(): Promise<ArchiveIndexItem[]> {
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" } },
    select: { id: true, code: true, name: true, startDate: true },
    orderBy: { code: "asc" },
  });

  // 调用点②：读前同步全部非 archived 项目（兜底自愈）
  for (const p of projects) {
    await syncAcceptanceNodes(p.id);
  }

  const items: ArchiveIndexItem[] = [];
  for (const p of projects) {
    const [totalNodes, passedNodes, openIssues] = await Promise.all([
      prisma.acceptanceNode.count({ where: { projectId: p.id } }),
      prisma.acceptanceNode.count({
        where: { projectId: p.id, status: "passed" },
      }),
      prisma.issue.count({
        where: { projectId: p.id, status: { not: "closed" } },
      }),
    ]);
    items.push({
      id: p.id,
      code: p.code,
      name: p.name,
      startDate: p.startDate,
      totalNodes,
      passedNodes,
      openIssues,
    });
  }

  return items;
}

// ── 项目档案 ──────────────────────────────────────────────────

/** 档案页项目信息（主数据快照）。 */
export interface ArchiveProjectInfo {
  id: string;
  code: string;
  name: string;
  startDate: Date | null;
  actualEndDate: Date | null;
  status: string;
}

/** 档案摘要（counts 取 DB 真值）。 */
export interface ArchiveSummary {
  totalNodes: number;
  passedNodes: number;
  totalIssues: number;
  openIssues: number;
}

/** 项目档案视图模型（可序列化；日期给 Date，页面自行格式化）。 */
export interface ProjectArchive {
  project: ArchiveProjectInfo;
  nodes: TimelineNode[];
  issues: TimelineIssue[];
  summary: ArchiveSummary;
}

/**
 * 取项目档案（M7-d）：项目主数据 + 节点投影（timeline 所需字段）+ 问题投影
 * （timeline 所需字段 + status）+ 摘要计数。
 *
 * 流程：findUnique 项目 → 不存在返回 null（页面 notFound）→ syncAcceptanceNodes
 * 兜底 → 节点（order/createdAt 升序）+ 问题（createdAt 升序）+ 四项 count。
 * 节点排序先按 order（工序顺序）再按 createdAt（稳定），与 /quality 列表一致。
 */
export async function getProjectArchive(
  projectId: string
): Promise<ProjectArchive | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      actualEndDate: true,
      status: true,
    },
  });
  if (!project) return null;

  // 调用点②：读前同步该项目（兜底自愈）
  await syncAcceptanceNodes(projectId);

  const [nodes, issues, totalNodes, passedNodes, totalIssues, openIssues] =
    await Promise.all([
      prisma.acceptanceNode.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          reviewedAt: true,
          returnReason: true,
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      prisma.issue.findMany({
        where: { projectId },
        select: {
          id: true,
          nodeId: true,
          title: true,
          createdAt: true,
          rectifyNote: true,
          rectifiedAt: true,
          recheckNote: true,
          closedAt: true,
          status: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.acceptanceNode.count({ where: { projectId } }),
      prisma.acceptanceNode.count({
        where: { projectId, status: "passed" },
      }),
      prisma.issue.count({ where: { projectId } }),
      prisma.issue.count({
        where: { projectId, status: { not: "closed" } },
      }),
    ]);

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      startDate: project.startDate,
      actualEndDate: project.actualEndDate,
      status: project.status,
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      status: n.status,
      createdAt: n.createdAt,
      submittedAt: n.submittedAt,
      reviewedAt: n.reviewedAt,
      returnReason: n.returnReason,
    })),
    issues: issues.map((i) => ({
      id: i.id,
      nodeId: i.nodeId,
      title: i.title,
      createdAt: i.createdAt,
      rectifyNote: i.rectifyNote,
      rectifiedAt: i.rectifiedAt,
      recheckNote: i.recheckNote,
      closedAt: i.closedAt,
    })),
    summary: { totalNodes, passedNodes, totalIssues, openIssues },
  };
}
