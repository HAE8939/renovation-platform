import prisma from "@/core/db";
import { getPlaceholderUser } from "../currentUser";
import { assertIssueTransition, canRectify } from "../status";
import type { IssueSeverity } from "../types";

/**
 * 质量管控 · 问题台账服务（M7-c）。
 *
 * 问题 3 态机（§1-2）：open 待整改 → rectified 待复验 → closed 已关闭；
 * rectified → open（复验退回，填 recheckNote，保留 rectifyNote/rectifiedAt 历史）。
 *
 * 跨模块读走 core/db prisma 直读，不 import 其他模块内部。
 * 业务错误用 QualityIssueError（中文文案直达 UI，仿 QualityReviewError）。
 */

/** 台账业务错误：中文文案直达 UI（仿 QualityReviewError / QualityNodeError）。 */
export class QualityIssueError extends Error {}

/** 合法严重度集合（枚举校验用，与 review.ts 一致）。 */
const VALID_SEVERITIES: ReadonlySet<string> = new Set([
  "minor",
  "normal",
  "major",
]);

/** 问题状态排序权重（open=0 → rectified=1 → closed=2），升序 = 最待办在前。 */
const STATUS_RANK: Record<string, number> = {
  open: 0,
  rectified: 1,
  closed: 2,
};

// ── listIssues ─────────────────────────────────────────────────

/** 项目筛选项（下拉用，与 nodes.ts ProjectOption 同形）。 */
export interface ProjectOption {
  id: string;
  name: string;
  code: string;
}

/** 用户筛选项（责任人下拉用）。 */
export interface UserOption {
  id: string;
  name: string;
}

/** 问题台账行（视图模型，供 /quality/issues 页直接渲染 + 抽屉展示）。 */
export interface IssueRow {
  id: string;
  nodeId: string | null;
  nodeName: string | null;
  projectId: string;
  projectName: string;
  title: string;
  desc: string;
  severity: string;
  status: string;
  reporterName: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  createdAt: Date;
  rectifyNote: string | null;
  rectifiedAt: Date | null;
  recheckNote: string | null;
  closedAt: Date | null;
}

/**
 * listIssues 返回：问题行 + 筛选项（非 archived 项目 / 用户列表）+ 归档提示。
 *
 * `archivedProjectName` 非空 = 用户正用 `?projectId=` 深链访问一个**已归档**项目。
 * 列表按口径不显示归档项目的问题，若不把这句递给页面，用户看到的是
 * 「明明有记录却一片空白」，只会以为数据丢了（本仓一贯的诚实降级要求）。
 */
export interface IssueListResult {
  issues: IssueRow[];
  projects: ProjectOption[];
  users: UserOption[];
  archivedProjectName: string | null;
}

/** 筛选入参（三态均可空）。 */
export interface IssueListFilters {
  projectId?: string;
  status?: string;
  severity?: string;
}

/**
 * 列表查询（M7-c）：按项目/状态/严重度筛问题，含项目名 / 节点名 /
 * 报告人 / 责任人名（逻辑引用拆名仿 nodes.ts 的 nameById 做法）。
 *
 * 排序：状态 rank（open=0 → rectified=1 → closed=2）升序，同 rank 按 createdAt 降序
 * （最待办的问题在前，同态内最新优先）。**问题本体与项目下拉都取非 archived**
 * （M10-c：归档＝从待办视野摘出，与驾驶舱「未整改问题」计数同口径）；
 * 用户列表全量供责任人下拉。
 */
