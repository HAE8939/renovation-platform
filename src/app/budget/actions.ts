"use server";

import { revalidatePath } from "next/cache";
import type { QuoteItemRow } from "@/modules/budget/types";
import { createProject, updateProject, ValidationError } from "@/core/domain/projects";
import { saveQuoteItems, type QuoteItemPayload } from "@/modules/budget/server/quote";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  setCategoryOrder,
  setItemOrder,
  updateCategory,
  updateItem,
  type CatalogItemInput,
} from "@/modules/budget/server/catalog";

/** Server Action 表单状态：客户端用 useFormState 读回。 */
export interface ProjectFormState {
  error?: string;
  ok?: boolean;
  projectId?: string;
}

/** 新建项目。校验失败返回 error 文案，不抛到 UI。 */
export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const areaRaw = text("area");
    const area = areaRaw === "" ? 0 : Number(areaRaw);

    const { id } = await createProject({
      name: text("name"),
      code: text("code"),
      clientName: text("clientName"),
      area,
      address: text("address"),
      designer: text("designer"),
      pm: text("pm"),
    });

    revalidatePath("/budget");
    return { ok: true, projectId: id };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    console.error("[createProjectAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

/** 编辑项目基础信息。projectId 由路由层绑定；校验失败回中文文案。 */
export async function updateProjectAction(
  projectId: string,
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  try {
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const areaRaw = text("area");
    const area = areaRaw === "" ? 0 : Number(areaRaw);
    // 合同额：留空 = 未传（updateProject 不改此列）；否则透传数值。
    const contractAmountRaw = text("contractAmount");
    const contractAmount =
      contractAmountRaw === "" ? undefined : Number(contractAmountRaw);

    await updateProject(projectId, {
      name: text("name"),
      code: text("code"),
      clientName: text("clientName"),
      clientPhone: text("clientPhone"),
      area,
      address: text("address"),
      designer: text("designer"),
      pm: text("pm"),
      status: text("status") || undefined,
      startDate: String(formData.get("startDate") ?? "") || null,
      endDate: String(formData.get("endDate") ?? "") || null,
      contractAmount,
    });

    revalidatePath(`/budget/${projectId}`);
    revalidatePath(`/budget/${projectId}/settings`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    console.error("[updateProjectAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

/* ── 科目库（catalog）──────────────────────────────────────────
   与 createProjectAction 同构：校验失败回文案，不抛到 UI。
   科目库是跨项目共享的模板，写操作后只刷新 /budget/catalog。
   ── */

export interface CatalogFormState {
  error?: string;
  ok?: boolean;
}

const CATALOG_PATH = "/budget/catalog";

async function runCatalogWrite(task: () => Promise<unknown>): Promise<CatalogFormState> {
  try {
    await task();
    revalidatePath(CATALOG_PATH);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    console.error("[catalogAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

/** 科目项表单 → CatalogItemInput；清洗在服务端 normalizeItemInput 再兜一遍。 */
function readItemInput(formData: FormData): CatalogItemInput {
  const num = (key: string): number => {
    const raw = String(formData.get(key) ?? "").trim();
    if (raw === "") return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    unit: String(formData.get("unit") ?? "").trim(),
    defaultPrice: num("defaultPrice"),
    defaultQty: num("defaultQty"),
    materials: String(formData.get("materials") ?? "").trim(),
    sop: String(formData.get("sop") ?? "").trim(),
  };
}

/** 新建科目。 */
export async function createCategoryAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const name = String(formData.get("name") ?? "").trim();
  return runCatalogWrite(() => createCategory(name));
}

/** 重命名科目。 */
export async function updateCategoryAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  return runCatalogWrite(() => updateCategory(id, name));
}

/** 删除科目，连带删掉其下科目项；已生成的报价是快照，不受影响。 */
export async function deleteCategoryAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  return runCatalogWrite(() => deleteCategory(id));
}

/** 按 ids 顺序重排科目；界面提交全部顺序，避免残留行乱序。 */
export async function reorderCategoriesAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const ids = Array.isArray(formData.getAll("ids"))
    ? (formData.getAll("ids") as string[]).filter((v) => typeof v === "string" && v !== "")
    : [];
  return runCatalogWrite(() => setCategoryOrder(ids));
}

/** 在某科目下新增科目项。 */
export async function createItemAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  return runCatalogWrite(() => createItem(categoryId, readItemInput(formData)));
}

/** 修改科目项模板；已选入报价的明细是快照，不回溯。 */
export async function updateItemAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  return runCatalogWrite(() => updateItem(id, readItemInput(formData)));
}

/** 删除科目项。 */
export async function deleteItemAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  return runCatalogWrite(() => deleteItem(id));
}

/** 在科目内按 ids 顺序重排科目项。 */
export async function setItemOrderAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const ids = Array.isArray(formData.getAll("ids"))
    ? (formData.getAll("ids") as string[]).filter((v) => typeof v === "string" && v !== "")
    : [];
  return runCatalogWrite(() => setItemOrder(categoryId, ids));
}

/* ── 报价明细（quote）──────────────────────────────────────────
   整表替换：界面提交当前全部行，服务端单事务删插并按顺序重编号。
   返回落库后的行给界面直接替换本地草稿 —— id 与 order 都会重分配，
   旧 id 不能留在客户端 state 里（React key 也要跟着换）。
   ── */

export interface QuoteSaveState {
  ok: boolean;
  error?: string;
  items?: QuoteItemRow[];
}

export async function saveQuoteItemsAction(
  projectId: string,
  rows: QuoteItemPayload[]
): Promise<QuoteSaveState> {
  try {
    const saved = await saveQuoteItems(projectId, rows);
    revalidatePath("/budget");
    revalidatePath(`/budget/${projectId}`);
    return {
      ok: true,
      items: saved.map((r) => ({
        id: r.id,
        categoryName: r.categoryName,
        code: r.code,
        name: r.name,
        unit: r.unit,
        unitPrice: r.unitPrice,
        quantity: r.quantity,
        materials: r.materials,
        sop: r.sop,
        order: r.order,
      })),
    };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    console.error("[saveQuoteItemsAction]", e);
    return { ok: false, error: "保存失败，请稍后重试" };
  }
}
