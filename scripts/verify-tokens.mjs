/**
 * scripts/verify-tokens.mjs —— 设计令牌阶梯与视觉红线的机器门禁（M13-c）
 *
 * 为什么需要它：AGENTS.md §6 把“字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48”
 * 写成硬约束，但没有任何东西在执行它。M9-e 收口批手工把越界清零过一次，
 * 此后又累积到 87 处（本次体检实测）——靠人记得的约束必然回潮。
 * 本门禁把 §6/§6.1/§6.2/§6.3 里**可机检**的部分钉成断言：越界即红，改不动就不该合入。
 *
 * 只检能机检的；层级、留白节奏、反模板这类要人眼看的，仍在目检范围内，别拿本文件冒充。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

let pass = 0;
let fail = 0;
const chk = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const FILES = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(p)) FILES.push(p);
  }
})(SRC);

/**
 * 去掉注释，避免把"文档里提到越界写法"当成违规。
 * 行注释 //... 与块注释 /* ... *\/ 与 CSS 注释统一处理（够用即可，不引解析器）。
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const rel = (p) => p.replace(ROOT + "\\", "").replace(ROOT + "/", "");
const all = new Map(); // file → 去注释后的内容
for (const f of FILES) all.set(rel(f), stripComments(readFileSync(f, "utf8")));

/** 收集匹配项，返回 "file:line" 列表，便于直接定位。 */
function hits(re) {
  const out = [];
  for (const [file, text] of all) {
    let m;
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    while ((m = r.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      out.push({ file, line, text: m[0], extra: m[1] });
    }
  }
  return out;
}

const fmt = (h) => `${h.file}:${h.line} ${h.text}`;
const show = (h) => h.slice(0, 8).map(fmt).join("\n        ");

// ── 1. 字号阶梯 ────────────────────────────────────────────────
// 只约束任意值（text-[Npx]）；text-xs/sm 等命名字号按 §6 作为既定 body 尺寸保留。
const SIZE_LADDER = new Set(["12", "13", "15", "17", "20", "28"]);
const badSizes = hits(/\btext-\[(\d+(?:\.\d+)?)px\]/g).filter((h) => !SIZE_LADDER.has(h.extra));
chk(
  "字号：任意值只落在 12/13/15/17/20/28 六档（§6）",
  badSizes.length === 0,
  badSizes.length ? `${badSizes.length} 处越界\n        ${show(badSizes)}` : ""
);

// 首屏例外（§6.3）允许 clamp() 展示级字号，但它必须留在 splash 作用域内 —— 单独核对
const splashSizes = hits(/\btext-\[clamp\(/g);
chk(
  "字号：展示级 clamp() 只允许出现在首屏例外作用域",
  splashSizes.every((h) => /HeroSplash|globals\.css/.test(h.file)),
  splashSizes.map((h) => h.file).join(", ") || "无"
);

// ── 2. 间距阶梯 ────────────────────────────────────────────────
// Tailwind 刻度 1=4px：故合法档为 0,1,2,3,4,6,8,12（4/8/12/16/24/32/48）
// 外加 16=64px、24=96px —— tokens.css:45 成文允许“长页 section 上探 64/96”。
const SPACE_LADDER = new Set(["0", "1", "2", "3", "4", "6", "8", "12", "16", "24"]);
const SPACE_PROPS =
  "(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)";
const badSpace = hits(
  new RegExp(`(?<![\\w.-])${SPACE_PROPS}-(?:\\d+(?:\\.5)?)(?![\\w.-])`, "g")
).filter((h) => !SPACE_LADDER.has(h.text.split("-").pop()));
chk(
  "间距：只落在 4/8/12/16/24/32/48（+长页 64/96）阶梯内（§6）",
  badSpace.length === 0,
  badSpace.length ? `${badSpace.length} 处越界\n        ${show(badSpace)}` : ""
);

// ── 3. accent 前景（§6：teal 浅青上主按钮用深墨，非白）────────────
const badFg = hits(/(?<![\w-])text-white(?![\w-])/g).filter((h) => {
  const lines = all.get(h.file).split("\n");
  const around = lines.slice(Math.max(0, h.line - 3), h.line + 2).join(" ");
  // danger 态按钮 hover 变红底白字是设计允许的（V0.3 语义色，不是 accent）
  return /bg-accent/.test(around) && !/bg-danger/.test(around);
});
chk(
  "accent：bg-accent 上的前景走 --accent-fg，不得写死白字（§6）",
  badFg.length === 0,
  badFg.length ? `${badFg.length} 处\n        ${show(badFg)}` : ""
);

// tailwind 必须把 accent 一族四值全映射，否则 text-accent-fg 是无解类（M13 体检 H-4）
const tw = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
const accentBlock = /accent:\s*\{([^}]*)\}/.exec(tw)?.[1] ?? "";
const missing = ["DEFAULT", "ink", "tint", "fg"].filter(
  (k) => !new RegExp(`\\b${k}\\b`).test(accentBlock)
);
chk(
  "accent：tailwind 映射齐四值（DEFAULT/ink/tint/fg），与 tokens.css 同构",
  missing.length === 0,
  missing.length ? `缺 ${missing.join("/")}` : ""
);

// ── 4. 浮层阴影（§6.2：默认 L0，本仓不消耗阴影预算）────────────────
const badShadow = hits(/\bshadow-(?!none)[a-z0-9[\]]*\b/g);
chk(
  "阴影：未使用 Tailwind 默认 shadow-* 工具类（§6.2）",
  badShadow.length === 0,
  badShadow.length ? `${badShadow.length} 处\n        ${show(badShadow)}` : ""
);
const boxShadow = hits(/box-shadow\s*:/g).filter(
  (h) => !/none\s*!important/.test(h.text + (all.get(h.file).split("\n")[h.line - 1] ?? ""))
);
chk(
  "阴影：无新增 box-shadow（打印态清零不计）",
  boxShadow.length === 0,
  boxShadow.length ? show(boxShadow) : ""
);

// ── 5. 首屏例外作用域不外溢（§6.3）───────────────────────────────
const splashUsers = hits(/\bsplash-[a-z-]+/g).filter(
  (h) => !/HeroSplash|globals\.css/.test(h.file)
);
chk(
  "首屏：.splash-* 未被业务页或跨页组件引用（§6.3 例外锁在一个作用域）",
  splashUsers.length === 0,
  splashUsers.length ? `${splashUsers.length} 处\n        ${show(splashUsers)}` : ""
);

// ── 6. 状态存储红线（§6.1：DB 驱动，不用 localStorage）─────────────
const storage = hits(/\b(localStorage|sessionStorage)\b/g);
chk(
  "存储：无 localStorage / sessionStorage（§6.1 DB 驱动红线）",
  storage.length === 0,
  storage.length ? `${storage.length} 处\n        ${show(storage)}` : ""
);

// ── 7. 组件库红线（§1）──────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const banned = deps.filter((d) =>
  /(antd|@mui|@chakra|element-plus|element-ui|@headlessui|@radix-ui|shadcn|bootstrap|semantic-ui)/.test(
    d
  )
);
chk("依赖：未引入成套组件库（§1）", banned.length === 0, banned.join(", "));

console.log(`\nverify-tokens：${pass} 通过 · ${fail} 失败 · 扫描 ${FILES.length} 个文件`);
process.exit(fail === 0 ? 0 : 1);
