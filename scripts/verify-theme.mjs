/**
 * verify-theme.mjs —— 主题插槽纯函数回归门禁 + 与 tokens.css 的漂移锁（只读，不碰库）
 *
 * 为什么存在：主题只存插槽键名（R1 / 决策 7）。键名口径在 src/core/domain/theme.ts，
 * 实际色值只在 src/styles/tokens.css 的 `:root[data-theme="..."]` 里。两处必须同集合，
 * 否则设置页能选一套、外壳/令牌却对不上（或反过来：令牌加了一套、设置页选不到）。
 * plain node 直 import 生产 .ts（Node 24 原生跑）+ 独立断言，并对 tokens.css 交叉比对。
 *
 * 跑法：node scripts/verify-theme.mjs      （exit 0 = 全过；exit 1 = 有 FAIL）
 * 依赖：无。不连库、不连 prisma，只读一个 CSS 文件。
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const {
  THEME_KEYS,
  DEFAULT_THEME,
  THEME_LABEL,
  THEME_NOTE,
  isThemeKey,
  normalizeThemeKey,
} = await import(pathToFileURL(join(ROOT, "src/core/domain/theme.ts")).href);

const results = [];
let failed = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
}
const J = (x) => JSON.stringify(x);

/* ── 键名常量 ─────────────────────────────────────────────────── */
{
  check("THEME_KEYS: 恰为四套插槽 cobalt/rust/emerald/teal",
    J([...THEME_KEYS]) === J(["cobalt", "rust", "emerald", "teal"]),
    J([...THEME_KEYS]));
  check("THEME_KEYS: 顺序以 cobalt 打头（默认与线上现状一致）",
    THEME_KEYS[0] === "cobalt");
  check("DEFAULT_THEME: = cobalt", DEFAULT_THEME === "cobalt", String(DEFAULT_THEME));
  check("DEFAULT_THEME: 本身是合法键（normalize 幂等）", isThemeKey(DEFAULT_THEME));
}

/* ── 中文名 / 说明覆盖全部键，不多不少 ────────────────────────── */
{
  const keySet = [...THEME_KEYS].sort();
  check("THEME_LABEL: 键集合与 THEME_KEYS 完全一致",
    J(Object.keys(THEME_LABEL).sort()) === J(keySet),
    J(Object.keys(THEME_LABEL).sort()));
  check("THEME_NOTE: 键集合与 THEME_KEYS 完全一致",
    J(Object.keys(THEME_NOTE).sort()) === J(keySet),
    J(Object.keys(THEME_NOTE).sort()));
  check("THEME_LABEL: 每套都有非空中文名",
    THEME_KEYS.every((k) => typeof THEME_LABEL[k] === "string" && THEME_LABEL[k].trim() !== ""));
  check("THEME_NOTE: 每套都有非空取舍说明",
    THEME_KEYS.every((k) => typeof THEME_NOTE[k] === "string" && THEME_NOTE[k].trim() !== ""));
  check("THEME_LABEL: 四套名称互不相同",
    new Set(THEME_KEYS.map((k) => THEME_LABEL[k])).size === THEME_KEYS.length);
}

/* ── isThemeKey 正反例 ────────────────────────────────────────── */
{
  check("isThemeKey: 四个合法键全 true",
    THEME_KEYS.every((k) => isThemeKey(k) === true));
  check("isThemeKey: 大小写不符判 false（Cobalt）", isThemeKey("Cobalt") === false);
  check("isThemeKey: 未知键判 false（purple）", isThemeKey("purple") === false);
  check("isThemeKey: 空串判 false", isThemeKey("") === false);
  check("isThemeKey: null / undefined 判 false",
    isThemeKey(null) === false && isThemeKey(undefined) === false);
  check("isThemeKey: 非字符串（数字/对象）判 false",
    isThemeKey(0) === false && isThemeKey({}) === false);
}

/* ── normalizeThemeKey 回落 ───────────────────────────────────── */
{
  check("normalizeThemeKey: 合法键原样返回",
    THEME_KEYS.every((k) => normalizeThemeKey(k) === k));
  check("normalizeThemeKey: 脏值（purple / 空 / null）回落 DEFAULT",
    normalizeThemeKey("purple") === DEFAULT_THEME &&
    normalizeThemeKey("") === DEFAULT_THEME &&
    normalizeThemeKey(null) === DEFAULT_THEME &&
    normalizeThemeKey(undefined) === DEFAULT_THEME);
}

