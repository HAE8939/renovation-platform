"use server";

import { revalidatePath } from "next/cache";
import {
  FinanceRecordError,
  createRecord,
  updateRecord,
  deleteRecord,
  type RecordInput,
} from "@/modules/finance/server/records";
import {
  PaymentPlanError,
  generatePlan,
  clearPlan,
  markPaid,
  unmarkPaid,
} from "@/modules/finance/server/payments";

/**
 * 财务管控 Server Action（M8-b，仿 quality/actions.ts）。
 * FormData 入参 → 调服务层 → revalidatePath 刷新；校验失败回中文文案，不 silent fail。
 *
 * amount 用 Number(...) 传原始字符串给服务层做 Number.isFinite 校验，
 * 不在 action 里先 parse 成 NaN 又吞掉（TASK §4-M8-b）。
 */

export interface FinanceFormState {
  error?: string;
  ok?: boolean;
}

/** 从 FormData 取公共字段并构造 RecordInput（amount 传原始数字给服务层校验）。 */
function buildInput(formData: FormData): RecordInput {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    projectId: text("projectId"),
    type: text("type"),
    category: text("category"),
    amount: Number(formData.get("amount")),
    dateIso: text("date"),
    description: text("description"),
  };
}

/** 新建：createRecord(input)。FormData: projectId/type/category/amount/date/description。 */
export async function createRecordAction(
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  try {
    await createRecord(buildInput(formData));
    revalidatePath("/finance");
    return { ok: true };
  } catch (e) {
    if (e instanceof FinanceRecordError) return { error: e.message };
    console.error("[createRecordAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 编辑：updateRecord(id, input)。FormData: id + 同 createRecord 的字段。 */
export async function updateRecordAction(
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { error: "缺少记录标识，请刷新页面后重试" };

    await updateRecord(id, buildInput(formData));
    revalidatePath("/finance");
    return { ok: true };
  } catch (e) {
    if (e instanceof FinanceRecordError) return { error: e.message };
    console.error("[updateRecordAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 删除：deleteRecord(id)。FormData: id。 */
export async function deleteRecordAction(
  _prev: FinanceFormState,
  formData: FormData
): Promise<FinanceFormState> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { error: "缺少记录标识，请刷新页面后重试" };

    await deleteRecord(id);
    revalidatePath("/finance");
    return { ok: true };
  } catch (e) {
    if (e instanceof FinanceRecordError) return { error: e.message };
    console.error("[deleteRecordAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

// ── 付款计划（M8-c）─────────────────────────────────────────────

/** 付款计划 Action 状态（与 FinanceFormState 同形，独立命名便于扩展）。 */
export interface PaymentActionState {
  error?: string;
  ok?: boolean;
}

/** 生成付款计划：generatePlan(projectId)。FormData: projectId。 */
export async function generatePlanAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  try {
    const projectId = String(formData.get("projectId") ?? "").trim();
    if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };

    await generatePlan(projectId);
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    console.error("[generatePlanAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 清空付款计划：clearPlan(projectId)。FormData: projectId。 */
export async function clearPlanAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  try {
    const projectId = String(formData.get("projectId") ?? "").trim();
    if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };

    await clearPlan(projectId);
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    console.error("[clearPlanAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 标记已付：markPaid(id)。FormData: id。 */
export async function markPaidAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { error: "缺少段标识，请刷新页面后重试" };

    await markPaid(id);
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    console.error("[markPaidAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 撤销已付：unmarkPaid(id)。FormData: id。 */
export async function unmarkPaidAction(
  _prev: PaymentActionState,
  formData: FormData
): Promise<PaymentActionState> {
  try {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { error: "缺少段标识，请刷新页面后重试" };

    await unmarkPaid(id);
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    console.error("[unmarkPaidAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}
