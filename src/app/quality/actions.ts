"use server";

import { revalidatePath } from "next/cache";
import { QualityNodeError, submitNode } from "@/modules/quality/server/nodes";
import { QualityReviewError, reviewNode } from "@/modules/quality/server/review";
import {
  QualityIssueError,
  createIssue,
  rectifyIssue,
  recheckIssue,
} from "@/modules/quality/server/issues";
import type { IssueSeverity } from "@/modules/quality/types";
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation } from "@/core/domain/operationLog";
import prisma from "@/core/db";
import {
  deleteEvidence,
  EvidenceError,
  uploadEvidence,
} from "@/modules/quality/server/evidence";

/**
 * 质量管控 Server Action（M7-b）。仿 design/actions.ts：
 * FormData 入参 → 调服务层 → revalidatePath 刷新；校验失败回中文文案，不 silent fail。
 *
 * checks 表单字段命名：`check_<id>_result`（radio：pass|fail，未选则不提交该字段）
 * + `check_<id>_note`（备注 textarea）。覆盖率守卫在 submitNode 服务层兜底。
 */

export interface SubmitNodeFormState {
  error?: string;
  ok?: boolean;
}

export async function submitNodeAction(
  _prev: SubmitNodeFormState,
  formData: FormData
): Promise<SubmitNodeFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const nodeId = text("nodeId");
    if (!nodeId) return { error: "缺少节点标识，请刷新页面后重试" };

    // 从 FormData 解析检查项结果：check_<id>_result 配对 check_<id>_note
    const checks: { id: string; result: "pass" | "fail"; note: string }[] = [];
    const re = /^check_(.+)_result$/;
    for (const [key, value] of formData.entries()) {
      const m = key.match(re);
      if (!m) continue;
      const id = m[1];
      const result = String(value);
      if (result !== "pass" && result !== "fail") continue; // 防御性
      const note = String(formData.get(`check_${id}_note`) ?? "").trim();
      checks.push({ id, result, note });
    }

    await submitNode(nodeId, { checks, submitNote: text("submitNote") });
    const nodeSub = await prisma.acceptanceNode.findUnique({ where: { id: nodeId }, select: { name: true, projectId: true } });
    await recordOperation({
      action: "node.submit",
      entity: "acceptanceNode",
      entityId: nodeId,
      projectId: nodeSub?.projectId ?? null,
      summary: `提交验收“${nodeSub?.name ?? nodeId}”，检查项 ${checks.length} 条`,
      after: text("submitNote") || "（无提交说明）",
    });

    revalidatePath("/quality");
    revalidatePath(`/quality/nodes/${nodeId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityNodeError) return { error: e.message };
    logAppError("[submitNodeAction]", e);
    return { error: "提交失败，请稍后重试" };
  }
}

export interface EvidenceActionFormState {
  error?: string;
  ok?: boolean;
}

/** 节点级证据上传：FormData = nodeId + file。 */
export async function uploadEvidenceAction(
  _prev: EvidenceActionFormState,
  formData: FormData,
): Promise<EvidenceActionFormState> {
  try {
    const nodeId = String(formData.get("nodeId") ?? "").trim();
    const file = formData.get("file");
    if (!nodeId) return { error: "缺少节点标识，请刷新页面后重试" };
    if (!(file instanceof File)) return { error: "请选择要上传的证据图片" };
    const saved = await uploadEvidence(nodeId, file);
    await recordOperation({
      action: "evidence.upload",
      entity: "evidence",
      entityId: saved.id,
      projectId: (await prisma.acceptanceNode.findUnique({ where: { id: nodeId }, select: { projectId: true } }))?.projectId ?? null,
      summary: `上传验收证据“${saved.originalName}”`,
      after: `${saved.mimeType}，${saved.size} 字节`,
    });
    revalidatePath(`/quality/nodes/${nodeId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof EvidenceError) return { error: e.message };
    logAppError("[uploadEvidenceAction]", e);
    return { error: "上传失败，请稍后重试" };
  }
}

