import prisma from "@/core/db";
import { ValidationError } from "./projects";

/**
 * 科目库数据访问层：工程科目（CatalogCategory）与科目项模板（CatalogItem）。
 *
 * 快照语义（AGENTS §5）：报价明细 QuoteItem 存的是模板字段的快照，与这两张表
 * 没有外键关系。所以本层所有写操作只改模板本身 —— 既不需要、也绝不能回写
 * 已生成的报价明细。金额口径也不在此层，统一走 modules/budget/lib/quote.ts。
 *
 * 数据量级很小（几十到几百项），搜索放在界面层做即时过滤，本层只负责全量读。
 */

/* ── 类型 ───────────────────────────────────────────────────── */

export interface CatalogItemRow {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  unit: string;
  defaultPrice: number;
  defaultQty: number;
  materials: string;
  /** 施工要求，多行按 \n 分隔（与 QuoteItem.sop 同一约定） */
  sop: string;
  order: number;
}

export interface CatalogCategoryRow {
  id: string;
  name: string;
  order: number;
  items: CatalogItemRow[];
}

/** 科目项的表单输入（新建与编辑共用）。 */
export interface CatalogItemInput {
  code: string;
  name: string;
  unit: string;
  defaultPrice: number;
  defaultQty: number;
  materials: string;
  sop: string;
}

/** 科目项被选入报价时的快照字段 —— 与 QuoteItem 的口径一一对应。 */
export interface CatalogSnapshot {
  id: string;
  code: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  materials: string;
  sop: string;
}

/** 报价编辑器「从科目库选入」下拉框的数据。 */
export interface CatalogPickerCategory {
  id: string;
  name: string;
  items: CatalogSnapshot[];
}

/* ── 读取 ───────────────────────────────────────────────────── */

type ItemRecord = CatalogItemRow;

export async function listCatalog(): Promise<CatalogCategoryRow[]> {
  const [categories, items] = await Promise.all([
    prisma.catalogCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.catalogItem.findMany({ orderBy: { order: "asc" } }),
  ]);

  const grouped = new Map<string, ItemRecord[]>();
  for (const row of items) {
    const bucket = grouped.get(row.categoryId) ?? [];
    bucket.push(row);
    grouped.set(row.categoryId, bucket);
  }

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    order: c.order,
    items: grouped.get(c.id) ?? [],
  }));
}

/** 下拉选项清单：只带选入快照需要的字段，减少传到客户端的数据。 */
export async function listCatalogForPicker(): Promise<CatalogPickerCategory[]> {
  const catalog = await listCatalog();
  return catalog.map((c) => ({
    id: c.id,
    name: c.name,
    items: c.items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      unit: i.unit,
      unitPrice: i.defaultPrice,
      quantity: i.defaultQty,
      materials: i.materials,
      sop: i.sop,
    })),
  }));
}

/* ── 科目 ───────────────────────────────────────────────────── */

export async function createCategory(nameRaw: string): Promise<CatalogCategoryRow> {
  const name = requireText(nameRaw, "科目名称");
  const dup = await prisma.catalogCategory.findFirst({ where: { name } });
  if (dup) throw new ValidationError(`科目「${name}」已存在`);

  const maxOrder = await nextOrder(
    (await prisma.catalogCategory.findMany({ select: { order: true } })).map((r) => r.order)
  );
  const created = await prisma.catalogCategory.create({ data: { name, order: maxOrder + 1 } });
  return { id: created.id, name: created.name, order: created.order, items: [] };
}

export async function updateCategory(id: string, nameRaw: string): Promise<void> {
  const name = requireText(nameRaw, "科目名称");
  const dup = await prisma.catalogCategory.findFirst({ where: { name, NOT: { id } } });
  if (dup) throw new ValidationError(`科目「${name}」已存在`);
  await prisma.catalogCategory.update({ where: { id }, data: { name } });
}

/** 删除科目会连带删掉其下科目项；已生成的报价是快照，不受影响。 */
export async function deleteCategory(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.catalogItem.deleteMany({ where: { categoryId: id } });
    await tx.catalogCategory.delete({ where: { id } });
  });
}

