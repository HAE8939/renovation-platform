import prisma from "@/core/db";
import {
  DESIGN_TASK_TYPE_ORDER,
  type DesignTaskType,
} from "../types";
import { canAssign, statusAfterAssign } from "../status";

/**
 * 设计任务【新建与指派】服务（M5-e，接上主脊断点）。
 *
 * 存在的理由：design/server/tasks.ts 是 M5-a 的只读服务，看板/日历只渲染演示批次的任务，
 * 全站没有把一条设计任务写进库的入口——这是 PLATFORM_INTRODUCTION §8.2 点名的「主脊上最
 * 明确的断点」。本文件补齐写侧：新建（可同时指派）与对既有任务的指派/改派。
 *
 * 三条纪律（沿 createIssue / createLead 既有写法）：
 *  - 输入校验（标题/类型/优先级/日期/指派门控）在开事务前做，避免无谓 DB 轮次；
 *  - 关联实体存在性（项目、负责人）在事务内校验（幽灵 id 一律拒并给中文文案）；
 *  - 业务错误统一 DesignTaskError（中文直达 UI，仿 QualityIssueError / DesignSubmissionError）。
 * 跨模块只走 core/db prisma 直读，不 import 其他模块 server 内部（AGENTS §2）。
 *
 * 编号 DES-<年>-<3 位序号> 按已存在任务数推算，与 LEAD / RP 同法；本期单用户内测，
 * 并发撞号归 P5（沿 STATUS §4 编号并发延后口径）。
 */

/** 新建/指派校验类业务错误：中文文案直达 UI。 */
export class DesignTaskError extends Error {}

const VALID_PRIORITIES: ReadonlySet<string> = new Set(["high", "medium", "low"]);

/** 指派下拉用的负责人选项（全量用户，姓名升序，与 issues.ts UserOption 同形）。 */
export interface DesignUserOption {
  id: string;
  name: string;
}

/** 项目下拉用的选项（非归档项目，编号升序，与 issues.ts ProjectOption 同形）。 */
export interface DesignProjectOption {
  id: string;
  name: string;
  code: string;
}

/** 设计任务编号：DES-<年>-<3 位序号>。序号按已存在任务数推算。 */
export async function suggestDesignTaskCode(): Promise<string> {
  const count = await prisma.designTask.count();
  return `DES-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
}

/**
 * 表单选项：非归档项目 + 全量用户，一次取回喂给新建 Modal 与详情页指派表单。
 * 项目按可见性排掉 archived（「事按可见性」，归档项目不应再被指派新设计任务）。
 */
export async function listDesignFormOptions(): Promise<{
  projects: DesignProjectOption[];
  users: DesignUserOption[];
}> {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      where: { status: { not: "archived" } },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code })),
    users: users.map((u) => ({ id: u.id, name: u.name })),
  };
}

export interface CreateDesignTaskInput {
  projectId: string;
  title: string;
  type: string;
  requirement?: string;
  /** 截止日期 "YYYY-MM-DD"；空 = 未排期（诚实空态，不造假 deadline）。 */
  deadlineIso?: string | null;
  priority?: string;
  /** 建单时即指派（可空 → 落「待分配」）；非空须为库中真实 userId。 */
  assigneeId?: string | null;
}

/**
 * 解析截止日期：空 → null；非法 → 抛错。用本地零点（与 core projects.parseDateInput 同法），
 * 规避 UTC 零点在负时区被往前推一天。
 */
function parseDeadline(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new DesignTaskError("截止日期格式非法");
  return d;
}

/**
 * 新建设计任务（可带初始指派）。守卫（事务外先校验纯字段）：
 *  - 标题去空白非空；
 *  - type ∈ DESIGN_TASK_TYPE_ORDER；
 *  - priority ∈ {high,medium,low}（默认 medium）；
 *  - deadlineIso 可空、非法拒绝；
 * 事务内校验：项目存在 / assigneeId 为空或真实用户。
 * 落库：给了负责人 → status=assigned，未给 → status=pending；requirement 默认 ""。
 */
export async function createDesignTask(
  input: CreateDesignTaskInput
): Promise<{ id: string; code: string }> {
  const title = (input.title ?? "").trim();
  if (!title) throw new DesignTaskError("请填写任务标题");
  if (!DESIGN_TASK_TYPE_ORDER.includes(input.type as DesignTaskType)) {
    throw new DesignTaskError("任务类型非法");
  }
  const priority = (input.priority ?? "medium").trim() || "medium";
  if (!VALID_PRIORITIES.has(priority)) throw new DesignTaskError("优先级取值非法");
  const deadline = parseDeadline(input.deadlineIso);

  const assigneeRaw = (input.assigneeId ?? "").trim();
  const code = await suggestDesignTaskCode();

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) throw new DesignTaskError("项目不存在");

    let assigneeId: string | null = null;
    if (assigneeRaw) {
      const u = await tx.user.findUnique({
        where: { id: assigneeRaw },
        select: { id: true },
      });
      if (!u) throw new DesignTaskError("负责人不存在");
      assigneeId = u.id;
    }

    const created = await tx.designTask.create({
      data: {
        projectId: input.projectId,
        code,
        title,
        type: input.type,
        requirement: (input.requirement ?? "").trim(),
        deadline,
        priority,
        assigneeId,
        status: assigneeId ? "assigned" : "pending",
      },
      select: { id: true, code: true },
    });
    return created;
  });
}

/**
 * 对既有任务指派 / 改派负责人。守卫：
 *  - 任务存在；
 *  - canAssign(status)（已提交/已通过不开放，给中文错）；
 *  - assigneeId 必须非空且为库中真实 userId（指派语义就是给一个负责人）。
 * 仅「待分配」会因指派推进为「进行中」；执行/返修中的改派保持原态（statusAfterAssign）。
 * 本期不接登录，操作人由动作层写流水（action `design.assign`），服务层不多写别表。
 */
export async function assignDesignTask(
  taskId: string,
  assigneeId: string
): Promise<{ before: string; after: string; assigneeId: string }> {
  const who = (assigneeId ?? "").trim();
  if (!who) throw new DesignTaskError("请选择负责人后再指派");

  return prisma.$transaction(async (tx) => {
    const task = await tx.designTask.findUnique({
      where: { id: taskId },
      select: { id: true, status: true },
    });
    if (!task) throw new DesignTaskError("设计任务不存在");
    if (!canAssign(task.status)) {
      throw new DesignTaskError("当前状态（已提交或已通过）不可指派");
    }

    const u = await tx.user.findUnique({
      where: { id: who },
      select: { id: true },
    });
    if (!u) throw new DesignTaskError("负责人不存在");

    const after = statusAfterAssign(task.status);
    await tx.designTask.update({
      where: { id: taskId },
      data: { assigneeId: u.id, status: after },
    });
    return { before: task.status, after, assigneeId: u.id };
  });
}
