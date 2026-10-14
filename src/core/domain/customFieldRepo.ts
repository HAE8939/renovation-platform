import prisma from "@/core/db";
import {
  buildValueWhere,
  ENTITY_KIND,
  formatFieldValue,
  isEntityKind,
  isFieldType,
  parseFilterParam,
  parseOptions,
  coerceFieldValue,
  requiredEmptyError,
  validateFieldKey,
  valueToFormInput,
  type FieldType,
  type FilterInput,
  type ValueColumns,
} from "@/core/domain/customField";

/**
 * 自定义字段（EAV）读写服务 —— 落 `core/domain` 而非 `modules/fields/server`。
 *
 * 为什么：值录入面在项目中心（projects 模块）、定义管理面在平台设置、筛选面在
 * projects 列表——三处都要用。AGENTS §2/§3：模块之间不互相 import 内部，只通过 core
 * 协作；所以这是**平台能力**，不属于任何业务模块。
 *
 * 纪律（照 M8-b 台账 / M9-a 变更单同族）：纯输入校验全部在开事务之前，存在性检查放
 * 事务内；错误类 `CustomFieldError` 的 message 是中文、直达 UI；跨模块只 prisma 直读。
 */
export class CustomFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomFieldError";
  }
}

/** 定义行视图模型（UI 直接消费；options 已从「每行一个」的存储文本清洗成数组）。 */
export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  /** 视图模型里是数组（DB 存按行文本）；非 select 恒为 [] */
  options: string[];
  required: boolean;
  active: boolean;
  order: number;
  /** 仅 listDefs({ includeValueCount }) 路径填 */
  valueCount?: number;
}

/** 一条「定义 + 该实体的值」：值录入表单与详情展示共用，展示串由纯函数算。 */
export interface EntityFieldValue {
  def: FieldDef;
  columns: ValueColumns;
  formInput: string;
  display: string;
}

/** 新建/编辑入参（都是表单原始串，清洗与校验在服务内做）。 */
export interface DefInput {
  key: string;
  label: string;
  type: string;
  /** 每行一个选项（textarea 原文）；非 select 忽略 */
  optionsRaw?: string;
  required?: boolean;
  active?: boolean;
}

type DefRow = {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string | null;
  required: boolean;
  active: boolean;
  order: number;
};

/** prisma 行 → 视图模型。脏 type（不在五值内）宁可炸，也不让页面渲染出无法录入的字段。 */
function toDef(row: DefRow): FieldDef {
  if (!isFieldType(row.type)) {
    throw new CustomFieldError(`未知字段类型：${row.type}`);
  }
  const type = row.type as FieldType;
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type,
    // 选项存储形态＝每行一个的纯文本；非 select 一律给空数组
    options: type === "select" ? parseOptions(row.options ?? "") : [],
    required: row.required,
    active: row.active,
    order: row.order,
  };
}

/** 新建/编辑时的公共清洗：返回可直接落库的字段（校验不过就抛中文错）。 */
function normalizeDefInput(input: DefInput): {
  key: string;
  label: string;
  type: FieldType;
  options: string;
  required: boolean;
  active: boolean;
} {
  const label = (input.label ?? "").trim();
  if (label === "") throw new CustomFieldError("字段名称不能为空");
  const key = (input.key ?? "").trim();
  const keyErr = validateFieldKey(key);
  if (keyErr) throw new CustomFieldError(keyErr);
  if (!isFieldType(input.type)) {
    throw new CustomFieldError(`未知字段类型：${input.type ?? ""}`);
  }
  const type = input.type as FieldType;
  let options = "";
  if (type === "select") {
    const parsed = parseOptions(input.optionsRaw ?? "");
    if (parsed.length === 0) throw new CustomFieldError(`「${label}」的选项不能为空`);
    options = parsed.join("\n");
  }
  return {
    key,
    label,
    type,
    options,
    required: input.required === true,
    active: input.active === undefined ? true : input.active === true,
  };
}

