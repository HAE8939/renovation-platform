/**
 * 自定义字段（EAV）唯一口径真源。
 *
 * 字段定义校验 / 值转换 / 展示 / 筛选谓词构造的口径全部集中在本文件续写：
 * 纯函数、零 IO、零 import（门禁需以 plain node 直跑本 .ts）。
 * 所有报错文案在此单点维护，页面与表单不得各写一套。
 */

export const FIELD_TYPE = {
  text: "text",
  textarea: "textarea",
  number: "number",
  date: "date",
  select: "select",
} as const;

export type FieldType = (typeof FIELD_TYPE)[keyof typeof FIELD_TYPE];

export const FIELD_TYPE_ORDER: readonly FieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "单行文本",
  textarea: "多行文本",
  number: "数字",
  date: "日期",
  select: "单选",
};

export function isFieldType(v: string): boolean {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(FIELD_TYPE, v)
  );
}

export const ENTITY_KIND = {
  project: "project",
  client: "client",
} as const;

export type EntityKind = (typeof ENTITY_KIND)[keyof typeof ENTITY_KIND];

export function isEntityKind(v: string): boolean {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(ENTITY_KIND, v)
  );
}

export const TEXT_MAX = 200;
export const TEXTAREA_MAX = 2000;

const FIELD_KEY_ERROR =
  "字段标识须以小写字母开头，仅含小写字母、数字与下划线，长度 2~40";

export function validateFieldKey(key: string): string | null {
  if (typeof key !== "string" || !/^[a-z][a-z0-9_]{1,39}$/.test(key)) {
    return FIELD_KEY_ERROR;
  }
  return null;
}

export function parseOptions(raw: unknown): string[] {
  const list: unknown[] =
    typeof raw === "string"
      ? raw.split(/\r?\n/)
      : Array.isArray(raw)
        ? raw
        : [];
  const result: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const option = item.trim();
    if (option === "") continue;
    if (!result.includes(option)) result.push(option);
  }
  return result;
}

// ── M9-c 值转换与必填闸门 ─────────────────────────────────────────

/** 三列互斥的值载体：一条值行只填与类型对应的那一列，其余必为 null。 */
export interface ValueColumns {
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
}

/** 三列全 null 的载体（"未填"的统一表示）。 */
function emptyColumns(): ValueColumns {
  return { valueText: null, valueNumber: null, valueDate: null };
}

/** 参与值转换所需的最小定义形状。 */
export interface FieldShape {
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
}

/**
 * 本地日期解析：只接受 `YYYY-MM-DD`，用 `new Date(y, m-1, d)` 本地构造，
 * 再回测三分量验日历真实性（2026-13-40 / 2026-02-30 必拒）。
 * **禁止** `new Date("2026-01-05")`——字符串形式按 UTC 解析，在东八区会漂成前一天。
 */
function parseLocalDate(s: string): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() + 1 !== mo ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * 表单原始串 → 按类型转成三列。
 *
 * 空串（含纯空白）一律视为“未填”→ 三列全 null 且 ok:true，**不报类型错**；
 * 是否再拦必填由 requiredEmptyError 决定（先转类型、再判必填，报错顺序才稳定）。
 * number 的负数与 0 都合法（保修年限填 0 是业务事实）；方向语义由 type 列承载，
 * 不靠符号。未知 type（脏定义）宁可报错也不静默吞掉。
 */
