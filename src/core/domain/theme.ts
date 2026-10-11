/**
 * 主题插槽的单一口径（M9-d）——纯函数、零依赖，plain-node 门禁可直 import 真源。
 *
 * 决策 R1（STATUS §3）/ 决策 7（TASK_M9 §1）：主题 = 客户自助切换，`PlatformSetting`
 * **只存插槽键名**（cobalt / rust / emerald / teal），不存自由色值——否则客户能自助调出
 * 对比度不达标的主题，拆掉 V0.3 的对比度零点纪律。品牌色若不在这四套内，走「补一套插槽
 * 并入规范」，绝不在设置页开取色器。
 *
 * 关键分工：本文件只承载**键名 / 中文名 / 默认值 / 校验**（可被门禁与页面共用）。
 * 四套的**实际色值只落在 `src/styles/tokens.css`**（AGENTS §6：V0.3 token 首次落成 CSS 变量
 * 的地方）。两处不许各存一份色——`verify-theme.mjs` 会把 tokens.css 里 `data-theme="..."`
 * 声明的键集合与本文件的 `THEME_KEYS` 交叉断言，防止漂移。
 */

/** 四个插槽键（展示顺序即此顺序；cobalt 为默认与线上现状）。 */
export const THEME_KEYS = ["cobalt", "rust", "emerald", "teal"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

/** 默认主题 = 钴蓝（与 V0.3 落地现状一致；无记录 / 脏值一律回落这里）。 */
export const DEFAULT_THEME: ThemeKey = "cobalt";

/** 中文名（设置页与提示用；不进色值）。 */
export const THEME_LABEL: Record<ThemeKey, string> = {
  cobalt: "钴蓝",
  rust: "铁锈红",
  emerald: "祖母绿",
  teal: "蒂芙尼青",
};

/**
 * 每套的取舍说明（取自已评审的 `docs/preview/theme-picker.html` 结论）——
 * 让客户「睁着眼选」，而不是盲选一个对比度塌方的主题。纯展示文案，不含色值、不含 emoji。
 */
export const THEME_NOTE: Record<ThemeKey, string> = {
  cobalt: "四套里最安全：白字 5.8:1，与红/绿状态色相隔最远。适合对外的正式报价单。",
  rust: "规范原始默认、暖而质朴；但色相与「删除/错误」的深红仅差 9°，满屏暖红时危险操作易与之相抢。",
  emerald: "稳健的金融感；白字约 3.8:1 正文号偏浅，且与「成功/已完成」绿相差 19°，确认态需靠图标补强。",
  teal: "轻盈明亮；主按钮改用深墨字（白字会发飘，规范明令禁用），大面积表格界强调色易失焦。",
};

/** 键名校验：仅认四套插槽；其余（含 null/空/任意串）判非法。类型谓词，供收窄。 */
export function isThemeKey(v: unknown): v is ThemeKey {
  return typeof v === "string" && (THEME_KEYS as readonly string[]).includes(v);
}

/**
 * 把任意来源（DB 值 / 表单值 / 脏值）归一为合法插槽键：合法键原样返回，
 * 非法（null / 空 / 不在四套内）回落 `DEFAULT_THEME`。外壳据此渲染 `data-theme`，
 * 保证永远落在一套已验证过对比度的主题上，绝不留空或写脏。
 */
export function normalizeThemeKey(v: unknown): ThemeKey {
  return isThemeKey(v) ? v : DEFAULT_THEME;
}
