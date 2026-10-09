"use server";

import { revalidatePath } from "next/cache";
import {
  advanceStage,
  createLead,
  signLead,
  LeadValidationError,
  type LeadStage,
} from "./server/leads";

export interface LeadFormState {
  error?: string;
  ok?: boolean;
}

export interface SignLeadState {
  error?: string;
  ok?: boolean;
  projectId?: string;
}

/** 新建线索。校验失败回中文文案，不抛到 UI。 */
export async function createLeadAction(
  _prev: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const areaRaw = text("area");
    const area = areaRaw === "" ? 0 : Number(areaRaw);

    await createLead({
      name: text("name"),
      phone: text("phone"),
      estate: text("estate"),
      area,
      assignee: text("assignee"),
    });

    revalidatePath("/crm");
    return { ok: true };
  } catch (e) {
    if (e instanceof LeadValidationError) return { error: e.message };
    console.error("[createLeadAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

/** 推进线索阶段（表单 action，返回 void）。 */
export async function advanceStageAction(
  leadId: string,
  stage: LeadStage
): Promise<void> {
  try {
    await advanceStage(leadId, stage);
    revalidatePath("/crm");
  } catch (e) {
    console.error("[advanceStageAction]", e);
  }
}

/**
 * 签约建项（表单 action，沿用 LeadFormState 的 state 模式）。
 * 入参 leadId 通过 bind 传入；校验失败回中文文案，不抛到 UI。
 * 成功后 revalidate /crm 与 /budget（签约会建出项目，需两处都刷新）。
 */
export async function signLeadAction(
  leadId: string,
  _prev: SignLeadState,
  formData: FormData
): Promise<SignLeadState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();

    const amountRaw = text("contractAmount");
    if (amountRaw === "") return { error: "请填写合同额" };
    const contractAmount = Number(amountRaw);
    if (!Number.isFinite(contractAmount) || contractAmount <= 0) {
      return { error: "合同额需为大于 0 的数字" };
    }

    const result = await signLead(leadId, {
      contractAmount,
      designer: text("designer") || undefined,
      pm: text("pm") || undefined,
      startDate: text("startDate") || undefined,
    });

    revalidatePath("/crm");
    revalidatePath("/budget");
    return { ok: true, projectId: result.projectId };
  } catch (e) {
    if (e instanceof LeadValidationError) return { error: e.message };
    console.error("[signLeadAction]", e);
    return { error: "签约失败，请稍后重试" };
  }
}
