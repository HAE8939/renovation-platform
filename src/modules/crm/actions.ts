"use server";

import { revalidatePath } from "next/cache";
import {
  advanceStage,
  createLead,
  LeadValidationError,
  type LeadStage,
} from "./server/leads";

export interface LeadFormState {
  error?: string;
  ok?: boolean;
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