/** 定义列表。默认只给在用（active）的；`includeValueCount` 时一次 groupBy 拼计数（禁 N+1）。 */
export async function listDefs(opts?: {
  includeInactive?: boolean;
  includeValueCount?: boolean;
}): Promise<FieldDef[]> {
  const rows = (await prisma.customFieldDef.findMany({
    where: opts?.includeInactive ? {} : { active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      key: true,
      label: true,
      type: true,
      options: true,
      required: true,
      active: true,
      order: true,
    },
  })) as DefRow[];

  const defs = rows.map(toDef);
  if (!opts?.includeValueCount) return defs;

  const grouped = await prisma.customFieldValue.groupBy({
    by: ["fieldId"],
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g.fieldId, g._count._all]));
  return defs.map((d) => ({ ...d, valueCount: counts.get(d.id) ?? 0 }));
}

export async function getDef(id: string): Promise<FieldDef | null> {
  const row = (await prisma.customFieldDef.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      label: true,
      type: true,
      options: true,
      required: true,
      active: true,
      order: true,
    },
  })) as DefRow | null;
  return row ? toDef(row) : null;
}

export async function createDef(input: DefInput): Promise<FieldDef> {
  const data = normalizeDefInput(input);
  const dup = await prisma.customFieldDef.findUnique({
    where: { key: data.key },
    select: { id: true },
  });
  if (dup) throw new CustomFieldError(`字段标识「${data.key}」已存在`);

  const max = await prisma.customFieldDef.aggregate({ _max: { order: true } });
  const order = (max._max.order ?? -1) + 1;

  try {
    const created = await prisma.customFieldDef.create({
      data: { ...data, order },
      select: {
        id: true,
        key: true,
        label: true,
        type: true,
        options: true,
        required: true,
        active: true,
        order: true,
      },
    });
    return toDef(created as DefRow);
  } catch (e) {
    // 并发下 findUnique 与 create 之间的窗口：P2002 兜底成同一句中文
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002") {
      throw new CustomFieldError(`字段标识「${data.key}」已存在`);
    }
    throw e;
  }
}

/**
 * 编辑定义。**key 与 type 创建后不可改**——改了历史值所在的列语义就漂了（数字值会躺在
 * valueText 里、日期会变成字符串比较）。改选项时**不回溯校验既有值**：与"报价明细快照"
 * 同源思路，改选项不该动历史数据。
 */
export async function updateDef(
  id: string,
  input: Partial<DefInput> & { key?: string; type?: string },
): Promise<FieldDef> {
  const existing = (await prisma.customFieldDef.findUnique({
    where: { id },
    select: {
      id: true,
      key: true,
      label: true,
      type: true,
      options: true,
      required: true,
      active: true,
      order: true,
    },
  })) as DefRow | null;
  if (!existing) throw new CustomFieldError("字段定义不存在");

  if (input.key !== undefined && input.key.trim() !== existing.key) {
    throw new CustomFieldError("字段标识与类型创建后不可修改");
  }
  if (input.type !== undefined && input.type !== existing.type) {
    throw new CustomFieldError("字段标识与类型创建后不可修改");
  }

  const data = normalizeDefInput({
    key: existing.key,
    label: input.label ?? existing.label,
    type: existing.type,
    optionsRaw: input.optionsRaw,
    required: input.required ?? existing.required,
    active: input.active ?? existing.active,
  });
  // optionsRaw 未提交时（例如只改名称）保留原选项，避免把 select 的选项清空
  const options = input.optionsRaw === undefined ? existing.options ?? "" : data.options;
  if (existing.type === "select" && parseOptions(options).length === 0) {
    throw new CustomFieldError(`「${data.label}」的选项不能为空`);
  }

  const updated = await prisma.customFieldDef.update({
    where: { id },
    data: { label: data.label, options, required: data.required, active: data.active },
    select: {
      id: true,
      key: true,
      label: true,
      type: true,
      options: true,
      required: true,
      active: true,
      order: true,
    },
  });
  return toDef(updated as DefRow);
}

export async function setDefActive(id: string, active: boolean): Promise<void> {
  const r = await prisma.customFieldDef.updateMany({ where: { id }, data: { active } });
  if (r.count === 0) throw new CustomFieldError("字段定义不存在");
}

