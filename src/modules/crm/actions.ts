"use server";

import { revalidatePath } from "next/cache";
import {
  advanceStage,
  addFollowUp,
  createLead,
  getLeadDetail,
  signLead,
  LeadValidationError,
  type LeadStage,
} from "./server/leads";

export interface LeadFormState {
  error?: string;
  ok?: boolean;
}

export interface FollowUpFormState {
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

export interface AdvanceStageState {
  error?: string;
}

/**
 * 推进线索阶段（useFormState 模式；leadId/stage 经 bind 传入，M8.5）。
 * 失败：中文文案回传 UI + 仍 revalidate /crm（stale 视图自愈到真值）。
 */
export async function advanceStageAction(
  leadId: string,
  stage: LeadStage,
  _prev: AdvanceStageState,
  _formData: FormData
): Promise<AdvanceStageState> {
  try {
    await advanceStage(leadId, stage);
    revalidatePath("/crm");
    return {};
  } catch (e) {
    revalidatePath("/crm");
    if (e instanceof LeadValidationError) return { error: e.message };
    console.error("[advanceStageAction]", e);
    return { error: "推进失败，请稍后重试" };
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

/** 取线索详情（供客户端抽屉打开时拉取跟进时间线）。返回数据为可序列化结构。 */
export async function getLeadDetailAction(leadId: string) {
  try {
    return await getLeadDetail(leadId);
  } catch (e) {
    console.error("[getLeadDetailAction]", e);
    return null;
  }
}

/**
 * 添加跟进（沿用 useFormState 模式；leadId 经 bind 传入）。
 * 成功后 revalidate /crm，中文错误回显；content 为空服务端兜底回文案。
 */
export async function addFollowUpAction(
  leadId: string,
  _prev: FollowUpFormState,
  formData: FormData
): Promise<FollowUpFormState> {
  try {
    const content = String(formData.get("content") ?? "").trim();
    const nextRaw = String(formData.get("nextFollowAt") ?? "").trim();
    const nextFollowAt = nextRaw ? new Date(nextRaw) : null;
    if (nextFollowAt && Number.isNaN(nextFollowAt.getTime())) {
      return { error: "下次跟进日期格式不正确" };
    }

    await addFollowUp(leadId, { content, nextFollowAt });
    revalidatePath("/crm");
    return { ok: true };
  } catch (e) {
    if (e instanceof LeadValidationError) return { error: e.message };
    console.error("[addFollowUpAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}
