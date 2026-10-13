"use server";

import { revalidatePath } from "next/cache";
import {
  advanceStage,
  addFollowUp,
  createLead,
  getLeadDetail,
  signLead,
  setLeadArchived,
  LeadValidationError,
  type LeadStage,
} from "./server/leads";
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation, moneyText } from "@/core/domain/operationLog";
import prisma from "@/core/db";

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
    await recordOperation({
      action: "lead.create",
      entity: "lead",
      summary: `新建线索「${text("name")}」${text("estate") ? ` · ${text("estate")}` : ""}`,
      after: `阶段 线索 · 意向 ${text("budgetRange") || "未填"}`,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof LeadValidationError) return { error: e.message };
    logAppError("[createLeadAction]", e);
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
    const leadOld = await prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true, name: true, projectId: true } });
    await advanceStage(leadId, stage);
    await recordOperation({
      action: "lead.advance",
      entity: "lead",
      entityId: leadId,
      projectId: leadOld?.projectId ?? null,
      summary: `线索「${leadOld?.name ?? leadId}」阶段推进 ${leadOld?.stage ?? "?"} → ${stage}`,
      before: leadOld?.stage ?? null,
      after: stage,
    });
    revalidatePath("/crm");
    return {};
  } catch (e) {
    revalidatePath("/crm");
    if (e instanceof LeadValidationError) return { error: e.message };
    logAppError("[advanceStageAction]", e);
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

    const leadForSign = await prisma.lead.findUnique({ where: { id: leadId }, select: { name: true, phone: true } });
    const result = await signLead(leadId, {
      contractAmount,
      designer: text("designer") || undefined,
      pm: text("pm") || undefined,
      startDate: text("startDate") || undefined,
    });

    revalidatePath("/crm");
    revalidatePath("/budget");
    const signedProject = await prisma.project.findUnique({
      where: { id: result.projectId },
      select: { code: true, name: true, contractAmount: true, client: { select: { name: true } } },
    }).catch(() => null);
    await recordOperation({
      action: "lead.sign",
      entity: "lead",
      entityId: leadId,
      projectId: result.projectId,
      summary: `签约建项「${leadForSign?.name ?? leadId}」→ ${signedProject ? `${signedProject.code} ${signedProject.name}` : result.projectId}，合同额 ${moneyText(Number(formData.get("contractAmount")))}`,
      before: leadForSign ? `线索阶段 quoted · 电话 ${leadForSign.phone ?? "未填"}` : null,
      after: signedProject ? `项目 ${signedProject.code} · 客户 ${signedProject.client?.name ?? ""}` : null,
    });
    return { ok: true, projectId: result.projectId };
  } catch (e) {
    if (e instanceof LeadValidationError) return { error: e.message };
    logAppError("[signLeadAction]", e);
    return { error: "签约失败，请稍后重试" };
  }
}

/** 取线索详情（供客户端抽屉打开时拉取跟进时间线）。返回数据为可序列化结构。 */
export async function getLeadDetailAction(leadId: string) {
  try {
    return await getLeadDetail(leadId);
  } catch (e) {
    logAppError("[getLeadDetailAction]", e);
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
    logAppError("[addFollowUpAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

/**
 * 作废 / 恢复线索（M10-a 备料三）。
 * FormData: leadId + archived("true"|"false")。
 * 业务规则（已签约不许只作废线索）在服务层 setLeadArchived 里，这里只搬运 + 写流水。
 */
export async function archiveLeadAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const leadId = String(formData.get("leadId") ?? "").trim();
  const archived = String(formData.get("archived") ?? "") === "true";
  if (!leadId) return { error: "缺少线索标识，请刷新页面后重试" };
  try {
    const r = await setLeadArchived(leadId, archived);
    if ("error" in r) return { error: r.error };
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { name: true, code: true, stage: true, projectId: true },
    });
    revalidatePath("/crm");
    revalidatePath("/dashboard");
    await recordOperation({
      action: archived ? "lead.archive" : "lead.restore",
      entity: "lead",
      entityId: leadId,
      projectId: lead?.projectId ?? null,
      summary: `${archived ? "作废" : "恢复"}线索「${lead?.name ?? leadId}」（${lead?.code ?? ""}）`,
      before: archived ? `阶段 ${lead?.stage ?? "?"}` : "已作废",
      after: archived ? "已作废（不进漏斗与看板）" : `阶段 ${lead?.stage ?? "?"}`,
    });
    return { ok: true };
  } catch (e) {
    logAppError("[archiveLeadAction]", e, { leadId });
    return { error: "操作失败，请稍后重试" };
  }
}