/**
 * 硬删定义。**两步都写**：先显式删值再删定义——`onDelete: Cascade` 在 SQLite 上依赖
 * `PRAGMA foreign_keys`，不显式删会出现"定义没了、值还在"的孤儿行（单用户无回收站，
 * 与 M8-b 台账 / M9-a 变更单同口径）。
 */
export async function deleteDef(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.customFieldValue.deleteMany({ where: { fieldId: id } }),
    prisma.customFieldDef.deleteMany({ where: { id } }),
  ]);
  const left = await prisma.customFieldDef.count({ where: { id } });
  if (left === 0) return;
  throw new CustomFieldError("字段定义不存在");
}

/** 整表调序：先校验 id 集合恰等现有集（照 M6-d 模板库「先全量预校验再写」），再批量写 order。 */
export async function reorderDefs(orderedIds: string[]): Promise<void> {
  const ids = orderedIds.map((s) => String(s));
  const existing = await prisma.customFieldDef.findMany({ select: { id: true } });
  const existingIds = existing.map((e) => e.id);
  const sameSet =
    ids.length === existingIds.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => existingIds.includes(id));
  if (!sameSet) {
    throw new CustomFieldError("排序提交不完整或含未知字段，请刷新后重试");
  }
  await prisma.$transaction(
    ids.map((id, index) => prisma.customFieldDef.update({ where: { id }, data: { order: index } })),
  );
}

/** 某实体的字段值（只含 active 定义，按 order）。两次查询拼好，禁 N+1。 */
export async function getEntityValues(
  entityKind: string,
  entityId: string,
): Promise<EntityFieldValue[]> {
  if (!isEntityKind(entityKind)) throw new CustomFieldError(`未知实体类型：${entityKind}`);
  const defs = await listDefs();
  if (defs.length === 0) return [];
  const rows = await prisma.customFieldValue.findMany({
    where: { entityKind, entityId },
    select: { fieldId: true, valueText: true, valueNumber: true, valueDate: true },
  });
  const byField = new Map(rows.map((r) => [r.fieldId, r]));
  return defs.map((def) => {
    const row = byField.get(def.id) ?? null;
    const columns: ValueColumns = {
      valueText: row?.valueText ?? null,
      valueNumber: row?.valueNumber ?? null,
      valueDate: row?.valueDate ?? null,
    };
    return {
      def,
      columns,
      formInput: valueToFormInput({ type: def.type }, columns),
      display: formatFieldValue({ type: def.type }, columns),
    };
  });
}

/**
 * 保存某实体的字段值。
 * - 纯校验全在事务前（逐条 coerce → 必填），全通过才写；
 * - **未出现在 inputs 里的 active 定义按空值处理**，否则用户"清空一个框"清不掉；
 * - 未知 fieldId 直接拒（防前端塞脏 key 写出不属于任何定义的行）。
 */
export async function saveEntityValues(
  entityKind: string,
  entityId: string,
  inputs: { fieldId: string; raw: string }[],
): Promise<void> {
  if (!isEntityKind(entityKind)) throw new CustomFieldError(`未知实体类型：${entityKind}`);

  const defs = await listDefs();
  const byId = new Map(defs.map((d) => [d.id, d]));
  const rawByField = new Map<string, string>();
  for (const it of inputs ?? []) {
    if (!byId.has(it.fieldId)) throw new CustomFieldError(`未知字段：${it.fieldId}`);
    rawByField.set(it.fieldId, typeof it.raw === "string" ? it.raw : "");
  }

  // 全部定义都要落一行（未提交的按空值），校验一次做完再开事务
  const prepared: { fieldId: string; columns: ValueColumns }[] = [];
  for (const def of defs) {
    const r = coerceFieldValue(
      { type: def.type, label: def.label, required: def.required, options: def.options },
      rawByField.get(def.id) ?? "",
    );
    if (!r.ok) throw new CustomFieldError(r.error);
    const emptyErr = requiredEmptyError({ label: def.label, required: def.required }, r.columns);
    if (emptyErr) throw new CustomFieldError(emptyErr);
    prepared.push({ fieldId: def.id, columns: r.columns });
  }

  await prisma.$transaction(async (tx) => {
    // 存在性在事务内校验（entityId 无外键，多态指向两张表）
    if (entityKind === ENTITY_KIND.project) {
      const p = await tx.project.findUnique({ where: { id: entityId }, select: { id: true } });
      if (!p) throw new CustomFieldError("项目不存在");
    } else {
      const c = await tx.client.findUnique({ where: { id: entityId }, select: { id: true } });
      if (!c) throw new CustomFieldError("客户不存在");
    }
    for (const one of prepared) {
      await tx.customFieldValue.upsert({
        where: {
          fieldId_entityKind_entityId: {
            fieldId: one.fieldId,
            entityKind,
            entityId,
          },
        },
        create: {
          fieldId: one.fieldId,
          entityKind,
          entityId,
          valueText: one.columns.valueText,
          valueNumber: one.columns.valueNumber,
          valueDate: one.columns.valueDate,
        },
        update: {
          valueText: one.columns.valueText,
          valueNumber: one.columns.valueNumber,
          valueDate: one.columns.valueDate,
        },
      });
    }
  });
}

