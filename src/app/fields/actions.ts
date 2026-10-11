"use server";

import { revalidatePath } from "next/cache";
import {
  createDef,
  deleteDef,
  reorderDefs,
  setDefActive,
  updateDef,
  CustomFieldError,
  type DefInput,
} from "@/core/domain/customFieldRepo";

/**
 * 自定义字段定义的 Server Actions（M9-c）。路由层薄：只收 FormData、调 core 服务、
 * revalidate；一切校验口径在 `core/domain/customField{,Repo}` 单点。
 */

export interface FieldFormState {
  error?: string;
  ok?: boolean;
  /** 刚保存的定义 id（新建成功后前端据此关弹窗；编辑保留原 id） */
  id?: string;
}

const EMPTY: FieldFormState = {};

/** 从 FormData 收一份定义入参（服务端仍逐条强校验，这里只做搬运）。 */
function readDefInput(formData: FormData): DefInput {
  return {
    key: String(formData.get("key") ?? ""),
    label: String(formData.get("label") ?? ""),
    type: String(formData.get("type") ?? ""),
    optionsRaw: String(formData.get("optionsRaw") ?? ""),
    required: formData.get("required") === "on",
    active: formData.get("active") === null ? true : formData.get("active") === "on",
  };
}

/** 定义列表页与项目列表都要刷新（字段改了，录入与筛选面立刻跟着变）。
 *  项目详情是 force-dynamic，导航过去就是新数据，不必逐个 revalidate。 */
function revalidateFieldSurfaces(): void {
  revalidatePath("/fields");
  revalidatePath("/projects");
}

export async function createFieldAction(
  _prev: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  try {
    const created = await createDef(readDefInput(formData));
    revalidateFieldSurfaces();
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    console.error("[createFieldAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/**
 * 新建或保存定义（一个入口搞定：表单带隐藏 `id`，空＝新建）。
 * 比"两个 action + bind"更省事，也避免编辑/新建两套校验漂移。
 */
export async function saveFieldAction(
  _prev: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const input = readDefInput(formData);
  try {
    if (id === "") {
      const created = await createDef(input);
      revalidateFieldSurfaces();
      return { ok: true, id: created.id };
    }
    // key/type 不从表单取 → 编辑态天然不可改（服务端 updateDef 也会拒）
    await updateDef(id, {
      label: input.label,
      optionsRaw: input.optionsRaw,
      required: input.required,
      active: input.active,
    });
    revalidateFieldSurfaces();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    console.error("[saveFieldAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

export async function updateFieldAction(
  id: string,
  _prev: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  try {
    const input = readDefInput(formData);
    // 编辑态 key/type 由服务端从库里取回，表单不提交这两项 → 天然不可改
    await updateDef(id, {
      label: input.label,
      optionsRaw: input.optionsRaw,
      required: input.required,
      active: input.active,
    });
    revalidateFieldSurfaces();
    return { ok: true, id };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    console.error("[updateFieldAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

export async function deleteFieldAction(
  id: string,
  _prev: FieldFormState,
  _formData?: FormData,
): Promise<FieldFormState> {
  try {
    await deleteDef(id);
    revalidateFieldSurfaces();
    return { ok: true };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    console.error("[deleteFieldAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 停用 / 启用（停用＝不进录入、不进筛选，历史值原样保留）。 */
export async function toggleFieldActiveAction(
  id: string,
  nextActive: boolean,
  _prev?: FieldFormState,
): Promise<FieldFormState> {
  try {
    await setDefActive(id, nextActive);
    revalidateFieldSurfaces();
    return { ok: true };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    console.error("[toggleFieldActiveAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 整表调序：入参是新的 id 顺序（服务端校验集合恰等，防半截提交）。 */
export async function reorderFieldsAction(
  _prev: FieldFormState,
  formData: FormData,
): Promise<FieldFormState> {
  try {
    const ids = String(formData.get("order") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    await reorderDefs(ids);
    revalidateFieldSurfaces();
    return { ok: true };
  } catch (e) {
    if (e instanceof CustomFieldError) return { error: e.message };
    console.error("[reorderFieldsAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

export { EMPTY as EMPTY_FIELD_STATE };