export function coerceFieldValue(
  def: FieldShape,
  raw: string,
): { ok: true; columns: ValueColumns } | { ok: false; error: string } {
  const s = typeof raw === "string" ? raw : "";
  if (s.trim() === "") return { ok: true, columns: emptyColumns() };

  switch (def.type) {
    case FIELD_TYPE.text: {
      const v = s.trim();
      if (v.length > TEXT_MAX) {
        return { ok: false, error: `“${def.label}”不能超过 ${TEXT_MAX} 个字符` };
      }
      return { ok: true, columns: { ...emptyColumns(), valueText: v } };
    }
    case FIELD_TYPE.textarea: {
      // 只去首尾空白：内部换行是用户刻意写的，必须原样保留
      const v = s.trim();
      if (v.length > TEXTAREA_MAX) {
        return { ok: false, error: `“${def.label}”不能超过 ${TEXTAREA_MAX} 个字符` };
      }
      return { ok: true, columns: { ...emptyColumns(), valueText: v } };
    }
    case FIELD_TYPE.number: {
      const n = Number(s.trim());
      if (!Number.isFinite(n)) {
        return { ok: false, error: `“${def.label}”应为数字` };
      }
      return { ok: true, columns: { ...emptyColumns(), valueNumber: n } };
    }
    case FIELD_TYPE.date: {
      const d = parseLocalDate(s);
      if (!d) {
        return { ok: false, error: `“${def.label}”应为有效日期（YYYY-MM-DD）` };
      }
      return { ok: true, columns: { ...emptyColumns(), valueDate: d } };
    }
    case FIELD_TYPE.select: {
      const v = s.trim();
      const options = def.options ?? [];
      if (!options.includes(v)) {
        return { ok: false, error: `“${def.label}”的值不在可选范围内` };
      }
      return { ok: true, columns: { ...emptyColumns(), valueText: v } };
    }
    default:
      return { ok: false, error: `未知字段类型：${def.type}` };
  }
}

/**
 * 必填闸门（与 coerce 分开：先转类型、再判必填）。
 * valueNumber === 0 算已填——0 是有效业务值，不许当空。
 */
export function requiredEmptyError(
  def: { label: string; required: boolean },
  columns: ValueColumns,
): string | null {
  if (!def.required) return null;
  const filled =
    columns.valueText !== null ||
    columns.valueNumber !== null ||
    columns.valueDate !== null;
  return filled ? null : `“${def.label}”为必填`;
}

// ── M9-c 表单回填与展示 ───────────────────────────────────────────

/** 取该类型对应的那一列（其余列即使有脏值也不看，保证"只认类型列"）。 */
function pickColumn(
  type: string,
  row: Partial<ValueColumns> | null | undefined,
): string | number | Date | null {
  if (!row) return null;
  switch (type) {
    case FIELD_TYPE.text:
    case FIELD_TYPE.textarea:
    case FIELD_TYPE.select:
      return row.valueText ?? null;
    case FIELD_TYPE.number:
      return row.valueNumber ?? null;
    case FIELD_TYPE.date:
      return row.valueDate ?? null;
    default:
      return null;
  }
}