export async function setCategoryOrder(ids: string[]): Promise<void> {
  const current = await prisma.catalogCategory.findMany({
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });
  await prisma.$transaction(
    computeOrderUpdates(current, ids).map((u) =>
      prisma.catalogCategory.update({ where: { id: u.id }, data: { order: u.order } })
    )
  );
}

/* ── 科目项 ─────────────────────────────────────────────────── */

export async function createItem(categoryId: string, input: CatalogItemInput): Promise<CatalogItemRow> {
  const { code, name, unit, defaultPrice, defaultQty, materials, sop } = normalizeItemInput(input);

  const dup = await prisma.catalogItem.findFirst({ where: { code } });
  if (dup) throw new ValidationError(`编号 ${code} 已存在，请更换`);
  const category = await prisma.catalogCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw new ValidationError("所属科目不存在");

  const maxOrder = await nextOrder(
    (await prisma.catalogItem.findMany({
      where: { categoryId },
      select: { order: true },
    })).map((r) => r.order)
  );

  return prisma.catalogItem.create({
    data: { categoryId, code, name, unit, defaultPrice, defaultQty, materials, sop, order: maxOrder + 1 },
  });
}

export async function updateItem(id: string, input: CatalogItemInput): Promise<CatalogItemRow> {
  const { code, name, unit, defaultPrice, defaultQty, materials, sop } = normalizeItemInput(input);

  const dup = await prisma.catalogItem.findFirst({ where: { code, NOT: { id } } });
  if (dup) throw new ValidationError(`编号 ${code} 已存在，请更换`);

  return prisma.catalogItem.update({
    where: { id },
    data: { code, name, unit, defaultPrice, defaultQty, materials, sop },
  });
}

export async function deleteItem(id: string): Promise<void> {
  await prisma.catalogItem.delete({ where: { id } });
}

export async function setItemOrder(categoryId: string, ids: string[]): Promise<void> {
  const current = await prisma.catalogItem.findMany({
    where: { categoryId },
    select: { id: true, order: true },
    orderBy: { order: "asc" },
  });
  await prisma.$transaction(
    computeOrderUpdates(current, ids).map((u) =>
      prisma.catalogItem.update({ where: { id: u.id }, data: { order: u.order } })
    )
  );
}

/* ── 内部工具 ───────────────────────────────────────────────── */

function requireText(value: string, label: string): string {
  const v = value.trim();
  if (!v) throw new ValidationError(`请填写${label}`);
  return v;
}

/** 金额与数量：非负、可解析。 */
function positive(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ValidationError(`${label}需为数字`);
  if (value < 0) throw new ValidationError(`${label}不能为负数`);
  return value;
}

/** 表单字段统一清洗：文本去首尾空格，unit 空值回落「项」。 */
function normalizeItemInput(input: CatalogItemInput): Required<Pick<CatalogItemInput, "unit">> & CatalogItemInput {
  return {
    ...input,
    code: requireText(input.code, "编号"),
    name: requireText(input.name, "名称"),
    unit: input.unit.trim() || "项",
    defaultPrice: positive(input.defaultPrice, "默认单价"),
    defaultQty: positive(input.defaultQty, "默认数量"),
    materials: input.materials.trim(),
    sop: input.sop.trim(),
  };
}

async function nextOrder(values: number[]): Promise<number> {
  return values.reduce((max, v) => Math.max(max, v), 0);
}

/**
 * 按给定顺序重排 order：ids 里的按顺序从 1 编号，
 * 未出现的记录保持原有相对顺序排在最后。
 * 这样界面只提交"当前可见的那部分"也不会打乱其余行的次序。
 */
function computeOrderUpdates(
  existing: { id: string; order: number }[],
  ids: string[]
): { id: string; order: number }[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const ordered: { id: string }[] = [];

  for (const id of ids) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push({ id });
  }
  for (const row of existing) {
    if (!seen.has(row.id)) ordered.push({ id: row.id });
  }

  return ordered.map((row, i) => ({ id: row.id, order: i + 1 }));
}
