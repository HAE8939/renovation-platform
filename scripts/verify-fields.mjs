/**
 * verify-fields.mjs —— EAV 自定义字段纯函数回归门禁（只读，不碰库）
 *
 * 为什么存在：字段定义校验、值转换（三列互斥）、展示、筛选谓词构造全部收敛在
 * src/core/domain/customField.ts。本脚本把这些口径变成可重跑门禁：plain node 直
 * import 生产 .ts（Node 24 原生跑），再用独立手算期望值交叉比对。
 * 报错文案逐字锁死——防"页面各写一套"与"改文案无人知"。
 *
 * 跑法：node scripts/verify-fields.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只测纯函数。
 */

import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 带 .ts 真源直 import：plain node 不解析无扩展名 specifier（STATUS §5 已登记的坑）
const {
  FIELD_TYPE,
  FIELD_TYPE_ORDER,
  FIELD_TYPE_LABEL,
  isFieldType,
  ENTITY_KIND,
  isEntityKind,
  TEXT_MAX,
  TEXTAREA_MAX,
  validateFieldKey,
  parseOptions,
  coerceFieldValue,
  requiredEmptyError,
  valueToFormInput,
  formatFieldValue,
  buildValueWhere,
  parseFilterParam,
  describeFilter,
} = await import(pathToFileURL(join(ROOT, "src/core/domain/customField.ts")).href);

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}
const J = (x) => JSON.stringify(x);
const KEY_ERR =
  "字段标识须以小写字母开头，仅含小写字母、数字与下划线，长度 2~40";

/* ── 常量与类型谓词 ───────────────────────────────────────────── */
{
  check("FIELD_TYPE: 恰为五值且字面同键",
    J(FIELD_TYPE) === J({ text: "text", textarea: "textarea", number: "number", date: "date", select: "select" }),
    J(FIELD_TYPE));
  check("FIELD_TYPE_ORDER: 顺序＝text,textarea,number,date,select",
    J([...FIELD_TYPE_ORDER]) === J(["text", "textarea", "number", "date", "select"]),
    J(FIELD_TYPE_ORDER));
  check("FIELD_TYPE_LABEL: 五键中文逐字",
    J(FIELD_TYPE_LABEL) ===
      J({ text: "单行文本", textarea: "多行文本", number: "数字", date: "日期", select: "单选" }),
    J(FIELD_TYPE_LABEL));
  check("isFieldType: 五值全 true",
    FIELD_TYPE_ORDER.every((t) => isFieldType(t) === true), "五值均认");
  check("isFieldType: 脏值全 false（空串/大写/金额/中文/null/undefined）",
    [""].concat(["TEXT", "money", "金额", null, undefined]).every((v) => isFieldType(v) === false),
    "六个反例均 false");
  check("ENTITY_KIND: project/client 两值",
    J(ENTITY_KIND) === J({ project: "project", client: "client" }), J(ENTITY_KIND));
  check("isEntityKind: 正反例",
    isEntityKind("project") === true && isEntityKind("client") === true &&
      isEntityKind("order") === false && isEntityKind(null) === false,
    "两真两假");
  check("长度上限常量：TEXT_MAX=200 · TEXTAREA_MAX=2000",
    TEXT_MAX === 200 && TEXTAREA_MAX === 2000, `${TEXT_MAX}/${TEXTAREA_MAX}`);
}

