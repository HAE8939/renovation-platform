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
import {
  ChangeOrderError,
  createChange,
  deleteChange,
  updateChange,
  type ChangeInput,
} from "@/modules/budget/server/changes";
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation, moneyText, diffText } from "@/core/domain/operationLog";
import prisma from "@/core/db";

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
    await recordOperation({
      action: "project.create",
      entity: "project",
      entityId: id,
      projectId: id,
      summary: `新建项目「${text("name")}」（编号 ${text("code") || "自动"}）`,
      after: `面积 ${area}㎡`,
    });
    return { ok: true, projectId: id };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    logAppError("[createProjectAction]", e);
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

    const before = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, code: true, area: true, status: true, contractAmount: true, designer: true, pm: true, address: true, startDate: true, endDate: true },
    });
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
    if (before) {
      const changed = diffText([
        ["名称", before.name, text("name")],
        ["编号", before.code, text("code")],
        ["面积", before.area, area],
        ["状态", before.status, text("status")],
        ["合同额", before.contractAmount, contractAmount],
        ["设计师", before.designer, text("designer")],
        ["项目经理", before.pm, text("pm")],
        ["工期起", before.startDate, String(formData.get("startDate") ?? "")],
        ["工期止", before.endDate, String(formData.get("endDate") ?? "")],
      ]);
      if (changed !== "（无字段变化）") {
        await recordOperation({
          action: "project.update",
          entity: "project",
          entityId: projectId,
          projectId,
          summary: `改项目基础信息：${changed}`,
          before: `合同额 ${moneyText(before.contractAmount)} · 面积 ${before.area}㎡ · 状态 ${before.status}`,
          after: `合同额 ${moneyText(contractAmount ?? before.contractAmount)} · 面积 ${area}㎡`,
        });
      }
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    logAppError("[updateProjectAction]", e);
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

async function runCatalogWrite(
  task: () => Promise<unknown>,
  audit?: { action: string; summary: string; entityId?: string; before?: string; after?: string },
): Promise<CatalogFormState> {
  try {
    await task();
    revalidatePath(CATALOG_PATH);
    if (audit) {
      await recordOperation({
        action: audit.action,
        entity: audit.action.includes(".category.") ? "catalogCategory" : "catalogItem",
        entityId: audit.entityId ?? null,
        summary: audit.summary,
        before: audit.before ?? null,
        after: audit.after ?? null,
      });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    logAppError("[catalogAction]", e);
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
  return runCatalogWrite(() => createCategory(name), { action: "catalog.category.create", summary: `新增科目「${name}」`, after: name });
}

/** 重命名科目。 */
export async function updateCategoryAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  return runCatalogWrite(() => updateCategory(id, name), { action: "catalog.category.rename", entityId: id, summary: `科目改名 → 「${name}」`, after: name });
}

/** 删除科目，连带删掉其下科目项；已生成的报价是快照，不受影响。 */
export async function deleteCategoryAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const cat = await prisma.catalogCategory.findUnique({ where: { id }, select: { name: true, items: { select: { id: true } } } });
  return runCatalogWrite(() => deleteCategory(id), {
    action: "catalog.category.delete",
    entityId: id,
    summary: `删除科目「${cat?.name ?? id}」${cat ? `（连带删 ${cat.items.length} 个科目项）` : ""}`,
    before: cat?.name ?? undefined,
  });
}

/** 按 ids 顺序重排科目；界面提交全部顺序，避免残留行乱序。 */
export async function reorderCategoriesAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const ids = Array.isArray(formData.getAll("ids"))
    ? (formData.getAll("ids") as string[]).filter((v) => typeof v === "string" && v !== "")
    : [];
  return runCatalogWrite(() => setCategoryOrder(ids), { action: "catalog.category.reorder", summary: `调整科目顺序（共 ${ids.length} 个）` });
}

/** 在某科目下新增科目项。 */
export async function createItemAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const it = readItemInput(formData);
  return runCatalogWrite(() => createItem(categoryId, it), {
    action: "catalog.item.create",
    entityId: categoryId,
    summary: `新增科目项 ${it.code}「${it.name}」（默认单价 ${moneyText(it.defaultPrice)}/${it.unit}）`,
    after: `${it.code} ${it.name}`,
  });
}

/** 修改科目项模板；已选入报价的明细是快照，不回溯。 */
export async function updateItemAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const it = readItemInput(formData);
  const oldItem = await prisma.catalogItem.findUnique({ where: { id }, select: { code: true, name: true, defaultPrice: true } });
  return runCatalogWrite(() => updateItem(id, it), {
    action: "catalog.item.update",
    entityId: id,
    summary: `改科目项 ${it.code}「${it.name}」：${diffText([["默认单价", oldItem?.defaultPrice, it.defaultPrice], ["名称", oldItem?.name, it.name], ["编号", oldItem?.code, it.code]])}`,
    before: oldItem ? `${oldItem.code} 单价 ${moneyText(oldItem.defaultPrice)}` : undefined,
    after: `${it.code} 单价 ${moneyText(it.defaultPrice)}`,
  });
}