/** 删除当前占位用户自己上传的节点级证据。 */
export async function deleteEvidenceAction(
  _prev: EvidenceActionFormState,
  formData: FormData,
): Promise<EvidenceActionFormState> {
  try {
    const evidenceId = String(formData.get("evidenceId") ?? "").trim();
    if (!evidenceId) return { error: "缺少证据标识，请刷新页面后重试" };
    const removed = await deleteEvidence(evidenceId);
    const node = await prisma.acceptanceNode.findUnique({ where: { id: removed.nodeId }, select: { projectId: true } });
    await recordOperation({
      action: "evidence.delete",
      entity: "evidence",
      entityId: evidenceId,
      projectId: node?.projectId ?? null,
      summary: `删除验收证据“${removed.originalName}”`,
    });
    revalidatePath(`/quality/nodes/${removed.nodeId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof EvidenceError) return { error: e.message };
    logAppError("[deleteEvidenceAction]", e);
    return { error: "删除失败，请稍后重试" };
  }
}

export interface ReviewNodeFormState {
  error?: string;
  ok?: boolean;
}

export async function reviewNodeAction(
  _prev: ReviewNodeFormState,
  formData: FormData
): Promise<ReviewNodeFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const nodeId = text("nodeId");
    const approve = text("approve") === "true";
    if (!nodeId) return { error: "缺少节点标识，请刷新页面后重试" };

    if (approve) {
      await reviewNode(nodeId, { approve: true });
    } else {
      const reason = text("reason");
      const severity = (text("severity") || "normal") as IssueSeverity;
      await reviewNode(nodeId, { approve: false, reason, severity });
    }

    revalidatePath("/quality");
    revalidatePath(`/quality/nodes/${nodeId}`);
    const nodeRev = await prisma.acceptanceNode.findUnique({
      where: { id: nodeId },
      select: { name: true, projectId: true, status: true },
    });
    const issueRev = nodeRev ? await prisma.issue.findFirst({
      where: { nodeId, status: "open" },
      orderBy: { createdAt: "desc" },
      select: { title: true },
    }) : null;
    await recordOperation({
      action: "node.review",
      entity: "acceptanceNode",
      entityId: nodeId,
      projectId: nodeRev?.projectId ?? null,
      summary: approve
        ? `验收通过“${nodeRev?.name ?? nodeId}”`
        : `验收退回“${nodeRev?.name ?? nodeId}”：${text("reason") || "未填原因"}（严重度 ${text("severity") || "normal"}${issueRev ? `，已建问题“${issueRev.title}”` : ""}）`,
      before: "submitted",
      after: nodeRev?.status ?? (approve ? "passed" : "returned"),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityReviewError) return { error: e.message };
    logAppError("[reviewNodeAction]", e);
    return { error: "审核失败，请稍后重试" };
  }
}

// ── M7-c：问题台账（整改 / 复验 / 手工新建）──────────────────

export interface IssueActionFormState {
  error?: string;
  ok?: boolean;
}

/** 整改：rectifyIssue(id, note)。FormData: issueId + rectifyNote（必填）。 */
export async function rectifyIssueAction(
  _prev: IssueActionFormState,
  formData: FormData
): Promise<IssueActionFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const issueId = text("issueId");
    const note = text("rectifyNote");
    if (!issueId) return { error: "缺少问题标识，请刷新页面后重试" };

    await rectifyIssue(issueId, note);
    const iss = await prisma.issue.findUnique({ where: { id: issueId }, select: { title: true, projectId: true, status: true } });
    await recordOperation({
      action: "issue.rectify",
      entity: "issue",
      entityId: issueId,
      projectId: iss?.projectId ?? null,
      summary: `标记问题“${iss?.title ?? issueId}”已整改：${note || "未填说明"}`,
      after: iss?.status ?? null,
    });

    revalidatePath("/quality/issues");
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityIssueError) return { error: e.message };
    logAppError("[rectifyIssueAction]", e);
    return { error: "整改提交失败，请稍后重试" };
  }
}

/**
 * 复验：recheckIssue(id, { pass, note })。
 * FormData: issueId + pass（"true"|"false"）+ recheckNote（退回必填、通过选填）。
 */
export async function recheckIssueAction(
  _prev: IssueActionFormState,
  formData: FormData
): Promise<IssueActionFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const issueId = text("issueId");
    const pass = text("pass") === "true";
    const note = text("recheckNote");
    if (!issueId) return { error: "缺少问题标识，请刷新页面后重试" };

    if (pass) {
      await recheckIssue(issueId, { pass: true, note });
    } else {
      await recheckIssue(issueId, { pass: false, note });
    }

    revalidatePath("/quality/issues");
    revalidatePath("/quality");
    const issRe = await prisma.issue.findUnique({
      where: { id: issueId },
      select: { title: true, projectId: true, status: true },
    });
    await recordOperation({
      action: "issue.recheck",
      entity: "issue",
      entityId: issueId,
      projectId: issRe?.projectId ?? null,
      summary: pass
        ? `复验通过并关闭问题“${issRe?.title ?? issueId}”${note ? `：${note}` : ""}`
        : `复验退回问题“${issRe?.title ?? issueId}”：${note || "未填意见"}`,
      after: issRe?.status ?? (pass ? "closed" : "open"),
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityIssueError) return { error: e.message };
    logAppError("[recheckIssueAction]", e);
    return { error: "复验提交失败，请稍后重试" };
  }
}

/** 手工新建：createIssue(input)。FormData: projectId/title/desc/severity/assigneeId/dueDate。 */
export async function createIssueAction(
  _prev: IssueActionFormState,
  formData: FormData
): Promise<IssueActionFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const projectId = text("projectId");
    const title = text("title");
    const desc = text("desc");
    const severity = text("severity") || "normal";
    const assigneeId = text("assigneeId");
    const dueDateIso = text("dueDate");

    await createIssue({
      projectId,
      title,
      desc,
      severity: severity as IssueSeverity,
      assigneeId: assigneeId || null,
      dueDateIso: dueDateIso || null,
    });

    revalidatePath("/quality/issues");
    revalidatePath("/quality");
    await recordOperation({
      action: "issue.create",
      entity: "issue",
      projectId,
      summary: `手工新建问题“${title}”（严重度 ${severity}）`,
      after: desc || "（无详细描述）",
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityIssueError) return { error: e.message };
    logAppError("[createIssueAction]", e);
    return { error: "新建问题失败，请稍后重试" };
  }
}