/* ── validateFieldKey ─────────────────────────────────────────── */
{
  check("validateFieldKey: 常规正例 survey_date", validateFieldKey("survey_date") === null,
    String(validateFieldKey("survey_date")));
  check("validateFieldKey: 最短正例 a1（长度 2）", validateFieldKey("a1") === null,
    String(validateFieldKey("a1")));
  check("validateFieldKey: 含下划线正例 ab_c1", validateFieldKey("ab_c1") === null,
    String(validateFieldKey("ab_c1")));
  check("validateFieldKey: 大写开头 Survey_date → 拒", validateFieldKey("Survey_date") === KEY_ERR,
    String(validateFieldKey("Survey_date")));
  check("validateFieldKey: 数字开头 1abc → 拒", validateFieldKey("1abc") === KEY_ERR,
    String(validateFieldKey("1abc")));
  check("validateFieldKey: 下划线开头 _abc → 拒", validateFieldKey("_abc") === KEY_ERR,
    String(validateFieldKey("_abc")));
  check("validateFieldKey: 含横线 ab-cd → 拒", validateFieldKey("ab-cd") === KEY_ERR,
    String(validateFieldKey("ab-cd")));
  check("validateFieldKey: 含空格 → 拒", validateFieldKey("ab cd") === KEY_ERR,
    String(validateFieldKey("ab cd")));
  check("validateFieldKey: 长度 1 → 拒", validateFieldKey("a") === KEY_ERR, String(validateFieldKey("a")));
  check("validateFieldKey: 长度 41 → 拒", validateFieldKey("a".repeat(41)) === KEY_ERR,
    `长度 41 → ${validateFieldKey("a".repeat(41)) === null ? "通过（错）" : "拒"}`);
  check("validateFieldKey: 长度 40 边界 → 通过", validateFieldKey("a".repeat(40)) === null,
    "40 字符合法");
  check("validateFieldKey: 中文 → 拒", validateFieldKey("面积") === KEY_ERR, String(validateFieldKey("面积")));
  check("validateFieldKey: 空串 → 拒", validateFieldKey("") === KEY_ERR, String(validateFieldKey("")));
  check("validateFieldKey: 所有失败情形文案同一句",
    new Set(["A", "1a", "-a", "a b", "a", "面"].map((k) => validateFieldKey(k))).size === 1,
    "六种非法返回同一串");
}

/* ── parseOptions（字符串＝DB 形态每行一个；数组也吃）───────────── */
{
  check("parseOptions: null/对象/数字/布尔 → []",
    [null, undefined, {}, 42, true].every((v) => J(parseOptions(v)) === "[]"),
    "五种非字符串非数组均空");
  check("parseOptions: 字符串按 \\n 切", J(parseOptions("不含家电\n仅厨电")) === J(["不含家电", "仅厨电"]),
    J(parseOptions("不含家电\n仅厨电")));
  check("parseOptions: CRLF 也切对", J(parseOptions("a\r\nb")) === J(["a", "b"]), J(parseOptions("a\r\nb")));
  check("parseOptions: 单行字符串 → 一项", J(parseOptions("仅厨电")) === J(["仅厨电"]), J(parseOptions("仅厨电")));
  check("parseOptions: 空串 → []", J(parseOptions("")) === "[]", J(parseOptions("")));
  check("parseOptions: 数组入参仍支持", J(parseOptions(["a", "b"])) === J(["a", "b"]), J(parseOptions(["a", "b"])));
  check("parseOptions: 字符串形态去空白/丢空/去重",
    J(parseOptions(" a \n\n a \n b ")) === J(["a", "b"]), J(parseOptions(" a \n\n a \n b ")));
  check("parseOptions: 数组形态非字符串元素丢弃",
    J(parseOptions([1, "x", null, true])) === J(["x"]), J(parseOptions([1, "x", null, true])));
  check("parseOptions: 空数组 → []", J(parseOptions([])) === "[]", J(parseOptions([])));
  check("parseOptions: 返回值每项都是非空字符串",
    parseOptions("a\n \nb").every((o) => typeof o === "string" && o !== "" && o === o.trim()),
    "清洗后无空串无首尾空白");
}

