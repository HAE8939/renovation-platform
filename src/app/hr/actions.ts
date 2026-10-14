"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/core/db";
import { recordOperation } from "@/core/domain/operationLog";
import { isProjectMemberRole } from "@/modules/hr/roles";
import { archiveWorkLog, createWorkLog, WorkLogError } from "@/modules/hr/server/worklogs";

export async function addProjectMember(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!projectId || !userId || !isProjectMemberRole(role)) {
    throw new Error("请完整选择项目、人员和责任角色");
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId_role: { projectId, userId, role } },
  });
  if (existing) throw new Error("该项目已存在同一人员与责任角色");

  const row = await prisma.projectMember.create({ data: { projectId, userId, role, note } });
  await recordOperation({
    action: "projectMember.create",
    entity: "projectMember",
    entityId: row.id,
    projectId,
    summary: "新增项目责任关系",
    after: role,
  });
  revalidatePath("/hr");
}

export async function removeProjectMember(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("缺少责任关系编号");
  const row = await prisma.projectMember.findUnique({ where: { id } });
  if (!row) return;
  await prisma.projectMember.delete({ where: { id } });
  await recordOperation({
    action: "projectMember.remove",
    entity: "projectMember",
    entityId: id,
    projectId: row.projectId,
    summary: "移除项目责任关系",
    before: row.role,
  });
  revalidatePath("/hr");
}

export async function createWorkLogAction(formData: FormData) {
  try {
    await createWorkLog({ projectId: String(formData.get("projectId") ?? ""), userId: String(formData.get("userId") ?? ""), workDate: String(formData.get("workDate") ?? ""), category: String(formData.get("category") ?? ""), title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? ""), minutes: String(formData.get("minutes") ?? ""), outputNote: String(formData.get("outputNote") ?? "") });
    revalidatePath("/hr");
  } catch (e) {
    if (e instanceof WorkLogError) throw e;
    throw new Error("保存工作记录失败，请稍后重试");
  }
}

export async function archiveWorkLogAction(formData: FormData) {
  await archiveWorkLog(String(formData.get("id") ?? ""));
  revalidatePath("/hr");
}