/* ── 漂移锁：tokens.css 声明的 data-theme 插槽集合 ≡ THEME_KEYS ── */
{
  const css = readFileSync(join(ROOT, "src/styles/tokens.css"), "utf8");
  const declared = [...css.matchAll(/:root\[data-theme="([^"]+)"\]/g)].map((m) => m[1]);
  const uniq = [...new Set(declared)].sort();
  check("漂移锁: tokens.css 的 data-theme 键集合 == THEME_KEYS（顺序无关）",
    J(uniq) === J([...THEME_KEYS].sort()),
    `css=[${uniq.join(",")}]`);

  // 每套插槽都必须重写整族四值（accent / ink / tint / fg）——少一个就会「半换色」错版。
  for (const k of THEME_KEYS) {
    const block = css.match(new RegExp(`:root\\[data-theme="${k}"\\]\\s*\\{([^}]*)\\}`));
    const body = block ? block[1] : "";
    const has = (v) => body.includes(v);
    check(`插槽 ${k}: 重写 --accent / --accent-ink / --accent-tint / --accent-fg 四值`,
      has("--accent:") && has("--accent-ink:") && has("--accent-tint:") && has("--accent-fg:"),
      block ? "" : "未找到插槽块");
  }

  /* M10-a 双声明锁：:root[data-theme] 管全站换肤，[data-theme]（任意元素）管组件内局部预览
     （设置页四张主题卡必须各自显色，否则 HAE 看到的"四套没区别"会复发）。
     两套必须同键集合同值——只写一处 = 全站与预览分叉，比没修更糟。 */
  {
    const rootKeys = [...css.matchAll(/:root\[data-theme="([^"]+)"\]/g)].map((m) => m[1]).sort();
    const anyKeys = [...css.matchAll(/(?<!root)\[data-theme="([^"]+)"\]/g)].map((m) => m[1]).sort();
    check("双声明锁: 每个插槽都有 :root[data-theme] 与元素级 [data-theme] 两份（局部预览可用）",
      J(rootKeys) === J(anyKeys) && anyKeys.length === THEME_KEYS.length,
      `root=[${rootKeys.join(",")}] any=[${anyKeys.join(",")}]`);
    for (const k of THEME_KEYS) {
      const grab = (re) => {
        const b = css.match(re);
        const body = b ? b[1] : "";
        const v = (t) => (body.match(new RegExp(`--${t}:\\s*([^;]+);`)) || [])[1]?.trim().toUpperCase() ?? null;
        return [v("accent"), v("accent-ink"), v("accent-tint"), v("accent-fg")].join("|");
      };
      const a = grab(new RegExp(`:root\\[data-theme="${k}"\\]\\s*\\{([^}]*)\\}`));
      const b = grab(new RegExp(`(?<!root)\\[data-theme="${k}"\\]\\s*\\{([^}]*)\\}`));
      check(`双声明锁: 插槽 ${k} 两份四值逐字相同`, !!a && a === b, `${a} vs ${b}`);
    }
  }

  // 现状基线：cobalt 三元组必须等于 V0.3 落地值（防止有人误改 :root 默认或插槽）。
  check("插槽 cobalt: accent 族 == V0.3 落地钴蓝（#3368A0 / #2A4E7A / #DCE8F4）",
    /:root\[data-theme="cobalt"\]\s*\{[^}]*--accent:\s*#3368A0/i.test(css) &&
    /--accent-ink:\s*#2A4E7A/i.test(css) &&
    /--accent-tint:\s*#DCE8F4/i.test(css));
  // teal 主按钮前景必须落深墨（= --accent-ink 同色），不得留白——theme-picker 明令。
  {
    const teal = css.match(/:root\[data-theme="teal"\]\s*\{([^}]*)\}/);
    const fg = teal && teal[1].match(/--accent-fg:\s*([^;]+);/);
    const ink = teal && teal[1].match(/--accent-ink:\s*([^;]+);/);
    check("插槽 teal: --accent-fg 非白且等于其 --accent-ink（白字在浅青上会发飘）",
      !!fg && !!ink &&
      fg[1].trim().toUpperCase() !== "#FFFFFF" &&
      fg[1].trim().toUpperCase() === ink[1].trim().toUpperCase(),
      fg ? `fg=${fg[1].trim()}` : "未找到 --accent-fg");
  }
}

/* ── 输出禁 emoji ─────────────────────────────────────────────── */
{
  const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const strings = [...THEME_KEYS.map((k) => THEME_LABEL[k]),
    ...THEME_KEYS.map((k) => THEME_NOTE[k])].join("|");
  check("输出契约：label/note 不含 emoji / 符号字形", !EMOJI_RE.test(strings), "已扫描");
}

/* ── 报告 ─────────────────────────────────────────────────────── */
const out = [];
for (const r of results) {
  out.push(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
const hasEmoji = /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(out.join("\n"));
check("输出契约：门禁自身输出不含 emoji / 符号", !hasEmoji, hasEmoji ? "检测到符号字符" : "纯文本输出");

console.log("\n主题插槽（PlatformSetting）纯函数校验 —— renovation-platform\n");
for (const r of results) {
  console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(
  `\n  ${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
);
process.exit(failed === 0 ? 0 : 1);