/* ── coerceFieldValue（三列互斥 + 逐类型文案）──────────────────── */
{
  const EMPTY = { valueText: null, valueNumber: null, valueDate: null };
  check("coerce: 空串＝未填 → ok 且三列全 null（不报类型错）",
    J(coerceFieldValue({ type: "number", label: "保修年限" }, "   ")) ===
      J({ ok: true, columns: EMPTY }),
    J(coerceFieldValue({ type: "number", label: "保修年限" }, "   ")));
  check("coerce: text 去首尾空白",
    J(coerceFieldValue({ type: "text", label: "名" }, "  瓷砖  ").columns.valueText) === J("瓷砖"),
    J(coerceFieldValue({ type: "text", label: "名" }, "  瓷砖  ")));
  check("coerce: text 201 字 → 拒且文案含 200",
    J(coerceFieldValue({ type: "text", label: "名" }, "字".repeat(201))) ===
      J({ ok: false, error: "“名”不能超过 200 个字符" }),
    J(coerceFieldValue({ type: "text", label: "名" }, "字".repeat(201))));
  check("coerce: text 200 字边界 → 通过",
    coerceFieldValue({ type: "text", label: "名" }, "字".repeat(200)).ok === true, "200 字合法");
  check("coerce: textarea 内部换行原样保留",
    coerceFieldValue({ type: "textarea", label: "备注" }, "a\n\nb").columns.valueText === "a\n\nb",
    J(coerceFieldValue({ type: "textarea", label: "备注" }, "a\n\nb").columns.valueText));
  check("coerce: textarea 2001 字 → 拒且文案含 2000",
    J(coerceFieldValue({ type: "textarea", label: "备注" }, "字".repeat(2001))) ===
      J({ ok: false, error: "“备注”不能超过 2000 个字符" }),
    J(coerceFieldValue({ type: "textarea", label: "备注" }, "字".repeat(2001))));
  check("coerce: number '5' → 5；'5.0' → 5",
    coerceFieldValue({ type: "number", label: "n" }, "5").columns.valueNumber === 5 &&
      coerceFieldValue({ type: "number", label: "n" }, "5.0").columns.valueNumber === 5,
    "整值归一");
  check("coerce: number 负数与 0 合法（保修年限填 0 是业务事实）",
    coerceFieldValue({ type: "number", label: "n" }, "-3").columns.valueNumber === -3 &&
      coerceFieldValue({ type: "number", label: "n" }, "0").columns.valueNumber === 0,
    "负数与 0 均通过");
  check("coerce: number 'abc'/'1.2.3'/'1e' → 同一句“应为数字”",
    ["abc", "1.2.3", "1e"].every((v) =>
      J(coerceFieldValue({ type: "number", label: "保修年限" }, v)) ===
        J({ ok: false, error: "“保修年限”应为数字" })),
    J(coerceFieldValue({ type: "number", label: "保修年限" }, "abc")));
  check("coerce: number Infinity/NaN 字面 → 拒（非有限）",
    ["Infinity", "NaN", "-Infinity"].every((v) =>
      coerceFieldValue({ type: "number", label: "n" }, v).ok === false),
    "三个非有限字面均拒");
  check("coerce: date '2026-01-05' 本地构造（年/月/日三分量正确）",
    (() => {
      const d = coerceFieldValue({ type: "date", label: "复尺" }, "2026-01-05").columns.valueDate;
      return d.getFullYear() === 2026 && d.getMonth() === 0 && d.getDate() === 5;
    })(),
    "本地构造不漂");
  check("coerce: date 月末 2026-10-31 不漂移（禁 UTC 解析）",
    coerceFieldValue({ type: "date", label: "复尺" }, "2026-10-31").columns.valueDate.getDate() === 31,
    `getDate=${coerceFieldValue({ type: "date", label: "复尺" }, "2026-10-31").columns.valueDate.getDate()}`);
  check("coerce: date 2026-13-40 与 2026-02-30 → 拒（日历真实性）",
    ["2026-13-40", "2026-02-30", "2026-00-10"].every((v) =>
      J(coerceFieldValue({ type: "date", label: "复尺" }, v)) ===
        J({ ok: false, error: "“复尺”应为有效日期（YYYY-MM-DD）" })),
    J(coerceFieldValue({ type: "date", label: "复尺" }, "2026-02-30")));
  check("coerce: date 缺补零 2026-1-5 与斜杠形态 → 拒（只收 YYYY-MM-DD）",
    ["2026-1-5", "2026/01/05", "20260105"].every((v) =>
      coerceFieldValue({ type: "date", label: "复尺" }, v).ok === false),
    "三种畸形均拒");
  check("coerce: select 在选项内 → 写 valueText",
    coerceFieldValue({ type: "select", label: "家电", options: ["不含家电", "仅厨电"] }, "仅厨电")
      .columns.valueText === "仅厨电",
    "命中选项");
  check("coerce: select 越界 → “值不在可选范围内”",
    J(coerceFieldValue({ type: "select", label: "家电", options: ["仅厨电"] }, "其他")) ===
      J({ ok: false, error: "“家电”的值不在可选范围内" }),
    J(coerceFieldValue({ type: "select", label: "家电", options: ["仅厨电"] }, "其他")));
  check("coerce: select 无选项时任何值都越界",
    coerceFieldValue({ type: "select", label: "家电" }, "x").ok === false, "options 缺省 → 拒");
  check("coerce: 未知 type → “未知字段类型：money”",
    J(coerceFieldValue({ type: "money", label: "金额" }, "5")) ===
      J({ ok: false, error: "未知字段类型：money" }),
    J(coerceFieldValue({ type: "money", label: "金额" }, "5")));

  // 三列互斥不变量：ok:true 时非 null 列数 <= 1 且落在该类型对应列
  const cases = [
    ["text", "瓷砖"],
    ["textarea", "a\n\nb"],
    ["number", "5"],
    ["number", "0"],
    ["date", "2026-10-31"],
    ["select", "仅厨电"],
  ];
  let mutexOk = true;
  let mutexBad = "";
  for (const [type, raw] of cases) {
    const r = coerceFieldValue({ type, label: "L", options: ["仅厨电"] }, raw);
    if (!r.ok) { mutexOk = false; mutexBad = `${type} 未 ok`; break; }
    const cols = ["valueText", "valueNumber", "valueDate"].filter((k) => r.columns[k] !== null);
    const want = type === "number" ? "valueNumber" : type === "date" ? "valueDate" : "valueText";
    if (cols.length !== 1 || cols[0] !== want) { mutexOk = false; mutexBad = `${type} → ${J(cols)}`; break; }
  }
  check("不变量：ok:true 时三列互斥且落在类型对应列（六例逐条）", mutexOk, mutexBad || "六例全对");
}