export async function listIssues(
  filters: IssueListFilters = {}
): Promise<IssueListResult> {
  const where: {
    projectId?: string;
    status?: string;
    severity?: string;
    /** 归档项目的问题不进全司台账视野（M10-c「事按可见性」，见下注释）。 */
    project?: { status: { not: string } };
  } = {};
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.status) where.status = filters.status;
  if (filters.severity) where.severity = filters.severity;
  // 列表本体排除已归档项目的问题。此前只排了下拉、本体没排，于是
  // 「问题台账里数得到、驾驶舱待办里数不到」——同一时刻两个未整改数对不上。
  // 归档项目的历史问题并未删除：恢复归档即回到台账，单项目页也照读得到。
  where.project = { status: { not: "archived" } };

  const issues = await prisma.issue.findMany({
    where,
    include: {
      project: { select: { name: true } },
      node: { select: { name: true } },
    },
  });

  // 用户名字典：reportedBy / assigneeId（均为 userId 逻辑引用，无 @relation）
  const userIds = [
    ...new Set(
      issues
        .flatMap((i) => [i.reportedBy, i.assigneeId])
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

  const rows: IssueRow[] = issues.map((i) => ({
    id: i.id,
    nodeId: i.nodeId,
    nodeName: i.node?.name ?? null,
    projectId: i.projectId,
    projectName: i.project.name,
    title: i.title,
    desc: i.desc,
    severity: i.severity,
    status: i.status,
    reporterName: nameById.get(i.reportedBy) ?? null,
    assigneeName: i.assigneeId ? (nameById.get(i.assigneeId) ?? null) : null,
    dueDate: i.dueDate,
    createdAt: i.createdAt,
    rectifyNote: i.rectifyNote,
    rectifiedAt: i.rectifiedAt,
    recheckNote: i.recheckNote,
    closedAt: i.closedAt,
  }));

  // 排序：状态 rank 升序，同 rank 按 createdAt 降序
  rows.sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 99;
    const rb = STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const [projects, allUsers, archivedHit] = await Promise.all([
    prisma.project.findMany({
      where: { status: { not: "archived" } },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // 深链正指一个已归档项目 → 带回项目名，让页面说明「为什么是空的」
    filters.projectId
      ? prisma.project.findFirst({
          where: { id: filters.projectId, status: "archived" },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    issues: rows,
    projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    users: allUsers.map((u) => ({ id: u.id, name: u.name })),
    archivedProjectName: archivedHit?.name ?? null,
  };
}

// ── rectifyIssue ───────────────────────────────────────────────

/**
 * 标记问题整改完成（open → rectified）。
 * 守卫：问题存在 / canRectify(status)（否则「当前状态不可整改」）/ note 去空白非空
 * （「整改说明不能为空」）；写 rectifyNote + rectifiedAt=now、status→rectified；
 * assertIssueTransition("open","rectified") 兜底。单事务。
 *
 * note 非空校验在开事务前（仿 review.ts 的 reason 校验位置，避免无谓 DB 轮次）。
 */
export async function rectifyIssue(id: string, note: string): Promise<void> {
  const noteTrim = (note ?? "").trim();
  if (!noteTrim) {
    throw new QualityIssueError("整改说明不能为空");
  }

  return prisma.$transaction(async (tx) => {
    const issue = await tx.issue.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!issue) throw new QualityIssueError("问题不存在");
    if (!canRectify(issue.status)) {
      throw new QualityIssueError("当前状态不可整改");
    }
    // 兜底状态转移合法性（canRectify 已保证 from=open）
    assertIssueTransition(issue.status, "rectified");

    await tx.issue.update({
      where: { id },
      data: {
        status: "rectified",
        rectifyNote: noteTrim,
        rectifiedAt: new Date(),
      },
    });
  });
}

// ── recheckIssue ───────────────────────────────────────────────

/** 复验通过入参：note 可空（通过时复验意见选填）。 */
export interface RecheckPassInput {
  pass: true;
  note?: string;
}

/** 复验退回入参：note 必填（退回意见不能为空）。 */
export interface RecheckFailInput {
  pass: false;
  note: string;
}

export type RecheckInput = RecheckPassInput | RecheckFailInput;

/**
 * 复验问题（rectified → closed | open）。
 * 守卫：问题存在 / status==="rectified"（否则「仅待复验问题可复验」）；
 * pass=false 时 note 去空白非空（「复验意见不能为空」）；
 * pass=true → status=closed、closedAt=now、recheckNote=note?.trim() || null；
 * pass=false → status=open、recheckNote=note.trim()；
 * rectifyNote/rectifiedAt 历史一律不清（保留整改记录）；
 * assertIssueTransition 兜底（rectified→closed / rectified→open）。单事务。
 *
 * pass=false 的 note 非空校验在开事务前（仿 review.ts）；存在/状态校验在事务内。
 */
export async function recheckIssue(
  id: string,
  input: RecheckInput
): Promise<void> {
  if (!input.pass) {
    const noteTrim = (input.note ?? "").trim();
    if (!noteTrim) {
      throw new QualityIssueError("复验意见不能为空");
    }
  }

  return prisma.$transaction(async (tx) => {
    const issue = await tx.issue.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!issue) throw new QualityIssueError("问题不存在");
    if (issue.status !== "rectified") {
      throw new QualityIssueError("仅待复验问题可复验");
    }

    const now = new Date();
    if (input.pass) {
      assertIssueTransition("rectified", "closed");
      const noteTrim = (input.note ?? "").trim();
      await tx.issue.update({
        where: { id },
        data: {
          status: "closed",
          closedAt: now,
          recheckNote: noteTrim || null,
        },
      });
    } else {
      assertIssueTransition("rectified", "open");
      const noteTrim = (input.note ?? "").trim();
      await tx.issue.update({
        where: { id },
        data: {
          status: "open",
          recheckNote: noteTrim,
          // rectifyNote/rectifiedAt 历史保留，不清（§1-2 / §4-M7-c）
        },
      });
    }
  });
}

// ── createIssue ────────────────────────────────────────────────

/** 手工新建问题入参。 */
export interface CreateIssueInput {
  projectId: string;
  title: string;
  desc?: string;
  severity: string;
  assigneeId?: string | null;
  dueDateIso?: string | null;
}

/**
 * 手工新建问题（M7-c，§1-4 台账含最小「手工新建」）。
 * 守卫：projectId 存在（「项目不存在」）/ title 去空白非空（「问题标题不能为空」）/
 * severity ∈ {minor,normal,major}（「严重度取值非法」）/ assigneeId 为 null/空 或
 * 库中真实 userId（「责任人不存在」）/ dueDateIso 可空、非法拒绝（「截止日期格式非法」）；
 * status="open"、reportedBy=占位用户（getPlaceholderUser("submit")，null 报
 * 「未找到演示用户」）、nodeId=null（手工建无来源节点）。单事务。
 *
 * 输入校验（title/severity/dueDate/占位用户）在开事务前（仿 review.ts）；
 * projectId/assigneeId 存在性校验在事务内。
 */
export async function createIssue(
  input: CreateIssueInput
): Promise<{ id: string }> {
  const title = (input.title ?? "").trim();
  if (!title) {
    throw new QualityIssueError("问题标题不能为空");
  }
  if (!VALID_SEVERITIES.has(input.severity)) {
    throw new QualityIssueError("严重度取值非法");
  }

  // dueDateIso：可空；非空时须可解析为日期，否则「截止日期格式非法」
  let dueDate: Date | null = null;
  const dueRaw = (input.dueDateIso ?? "").trim();
  if (dueRaw) {
    const d = new Date(dueRaw);
    if (isNaN(d.getTime())) {
      throw new QualityIssueError("截止日期格式非法");
    }
    dueDate = d;
  }

  // 占位提交人（开事务前只读，无则拒绝）
  const me = await getPlaceholderUser("submit");
  if (!me) {
    throw new QualityIssueError(
      "未找到演示用户（inspector/pm 角色均缺失），请先运行 seed 初始化用户"
    );
  }

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) throw new QualityIssueError("项目不存在");

    // assigneeId：null/空串 视为未指派；非空须为库中真实 userId
    let assigneeId: string | null = null;
    const assigneeRaw = (input.assigneeId ?? "").trim();
    if (assigneeRaw) {
      const u = await tx.user.findUnique({
        where: { id: assigneeRaw },
        select: { id: true },
      });
      if (!u) throw new QualityIssueError("责任人不存在");
      assigneeId = u.id;
    }

    const created = await tx.issue.create({
      data: {
        projectId: input.projectId,
        title,
        desc: (input.desc ?? "").trim(),
        severity: input.severity as IssueSeverity,
        status: "open",
        reportedBy: me.id,
        assigneeId,
        dueDate,
        nodeId: null, // 手工新建无来源节点
      },
      select: { id: true },
    });
    return { id: created.id };
  });
}