/** 删除科目项。 */
export async function deleteItemAction(
  _prev: CatalogFormState,
  formData: FormData
): Promise<CatalogFormState> {
  const id = String(formData.get("id") ?? "").trim();
  const oldItem = await prisma.catalogItem.findUnique({ where: { id }, select: { code: true, name: true } });
  return runCatalogWrite(() => deleteItem(id), {
    action: "catalog.item.delete",
    entityId: id,
    summary: `删除科目项 ${oldItem ? `${oldItem.code}「${oldItem.name}」` : id}`,
    before: oldItem?.name ?? undefined,
  });
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
  return runCatalogWrite(() => setItemOrder(categoryId, ids), { action: "catalog.item.reorder", summary: `调整科目项顺序（${ids.length} 项）` });
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
    const beforeCount = await prisma.quoteItem.count({ where: { quote: { projectId } } });
    const saved = await saveQuoteItems(projectId, rows);
    revalidatePath("/budget");
    revalidatePath(`/budget/${projectId}`);
    const subtotal = saved.reduce((t, r) => t + Math.round(r.unitPrice * 100) * r.quantity, 0) / 100;
    await recordOperation({
      action: "quote.save",
      entity: "quote",
      projectId,
      summary: `保存报价明细：${beforeCount} 行 → ${saved.length} 行，直接费 ${moneyText(subtotal)}`,
      before: `${beforeCount} 行`,
      after: `${saved.length} 行 · 直接费 ${moneyText(subtotal)}`,
    });
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
    logAppError("[saveQuoteItemsAction]", e);
    return { ok: false, error: "保存失败，请稍后重试" };
  }
}

/* ── 变更单（M9-a，useFormState 模式）──────────────────────────
   projectId / changeId 经 bind 传入；FormData 取 kind/title/amount/date/note。
   revalidatePath 三处：变更单页 + 报价单页 + 项目中心（毛利/预算灯读 changeTotal）。
   ── */

export interface ChangeFormState {
  error?: string;
  ok?: boolean;
}

/** 从 FormData 构造 ChangeInput（amount 用 Number(...) 让服务层做 isFinite 校验）。 */
function readChangeInput(formData: FormData): ChangeInput {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    kind: text("kind"),
    title: text("title"),
    amount: Number(formData.get("amount")),
    dateIso: text("date"),
    note: text("note"),
  };
}

/** 新建变更单：createChange(projectId, input)。 */
export async function createChangeAction(
  projectId: string,
  _prev: ChangeFormState,
  formData: FormData
): Promise<ChangeFormState> {
  try {
    const ci = readChangeInput(formData);
    await createChange(projectId, ci);
    await recordOperation({
      action: "change.create",
      entity: "changeOrder",
      projectId,
      summary: `新建变更单「${ci.title}」 ${ci.amount >= 0 ? "+" : ""}${moneyText(ci.amount)}`,
      after: `${ci.kind} ${moneyText(ci.amount)}`,
    });
    revalidatePath(`/budget/${projectId}/changes`);
    revalidatePath(`/budget/${projectId}`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ChangeOrderError) return { error: e.message };
    logAppError("[createChangeAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 编辑变更单：updateChange(changeId, projectId, input)。 */
export async function updateChangeAction(
  projectId: string,
  changeId: string,
  _prev: ChangeFormState,
  formData: FormData
): Promise<ChangeFormState> {
  try {
    const oldChange = await prisma.changeOrder.findUnique({ where: { id: changeId }, select: { title: true, amount: true, kind: true } });
    const ci = readChangeInput(formData);
    await updateChange(changeId, projectId, ci);
    await recordOperation({
      action: "change.update",
      entity: "changeOrder",
      entityId: changeId,
      projectId,
      summary: `改变更单：${diffText([["描述", oldChange?.title, ci.title], ["金额", oldChange?.amount, ci.amount], ["类型", oldChange?.kind, ci.kind]])}`,
      before: oldChange ? `${oldChange.title} ${moneyText(oldChange.amount)}` : undefined,
      after: `${ci.title} ${moneyText(ci.amount)}`,
    });
    revalidatePath(`/budget/${projectId}/changes`);
    revalidatePath(`/budget/${projectId}`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ChangeOrderError) return { error: e.message };
    logAppError("[updateChangeAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/** 删除变更单：deleteChange(changeId)。 */
export async function deleteChangeAction(
  projectId: string,
  changeId: string,
  _prev: ChangeFormState,
  _formData: FormData
): Promise<ChangeFormState> {
  try {
    const oldChange = await prisma.changeOrder.findUnique({ where: { id: changeId }, select: { title: true, amount: true } });
    await deleteChange(changeId);
    await recordOperation({
      action: "change.delete",
      entity: "changeOrder",
      entityId: changeId,
      projectId,
      summary: `删除变更单「${oldChange?.title ?? changeId}」${oldChange ? `（${moneyText(oldChange.amount)}）` : ""}`,
      before: oldChange ? `${oldChange.title} ${moneyText(oldChange.amount)}` : undefined,
    });
    revalidatePath(`/budget/${projectId}/changes`);
    revalidatePath(`/budget/${projectId}`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ChangeOrderError) return { error: e.message };
    logAppError("[deleteChangeAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}
