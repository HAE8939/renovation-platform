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

    revalidatePath("/quality");
    revalidatePath(`/quality/nodes/${nodeId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityNodeError) return { error: e.message };
    console.error("[submitNodeAction]", e);
    return { error: "提交失败，请稍后重试" };
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
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityReviewError) return { error: e.message };
    console.error("[reviewNodeAction]", e);
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

    revalidatePath("/quality/issues");
    revalidatePath("/quality");
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityIssueError) return { error: e.message };
    console.error("[rectifyIssueAction]", e);
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
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityIssueError) return { error: e.message };
    console.error("[recheckIssueAction]", e);
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
    return { ok: true };
  } catch (e) {
    if (e instanceof QualityIssueError) return { error: e.message };
    console.error("[createIssueAction]", e);
    return { error: "新建问题失败，请稍后重试" };
  }
}