/* ── requiredEmptyError ───────────────────────────────────────── */
{
  check("requiredEmpty: required 且三列全 null → “为必填”",
    requiredEmptyError({ label: "保修年限", required: true },
      { valueText: null, valueNumber: null, valueDate: null }) === "“保修年限”为必填",
    requiredEmptyError({ label: "保修年限", required: true }, { valueText: null, valueNumber: null, valueDate: null }));
  check("requiredEmpty: valueNumber 0 算已填（0 不许当空）",
    requiredEmptyError({ label: "保修年限", required: true },
      { valueText: null, valueNumber: 0, valueDate: null }) === null, "0 视为已填");
  check("requiredEmpty: 非必填全空 → null",
    requiredEmptyError({ label: "备注", required: false },
      { valueText: null, valueNumber: null, valueDate: null }) === null, "非必填放行");
}

/* ── 表单回填 / 展示 / 往返一致 ───────────────────────────────── */
{
  check("valueToFormInput: date → 本地 YYYY-MM-DD（补零）",
    valueToFormInput({ type: "date" }, { valueDate: new Date(2026, 0, 5) }) === "2026-01-05",
    valueToFormInput({ type: "date" }, { valueDate: new Date(2026, 0, 5) }));
  check("valueToFormInput: number 去尾零 5.5/5/0/-3",
    [
      [5.5, "5.5"],
      [5, "5"],
      [0, "0"],
      [-3, "-3"],
    ].every(([n, want]) => valueToFormInput({ type: "number" }, { valueNumber: n }) === want),
    "四种数字形态");
  check("valueToFormInput: 对应列 null → 空串",
    valueToFormInput({ type: "text" }, { valueText: null }) === "" &&
      valueToFormInput({ type: "number" }, {}) === "" &&
      valueToFormInput({ type: "date" }, null) === "",
    "null/缺列/整行 null 均空串");
  check("valueToFormInput: 未知 type → 空串", valueToFormInput({ type: "money" }, { valueText: "x" }) === "",
    "脏类型不炸");
  check("formatFieldValue: 未填 → U+2014“—”（非 ASCII 连字符）",
    formatFieldValue({ type: "text" }, null) === "—" && !formatFieldValue({ type: "text" }, null).includes("-"),
    formatFieldValue({ type: "text" }, null));
  check("formatFieldValue: date → 与项目中心 fmtDate 同款",
    formatFieldValue({ type: "date" }, { valueDate: new Date(2026, 9, 11) }) ===
      new Date(2026, 9, 11).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }),
    formatFieldValue({ type: "date" }, { valueDate: new Date(2026, 9, 11) }));
  check("formatFieldValue: textarea 换行折成空格（列表不撑高）",
    formatFieldValue({ type: "textarea" }, { valueText: "a\n\nb" }) === "a b",
    formatFieldValue({ type: "textarea" }, { valueText: "a\n\nb" }));
  check("formatFieldValue: 未知 type → “—”", formatFieldValue({ type: "money" }, { valueText: "x" }) === "—",
    formatFieldValue({ type: "money" }, { valueText: "x" }));
  check("往返一致：number 5.50 → 表单 5.5",
    valueToFormInput({ type: "number" }, coerceFieldValue({ type: "number", label: "n" }, "5.50").columns) === "5.5",
    "归一正确");
  check("往返一致：date 严格回到 YYYY-MM-DD",
    valueToFormInput({ type: "date" }, coerceFieldValue({ type: "date", label: "d" }, "2026-10-31").columns) ===
      "2026-10-31",
    valueToFormInput({ type: "date" }, coerceFieldValue({ type: "date", label: "d" }, "2026-10-31").columns));
  check("往返一致：select 与 text 原样",
    valueToFormInput({ type: "select" }, coerceFieldValue({ type: "select", label: "s", options: ["仅厨电"] }, "仅厨电").columns) === "仅厨电" &&
      valueToFormInput({ type: "text" }, coerceFieldValue({ type: "text", label: "t" }, " 瓷砖 ").columns) === "瓷砖",
    "两型往返闭合");
}

