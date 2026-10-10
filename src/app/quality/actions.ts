"use server";

import { revalidatePath } from "next/cache";
import { QualityNodeError, submitNode } from "@/modules/quality/server/nodes";
import { QualityReviewError, reviewNode } from "@/modules/quality/server/review";
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