/** 数字 → 表单串（去尾零：5.50→"5.5"、5→"5"、0→"0"）；非有限 → ""。 */
function numberToInput(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

/** DB 行 → 表单控件值。date 走本地 `YYYY-MM-DD`（禁 toISOString，会漂一天）。 */
export function valueToFormInput(
  def: { type: string },
  row: Partial<ValueColumns> | null | undefined,
): string {
  const v = pickColumn(def.type, row);
  if (v === null) return "";
  if (def.type === FIELD_TYPE.date) {
    const d = v as Date;
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mo}-${day}`;
  }
  if (def.type === FIELD_TYPE.number) return numberToInput(v as number);
  return String(v);
}

/**
 * 展示串（列表与详情共用）。未填 → “—”（U+2014 EM DASH，不是 ASCII 连字符）。
 * textarea 把内部换行折成空格（列表里不撑高）；date 与项目中心 fmtDate 同款样式。
 */
export function formatFieldValue(
  def: { type: string },
  row: Partial<ValueColumns> | null | undefined,
): string {
  const v = pickColumn(def.type, row);
  if (v === null) return "—";
  switch (def.type) {
    case FIELD_TYPE.text:
    case FIELD_TYPE.select:
      return String(v);
    case FIELD_TYPE.textarea:
      return String(v).replace(/[\r\n]+/g, " ").trim();
    case FIELD_TYPE.number:
      return numberToInput(v as number);
    case FIELD_TYPE.date:
      return (v as Date).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    default:
      return "—";
  }
}

// ── M9-c 筛选谓词（TASK_M9 §8-0-19：四类型各配一谓词）──────────────

export type FilterOp = "contains" | "between" | "oneOf";

/** 一条筛选条件。type 必须由调用方从定义表取真值传入（页面不得自己猜类型）。 */
export interface FilterInput {
  fieldId: string;
  type: FieldType;
  raw: string;
  raw2?: string;
}

/**
 * → Prisma where 片段（供 `{ fieldId, entityKind, ...where }` 拼装）。
 *
 * 无有效条件一律返回 **null**，绝不返回 `{}`——空条件会把全部记录筛掉，
 * 那是骗人的空结果（调用方遇 null 应跳过该条件）。
 * 区间两端倒置（min > max）**自动交换**：用户填反了区间，交换比筛出空集友好。
 */
export function buildValueWhere(f: FilterInput): Record<string, unknown> | null {
  const a = typeof f.raw === "string" ? f.raw.trim() : "";
  const b = typeof f.raw2 === "string" ? f.raw2.trim() : "";

  switch (f.type) {
    case FIELD_TYPE.text:
    case FIELD_TYPE.textarea:
      // "包含"语义，不做大小写折叠：SQLite 的 LIKE 对 ASCII 本就不区分，中文无关；
      // Prisma 在 SQLite 上不支持 mode，写了会静默失效。
      return a === "" ? null : { valueText: { contains: a } };

    case FIELD_TYPE.select:
      return a === "" ? null : { valueText: { equals: a } };

    case FIELD_TYPE.number: {
      const lo = a === "" ? null : Number(a);
      const hi = b === "" ? null : Number(b);
      const loOk = lo !== null && Number.isFinite(lo);
      const hiOk = hi !== null && Number.isFinite(hi);
      if (!loOk && !hiOk) return null;
      if (loOk && hiOk) {
        const [min, max] = lo! <= hi! ? [lo!, hi!] : [hi!, lo!];
        return { valueNumber: { gte: min, lte: max } };
      }
      return loOk
        ? { valueNumber: { gte: lo } }
        : { valueNumber: { lte: hi } };
    }

    case FIELD_TYPE.date: {
      const lo = a === "" ? null : parseLocalDate(a);
      const hi = b === "" ? null : parseLocalDate(b);
      if (!lo && !hi) return null;
      if (lo && hi) {
        const [min, max] = lo.getTime() <= hi.getTime() ? [lo, hi] : [hi, lo];
        return { valueDate: { gte: min, lte: max } };
      }
      return lo ? { valueDate: { gte: lo } } : { valueDate: { lte: hi } };
    }

    default:
      return null;
  }
}

/**
 * 深链片段解析：`<fieldId>:<值>`，**只按第一个冒号切**（值里再含冒号也不会被误切，
 * 如 `cf3:2026-01-05 10:00` → raw 完整保留）。
 *
 * 区间不塞进同一段：原规格想用 `<fieldId>:<raw>:<raw2>` 三段式，但那与"值含冒号不误切"
 * 互相矛盾（集成者冒烟实测撞破），故改为**两个参数名各表一端**：
 *   `?cfv=<fieldId>:<下界或唯一值>` 与 `?cfvto=<fieldId>:<上界>`
 * 每段都只切第一个冒号，无歧义。把两端配回 FilterInput 的工作在 customFieldRepo
 * （服务端、能查到定义真类型）里做，本函数保持纯字符串解析。
 * 不做 decodeURIComponent：URL 解码由调用方（server 侧读 query）负责。
 */
export function parseFilterParam(s: string): { fieldId: string; raw: string } | null {
  if (typeof s !== "string") return null;
  const i = s.indexOf(":");
  if (i < 0) return null;
  const fieldId = s.slice(0, i);
  if (fieldId === "") return null;
  return { fieldId, raw: s.slice(i + 1) };
}

/**
 * 筛选条件的中文摘要（页头"已筛"行用）。
 * ≥ / ≤ 用 U+2265 / U+2264 数学符号，不是 `>=` / `<=`。
 */
export function describeFilter(
  def: { label: string; type: string },
  f: FilterInput,
): string | null {
  const a = typeof f.raw === "string" ? f.raw.trim() : "";
  const b = typeof f.raw2 === "string" ? f.raw2.trim() : "";
  switch (def.type) {
    case FIELD_TYPE.text:
    case FIELD_TYPE.textarea:
      return a === "" ? null : `“${def.label}”包含“${a}”`;
    case FIELD_TYPE.select:
      return a === "" ? null : `“${def.label}”＝“${a}”`;
    case FIELD_TYPE.number:
    case FIELD_TYPE.date:
      if (a !== "" && b !== "") return `“${def.label}”${a} ~ ${b}`;
      if (a !== "") return `“${def.label}”≥ ${a}`;
      if (b !== "") return `“${def.label}”≤ ${b}`;
      return null;
    default:
      return null;
  }
}