/* ── buildValueWhere（四类型谓词 + 绝不返回空条件）─────────────── */
{
  check("where: text 包含", J(buildValueWhere({ fieldId: "x", type: "text", raw: "瓷砖" })) ===
    J({ valueText: { contains: "瓷砖" } }), J(buildValueWhere({ fieldId: "x", type: "text", raw: "瓷砖" })));
  check("where: textarea 同走 contains",
    J(buildValueWhere({ fieldId: "x", type: "textarea", raw: "a" })) === J({ valueText: { contains: "a" } }),
    J(buildValueWhere({ fieldId: "x", type: "textarea", raw: "a" })));
  check("where: select 走 equals（精确）",
    J(buildValueWhere({ fieldId: "x", type: "select", raw: "仅厨电" })) === J({ valueText: { equals: "仅厨电" } }),
    J(buildValueWhere({ fieldId: "x", type: "select", raw: "仅厨电" })));
  check("where: number 两端区间",
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "1", raw2: "5" })) ===
      J({ valueNumber: { gte: 1, lte: 5 } }), J(buildValueWhere({ fieldId: "x", type: "number", raw: "1", raw2: "5" })));
  check("where: number 两端倒置 → 自动交换（已拍板）",
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "5", raw2: "1" })) ===
      J({ valueNumber: { gte: 1, lte: 5 } }), J(buildValueWhere({ fieldId: "x", type: "number", raw: "5", raw2: "1" })));
  check("where: number 只给下界 → 只有 gte（无多余键）",
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "5" })) === J({ valueNumber: { gte: 5 } }),
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "5" })));
  check("where: number 只给上界 → 只有 lte",
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "", raw2: "5" })) === J({ valueNumber: { lte: 5 } }),
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "", raw2: "5" })));
  check("where: number 一端非法 → 忽略该端",
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "abc", raw2: "5" })) === J({ valueNumber: { lte: 5 } }),
    J(buildValueWhere({ fieldId: "x", type: "number", raw: "abc", raw2: "5" })));
  check("where: number 两端都非法 → null",
    buildValueWhere({ fieldId: "x", type: "number", raw: "a", raw2: "b" }) === null, "null 而非 {}");
  check("where: date 区间产出两个 Date",
    (() => {
      const w = buildValueWhere({ fieldId: "x", type: "date", raw: "2026-01-01", raw2: "2026-03-31" });
      return !!w && w.valueDate.gte instanceof Date && w.valueDate.lte instanceof Date &&
        w.valueDate.gte.getMonth() === 0 && w.valueDate.lte.getMonth() === 2 && w.valueDate.lte.getDate() === 31;
    })(),
    J(buildValueWhere({ fieldId: "x", type: "date", raw: "2026-01-01", raw2: "2026-03-31" })));
  check("where: date 一端格式非法 → 只出合法那端",
    (() => {
      const w = buildValueWhere({ fieldId: "x", type: "date", raw: "2026-01-01", raw2: "乱码" });
      return !!w && w.valueDate.gte instanceof Date && w.valueDate.lte === undefined;
    })(),
    J(buildValueWhere({ fieldId: "x", type: "date", raw: "2026-01-01", raw2: "乱码" })));
  check("硬要求：所有无有效条件情形一律 null，绝不返回 {}",
    [
      { fieldId: "x", type: "text", raw: "  " },
      { fieldId: "x", type: "select", raw: "" },
      { fieldId: "x", type: "number", raw: "", raw2: "" },
      { fieldId: "x", type: "date", raw: "", raw2: "" },
      { fieldId: "x", type: "money", raw: "a" },
    ].every((f) => buildValueWhere(f) === null),
    "五例均 null");
}

