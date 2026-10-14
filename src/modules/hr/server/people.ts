import prisma from "@/core/db";
import { DEPARTMENT_LABEL, USER_ROLE_LABEL } from "@/core/domain/types";
import { PROJECT_MEMBER_ROLE_LABEL, type ProjectMemberRole } from "../roles";

export interface HrPersonRow {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  departmentLabel: string;
  projectCount: number;
}

export interface HrAssignmentRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  userId: string;
  userName: string;
  role: ProjectMemberRole;
  roleLabel: string;
  startDate: Date | null;
  endDate: Date | null;
  note: string;
}

export interface HrPageData {
  people: HrPersonRow[];
  assignments: HrAssignmentRow[];
  projects: { id: string; code: string; name: string }[];
  users: { id: string; name: string; roleLabel: string }[];
}

export async function getHrPageData(): Promise<HrPageData> {
  const [users, projects, assignments] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ department: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { projectMembers: true } } },
    }),
    prisma.project.findMany({
      where: { status: { not: "archived" } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.projectMember.findMany({
      where: { project: { status: { not: "archived" } } },
      orderBy: [{ project: { code: "asc" } }, { createdAt: "asc" }],
      include: {
        project: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    people: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleLabel: USER_ROLE_LABEL[u.role as keyof typeof USER_ROLE_LABEL] ?? u.role,
      departmentLabel:
        DEPARTMENT_LABEL[u.department as keyof typeof DEPARTMENT_LABEL] ?? "未分组",
      projectCount: u._count.projectMembers,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      projectId: a.project.id,
      projectCode: a.project.code,
      projectName: a.project.name,
      userId: a.user.id,
      userName: a.user.name,
      role: a.role as ProjectMemberRole,
      roleLabel: PROJECT_MEMBER_ROLE_LABEL[a.role as ProjectMemberRole] ?? a.role,
      startDate: a.startDate,
      endDate: a.endDate,
      note: a.note,
    })),
    projects,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      roleLabel: USER_ROLE_LABEL[u.role as keyof typeof USER_ROLE_LABEL] ?? u.role,
    })),
  };
}
