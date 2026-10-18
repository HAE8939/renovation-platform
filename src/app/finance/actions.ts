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
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation, moneyText, diffText } from "@/core/domain/operationLog";
import prisma from "@/core/db";

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
    const input = buildInput(formData);
    const rec = await createRecord(input);
    await recordOperation({
      action: "record.create",
      entity: "financeRecord",
      entityId: rec?.id ?? null,
      projectId: input.projectId ?? null,
      summary: `记一笔${input.type === "income" ? "收入" : "支出"} ${moneyText(input.amount)}（${input.category}）：${input.description || "无摘要"}`,
      after: `${input.type}/${input.category} ${moneyText(input.amount)}`,
    });
    revalidatePath("/finance");
    return { ok: true };
  } catch (e) {
    if (e instanceof FinanceRecordError) return { error: e.message };
    logAppError("[createRecordAction]", e);
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

    const oldRec = await prisma.financeRecord.findUnique({ where: { id }, select: { amount: true, type: true, category: true, description: true, projectId: true } });
    const input = buildInput(formData);
    await updateRecord(id, input);
    await recordOperation({
      action: "record.update",
      entity: "financeRecord",
      entityId: id,
      projectId: oldRec?.projectId ?? input.projectId ?? null,
      summary: `改收支记录：${diffText([["金额", oldRec?.amount, input.amount], ["类型", oldRec?.type, input.type], ["科目", oldRec?.category, input.category], ["摘要", oldRec?.description, input.description]])}`,
      before: oldRec ? `${moneyText(oldRec.amount)} ${oldRec.category}` : null,
      after: `${input.type}/${input.category} ${moneyText(input.amount)}`,
    });
    revalidatePath("/finance");
    return { ok: true };
  } catch (e) {
    if (e instanceof FinanceRecordError) return { error: e.message };
    logAppError("[updateRecordAction]", e);
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

    const oldRec = await prisma.financeRecord.findUnique({ where: { id }, select: { amount: true, type: true, category: true, description: true, projectId: true } });
    await deleteRecord(id);
    await recordOperation({
      action: "record.delete",
      entity: "financeRecord",
      entityId: id,
      projectId: oldRec?.projectId ?? null,
      summary: `删除收支记录 ${oldRec ? `${moneyText(oldRec.amount)}（${oldRec.category}）${oldRec.description || ""}` : id}`,
      before: oldRec ? `${oldRec.type} ${moneyText(oldRec.amount)} ${oldRec.description ?? ""}` : null,
    });
    revalidatePath("/finance");
    return { ok: true };
  } catch (e) {
    if (e instanceof FinanceRecordError) return { error: e.message };
    logAppError("[deleteRecordAction]", e);
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
    const plan = await prisma.paymentNode.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { name: true, amountDue: true },
    });
    await recordOperation({
      action: "plan.generate",
      entity: "paymentNode",
      projectId,
      summary: `生成付款计划 ${plan.length} 段，合计 ${moneyText(plan.reduce((t, p) => t + p.amountDue, 0))}`,
      after: plan.map((p) => `${p.name} ${moneyText(p.amountDue)}`).join("；").slice(0, 480),
    });
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    logAppError("[generatePlanAction]", e);
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

    const planOld = await prisma.paymentNode.findMany({ where: { projectId }, select: { name: true, amountDue: true, paid: true } });
    await clearPlan(projectId);
    await recordOperation({
      action: "plan.clear",
      entity: "paymentNode",
      projectId,
      summary: `清空付款计划（原 ${planOld.length} 段，合计 ${moneyText(planOld.reduce((t, p) => t + p.amountDue, 0))}）`,
      before: planOld.map((p) => `${p.name} ${moneyText(p.amountDue)}${p.paid ? " 已付" : ""}`).join("；").slice(0, 480),
    });
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    logAppError("[clearPlanAction]", e);
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

    const seg = await prisma.paymentNode.findUnique({ where: { id }, select: { name: true, amountDue: true, projectId: true } });
    await markPaid(id);
    await recordOperation({
      action: "plan.markPaid",
      entity: "paymentNode",
      entityId: id,
      projectId: seg?.projectId ?? null,
      summary: `标记“${seg?.name ?? id}”已付 ${moneyText(seg?.amountDue)}（不自动生成收入台账，两本账分离）`,
      after: seg ? `${seg.name} ${moneyText(seg.amountDue)}` : null,
    });
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    logAppError("[markPaidAction]", e);
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

    const seg = await prisma.paymentNode.findUnique({ where: { id }, select: { name: true, amountDue: true, projectId: true } });
    await unmarkPaid(id);
    await recordOperation({
      action: "plan.unmarkPaid",
      entity: "paymentNode",
      entityId: id,
      projectId: seg?.projectId ?? null,
      summary: `撤销“${seg?.name ?? id}”的已付标记`,
      before: seg ? `${seg.name} ${moneyText(seg.amountDue)} 已付` : null,
    });
    revalidatePath("/finance/payments");
    return { ok: true };
  } catch (e) {
    if (e instanceof PaymentPlanError) return { error: e.message };
    logAppError("[unmarkPaidAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}