/* ── parseFilterParam / describeFilter ────────────────────────── */
{
  check("parseFilterParam: 只切第一个冒号（值含冒号不误切）",
    J(parseFilterParam("cf3:2026-01-05 10:00")) === J({ fieldId: "cf3", raw: "2026-01-05 10:00" }),
    J(parseFilterParam("cf3:2026-01-05 10:00")));
  check("parseFilterParam: 多冒号值整体归 raw",
    J(parseFilterParam("cf9:a:b:c")) === J({ fieldId: "cf9", raw: "a:b:c" }), J(parseFilterParam("cf9:a:b:c")));
  check("parseFilterParam: 常规两段",
    J(parseFilterParam("cf1:仅厨电")) === J({ fieldId: "cf1", raw: "仅厨电" }), J(parseFilterParam("cf1:仅厨电")));
  check("parseFilterParam: 值为空串仍合法",
    J(parseFilterParam("cf1:")) === J({ fieldId: "cf1", raw: "" }), J(parseFilterParam("cf1:")));
  check("parseFilterParam: 无冒号 / 空 fieldId / 非字符串 → null",
    parseFilterParam("cf3") === null && parseFilterParam(":x") === null &&
      parseFilterParam("") === null && parseFilterParam(null) === null,
    "四种脏输入均 null");
  check("describeFilter: text 包含",
    describeFilter({ label: "备注", type: "text" }, { fieldId: "x", type: "text", raw: "瓷砖" }) === "“备注”包含“瓷砖”",
    describeFilter({ label: "备注", type: "text" }, { fieldId: "x", type: "text", raw: "瓷砖" }));
  check("describeFilter: select ＝",
    describeFilter({ label: "家电", type: "select" }, { fieldId: "x", type: "select", raw: "仅厨电" }) === "“家电”＝“仅厨电”",
    describeFilter({ label: "家电", type: "select" }, { fieldId: "x", type: "select", raw: "仅厨电" }));
  check("describeFilter: 区间 a ~ b",
    describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "2", raw2: "5" }) ===
      "“保修年限”2 ~ 5",
    describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "2", raw2: "5" }));
  check("describeFilter: 只用 U+2265/U+2264，不写 >=/<=",
    (() => {
      const ge = describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "2" });
      const le = describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "", raw2: "5" });
      return ge === "“保修年限”≥ 2" && le === "“保修年限”≤ 5" && !ge.includes(">=") && !le.includes("<=");
    })(),
    describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "2" }));
  check("describeFilter: 两端都空 / 未知 type → null",
    describeFilter({ label: "n", type: "number" }, { fieldId: "x", type: "number", raw: "" }) === null &&
      describeFilter({ label: "m", type: "money" }, { fieldId: "x", type: "money", raw: "a" }) === null,
    "两例 null");
}

/* ── 输出禁 emoji 自检（与 verify-crm/dashboard 同纪律）────────── */
const EMOJI_RE =
  /[\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE00}-\u{FE0F}]/u;

const fnStrings = [
  FIELD_TYPE_ORDER.join(","),
  Object.values(FIELD_TYPE_LABEL).join(","),
  validateFieldKey("A"),
  validateFieldKey("ok_key"),
  J(parseOptions("a\nb")),
  coerceFieldValue({ type: "number", label: "保修年限" }, "abc").error,
  coerceFieldValue({ type: "date", label: "复尺" }, "2026-02-30").error,
  coerceFieldValue({ type: "select", label: "家电", options: [] }, "x").error,
  coerceFieldValue({ type: "text", label: "名" }, "字".repeat(201)).error,
  coerceFieldValue({ type: "money", label: "金额" }, "1").error,
  requiredEmptyError({ label: "保修年限", required: true }, { valueText: null, valueNumber: null, valueDate: null }),
  formatFieldValue({ type: "text" }, null),
  formatFieldValue({ type: "date" }, { valueDate: new Date(2026, 9, 11) }),
  valueToFormInput({ type: "date" }, { valueDate: new Date(2026, 0, 5) }),
  describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "2" }),
  describeFilter({ label: "保修年限", type: "number" }, { fieldId: "x", type: "number", raw: "", raw2: "5" }),
  describeFilter({ label: "家电", type: "select" }, { fieldId: "x", type: "select", raw: "仅厨电" }),
  J(buildValueWhere({ fieldId: "x", type: "text", raw: "瓷砖" })),
  J(parseFilterParam("cf1:仅厨电")),
].join("|");
check("输出契约：全部函数字符串返回值不含 emoji / 符号字形", !EMOJI_RE.test(fnStrings), "已扫描");

const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = EMOJI_RE.test(out.join("\n"));
check("输出契约：门禁自身输出不含 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n自定义字段（EAV）纯函数校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
