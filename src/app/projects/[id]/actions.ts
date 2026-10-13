"use server";

import { revalidatePath } from "next/cache";
import { ENTITY_KIND } from "@/core/domain/customField";
import { CustomFieldError, saveEntityValues } from "@/core/domain/customFieldRepo";
import { logAppError } from "@/core/domain/telemetry";

/**
 * 项目「自定义字段」值录入的 Server Action（M9-c）。
 * 路由层薄：只把 FormData 拆成 {fieldId, raw} 交给 core 服务，校验与报错口径全在那边。
 *
 * 表单约定：每个字段的 input 名为 `cfv_<fieldId>`，值一律以字符串提交（数字与日期也是，
 * 由 coerceFieldValue 按定义类型转换）；未出现的 fieldId 视为清空——所以服务端必须
 * 对**全部在用定义**落一行，否则"清空一个框"清不掉。
 */

export interface CustomValuesState {
  error?: string;
  ok?: boolean;
}

const PREFIX = "cfv_";
import { recordOperation } from "@/core/domain/operationLog";
import prisma from "@/core/db";

export async function saveCustomFieldValuesAction(
  projectId: string,
  _prev: CustomValuesState,
  formData: FormData,
): Promise<CustomValuesState> {
  const inputs: { fieldId: string; raw: string }[] = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(PREFIX)) continue;
    inputs.push({ fieldId: name.slice(PREFIX.length), raw: String(value ?? "") });
  }
  try {
    const valsOld = await prisma.customFieldValue.findMany({
      where: { entityKind: ENTITY_KIND.project, entityId: projectId },
      select: { fieldId: true, valueText: true, valueNumber: true, valueDate: true },
    });
    await saveEntityValues(ENTITY_KIND.project, projectId, inputs);
    await recordOperation({
      action: "customValues.save",
      entity: "project",
      entityId: projectId,
      projectId,
      summary: `保存自定义字段值（提交 ${inputs.length} 项 · 原已填 ${valsOld.length} 项，未提交的按清空处理）`,
      before: `${valsOld.length} 项`,
      after: `${inputs.length} 项`,
    });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    return { ok: true };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    logAppError("[saveCustomFieldValuesAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}