/**
 * 把深链参数配对成筛选条件。
 *
 * `cfv` ＝下界或唯一值、`cfvto` ＝上界（两个参数名各表一端，每段只切第一个冒号，
 * 见 customField.parseFilterParam 的注释）。
 *
 * **URL 里用 `key` 而不是 cuid**：key 是 unique 且创建后不可改，所以既可读又能长期分享
 * （`?cfv=warranty_years:3`），而 cuid 拼出来的链接没人看得懂、也没法手改。
 * 类型真值仍从定义表取——URL 不携带类型，否则前端可以伪造 type 把数字当文本筛。
 * 未知 key 静默丢弃（用户手改 URL 或字段已删是常态，不该报错）。
 */
export function buildFiltersFromParams(
  defs: FieldDef[],
  cfv: (string | null)[] | undefined,
  cfvto: (string | null)[] | undefined,
): FilterInput[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: FilterInput[] = [];
  const parseAll = (list: (string | null)[] | undefined) =>
    (list ?? [])
      .map((s) => (s === null ? null : parseFilterParam(String(s ?? ""))))
      .filter((p): p is { fieldId: string; raw: string } => p !== null);
  const hi = new Map(parseAll(cfvto).map((p) => [p.fieldId, p.raw]));
  const lo = parseAll(cfv);
  const seen = new Set<string>();
  for (const p of lo) {
    const def = byKey.get(p.fieldId);
    if (!def) continue;
    seen.add(p.fieldId);
    out.push({ fieldId: def.id, type: def.type, raw: p.raw, raw2: hi.get(p.fieldId) });
  }
  // 只填了上界（如"保修年限 ≤ 5"）的情形也要生效：cfv 里没有这个 key，但 cfvto 里有。
  for (const [key, upper] of hi) {
    if (seen.has(key)) continue;
    const def = byKey.get(key);
    if (!def) continue;
    out.push({ fieldId: def.id, type: def.type, raw: "", raw2: upper });
  }
  return out;
}

/**
 * 按自定义字段条件筛项目 id。
 * - 返回 `null` ＝无条件（调用方不加筛）；
 * - 返回 `[]` ＝筛不到（调用方必须给空列表，**绝不退化成无筛选**）；
 * - 多条件取交集（"同时满足"；本期不做"或"）。
 */
export async function filterProjectIdsByCustomFields(
  filters: FilterInput[],
): Promise<string[] | null> {
  const effective: { fieldId: string; where: Record<string, unknown> }[] = [];
  for (const f of filters) {
    const where = buildValueWhere(f);
    if (where) effective.push({ fieldId: f.fieldId, where });
  }
  if (effective.length === 0) return null;

  let acc: string[] | null = null;
  for (const one of effective) {
    const rows = await prisma.customFieldValue.findMany({
      where: {
        fieldId: one.fieldId,
        entityKind: ENTITY_KIND.project,
        ...one.where,
      },
      select: { entityId: true },
      distinct: ["entityId"],
    });
    const ids = rows.map((r) => r.entityId);
    acc = acc === null ? ids : acc.filter((id) => ids.includes(id));
  }
  return acc ?? null;
}
