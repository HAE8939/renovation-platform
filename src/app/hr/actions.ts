"use server";

import { revalidatePath } from "next/cache";
import { recordOperation } from "@/core/domain/operationLog";
import { PROJECT_MEMBER_ROLE_LABEL } from "@/modules/hr/roles";
import {
  addProjectMember,
  removeProjectMember,
  ProjectMemberError,
} from "@/modules/hr/server/members";
import {
  archiveWorkLog,
  createWorkLog,
  WorkLogError,
} from "@/modules/hr/server/worklogs";
import { WORKLOG_CATEGORY_LABEL } from "@/modules/hr/worklogs";

/**
 * 人员工控（M12-a）动作层。
 *
 * 分层口径（M13 体检收口）：校验与读写在 modules/hr/server/*，这里只做三件事——
 * 取 FormData、写流水、重验缓存。原先责任关系的校验与 create/delete 直接写在本文件里，
 * 与同模块 WorkLog 走了两条路，现在归一。
 *
 * 流水写在动作层是 §4.4-③ 的硬要求：服务函数一旦被包进 $transaction 复用，
 * 流水进事务就会连业务一起滚掉。before/after 只放**机器值**（角色码、状态码），
 * 中文标签进 summary——一格两用会让恢复拿中文去校验而静默回落（§4.3 实见过）。
 */

export async function addProjectMemberAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  const note = String(formData.get("note") ?? "");
  try {
    const row = await addProjectMember({ projectId, userId, role, note });
    await recordOperation({
      action: "projectMember.create",
      entity: "projectMember",
      entityId: row.id,
      projectId: row.projectId,
      summary: `为项目「${row.project.name}」（${row.project.code}）新增责任关系：${row.user.name} 任${PROJECT_MEMBER_ROLE_LABEL[row.role as keyof typeof PROJECT_MEMBER_ROLE_LABEL] ?? row.role}`,
      after: row.role,
    });
    revalidatePath("/hr");
  } catch (e) {
    if (e instanceof ProjectMemberError) throw e;
    throw new Error("保存责任关系失败，请稍后重试");
  }
}

export async function removeProjectMemberAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("缺少责任关系编号");
  const removed = await removeProjectMember(id);
  if (!removed) return; // 幂等：已被别人删掉，不报错也不写流水
  await recordOperation({
    action: "projectMember.remove",
    entity: "projectMember",
    entityId: id,
    projectId: removed.projectId,
    summary: `移除项目「${removed.projectName}」（${removed.projectCode}）的责任关系：${removed.userName} 任${PROJECT_MEMBER_ROLE_LABEL[removed.role as keyof typeof PROJECT_MEMBER_ROLE_LABEL] ?? removed.role}`,
    before: removed.role,
  });
  revalidatePath("/hr");
}

export async function createWorkLogAction(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "");
  try {
    const row = await createWorkLog({
      projectId: get("projectId"),
      userId: get("userId"),
      workDate: get("workDate"),
      category: get("category"),
      title: get("title"),
      description: get("description"),
      minutes: get("minutes"),
      outputNote: get("outputNote"),
    });
    await recordOperation({
      action: "worklog.create",
      entity: "workLog",
      entityId: row.id,
      projectId: row.projectId,
      summary: `新增工作记录「${row.title}」· ${WORKLOG_CATEGORY_LABEL[row.category] ?? row.category} · ${row.workDate.toLocaleDateString("zh-CN")}${row.minutes ? ` · ${row.minutes} 分钟` : ""}`,
      after: row.category,
    });
    revalidatePath("/hr");
  } catch (e) {
    if (e instanceof WorkLogError) throw e;
    throw new Error("保存工作记录失败，请稍后重试");
  }
}

export async function archiveWorkLogAction(formData: FormData) {
  const row = await archiveWorkLog(String(formData.get("id") ?? ""));
  if (!row) return; // 幂等：重复归档或已被删，不写流水也不报错
  await recordOperation({
    action: "worklog.archive",
    entity: "workLog",
    entityId: row.id,
    projectId: row.projectId,
    summary: `归档工作记录「${row.title}」——仅从列表隐藏，仍计入工时统计（工时属事实族，见 §4.3）`,
    before: "active",
    after: "archived",
  });
  revalidatePath("/hr");
}
