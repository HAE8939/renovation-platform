/**
 * 项目责任关系服务（M12-a · M13 体检收口）
 *
 * 为什么单独成文件：这段校验 + 增删此前整段写在 src/app/hr/actions.ts 里，
 * 而同模块的 WorkLog 走的是 server/worklogs.ts——一个模块两套分层比全都写在 action 里更糟，
 * 因为后者至少能说清"HR 就这么定的"，前者只是随手。契约 §2“逻辑归 modules/<id>/server”。
 *
 * 流水仍由动作层写（§4.4-③：服务函数多在 $transaction 内，流水进事务会连业务一起滚掉）。
 */
import prisma from "@/core/db";
import { isProjectMemberRole, type ProjectMemberRole } from "../roles";

export class ProjectMemberError extends Error {}

export interface ProjectMemberRow {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  /** 供动作层把流水写成"人话"（§4.4-②）：没有人名与项目号的流水等于没记。 */
  user: { name: string };
  project: { code: string; name: string };
}

/**
 * 新增一条“谁负责哪个项目的什么角色”。
 * 四道守卫，缺一条就能造出脏数据：
 * ① 三要素齐全且 role 合法；② 同项目同人同角色不重复（唯一索引兜底前的友好提示）；
 * ③ 用户与项目必须真实存在——原来不校验，经 curl 直调能建出悬空外键；
 * ④ note 去空白，最长 200（与列宽一致）。
 */
export async function addProjectMember(input: {
  projectId: string;
  userId: string;
  role: string;
  note?: string;
}): Promise<ProjectMemberRow> {
  const projectId = (input.projectId ?? "").trim();
  const userId = (input.userId ?? "").trim();
  const role = (input.role ?? "").trim();
  const note = (input.note ?? "").trim().slice(0, 200);

  if (!projectId || !userId || !isProjectMemberRole(role)) {
    throw new ProjectMemberError("请完整选择项目、人员和责任角色");
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId_role: { projectId, userId, role } },
  });
  if (existing) throw new ProjectMemberError("该项目已存在同一人员与责任角色");

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!user) throw new ProjectMemberError("所选人员不存在，请刷新后重选");
  if (!project) throw new ProjectMemberError("所选项目不存在，请刷新后重选");

  const created = await prisma.projectMember.create({
    data: {
      projectId,
      userId,
      role: role as ProjectMemberRole,
      note,
    },
    select: {
      id: true,
      projectId: true,
      userId: true,
      role: true,
      user: { select: { name: true } },
      project: { select: { code: true, name: true } },
    },
  });
  return created;
}

/**
 * 移除一条责任关系。行不存在返回 null（幂等：重复点删除不报错）。
 * 返回被删的行，供动作层写流水时取 projectId 与原角色。
 */
export async function removeProjectMember(
  id: string
): Promise<{
  projectId: string;
  role: string;
  userName: string;
  projectCode: string;
  projectName: string;
} | null> {
  const rowId = (id ?? "").trim();
  if (!rowId) return null;
  const row = await prisma.projectMember.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      projectId: true,
      role: true,
      user: { select: { name: true } },
      project: { select: { code: true, name: true } },
    },
  });
  if (!row) return null;
  await prisma.projectMember.delete({ where: { id: rowId } });
  return {
    projectId: row.projectId,
    role: row.role,
    userName: row.user.name,
    projectCode: row.project.code,
    projectName: row.project.name,
  };
}
