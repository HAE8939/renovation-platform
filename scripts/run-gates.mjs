/**
 * scripts/run-gates.mjs —— 门禁统一驱动器（M13-c 工程收口）
 *
 * 为什么要有这个文件：AGENTS.md §8 把“build 通过、迁移+seed 能跑、计算正确”写成质量门槛，
 * 但 16 道 verify-* 脚本从未挂进 package.json，全靠人记得手跑。
 * 一次改口径没跑门禁＝门禁不存在——本次体检抓到的变更单回归就是这么漏过去的。
 *
 * 两类：
 *   默认            11 道纯函数门禁（无库、毫秒级，改完就该跑）
 *   --integration   5 道隔离库集成门禁（各自 reset 一个 _scratch/*.db，不碰 dev.db）
 *
 * 门禁清单是**从 scripts/ 目录扫出来的**，不是硬编码：
 * 新写一个 verify-x.mjs 就自动进默认批次，写 verify-x.mts 就自动进集成批次。
 * 硬编码清单的结局必然是漏——TASK_M11 里"十道纯函数"的计数就已经对不上实际的 11 道。
 *
 * 用法：
 *   pnpm verify                          纯函数门禁
 *   pnpm verify:integration              再加集成门禁
 *   pnpm verify --only tokens,finance    只跑指定几道（名字去掉 verify- 前缀）
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCRIPTS = join(ROOT, "scripts");
const SCRATCH = join(ROOT, "_scratch");

const argv = process.argv.slice(2);
const wantIntegration = argv.includes("--integration") || argv.includes("--all");
const onlyIdx = argv.indexOf("--only");
const only =
  onlyIdx >= 0 && argv[onlyIdx + 1]
    ? argv[onlyIdx + 1].split(",").map((s) => s.trim())
    : null;

function discover(ext) {
  if (!existsSync(SCRIPTS)) return [];
  return readdirSync(SCRIPTS)
    .filter((f) => f.startsWith("verify-") && f.endsWith(ext))
    .map((f) => ({ file: f, name: f.replace(/^verify-/, "").replace(/\.\w+$/, "") }))
    .filter((g) => (only ? only.includes(g.name) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const pure = discover(".mjs");
const integration = wantIntegration ? discover(".mts") : [];

if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true });

// Windows 上 npx 是 npx.cmd，spawnSync 不带 shell 会 ENOENT（stderr 直接是 undefined）。
// 参数里只出现无空格的相对路径，开 shell 不引入注入面。
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: cmd === "npx",
    ...opts,
  });

/** 合并输出，容忍 undefined（spawn 失败时两个流都可能是 undefined）。 */
const textOf = (r) => `${r.stdout ?? ""}${r.stderr ?? ""}${r.error?.message ?? ""}`;

/**
 * 从门禁输出里提取断言数。各脚本汇总格式不统一（“共 N 项检查”是主流，
 * 部分 .mts 逐行打 PASS/FAIL），所以按优先级依次尝试，全提不到就显示 "—"——
 * 宁可显示未知，也不给一个看着可信其实是 0 的假数字。
 */
function summarize(stdout) {
  const s = stdout ?? "";
  const passLines = (s.match(/^PASS/gm) || []).length;
  const failLines = (s.match(/^FAIL/gm) || []).length;
  if (passLines || failLines) return { pass: passLines, fail: failLines, known: true };
  const total = /共\s*(\d+)\s*项/.exec(s);
  const failed = /失败\s*(\d+)\s*项|(\d+)\s*项失败/.exec(s);
  if (total) {
    const n = Number(total[1]);
    const f = failed ? Number(failed[1] ?? failed[2]) : 0;
    return { pass: n - f, fail: f, known: true };
  }
  return { pass: null, fail: null, known: false };
}

/** Node 的 ESM 重解析提示会污染 tail，按行剔除。 */
const clean = (s) =>
  (s ?? "")
    .split("\n")
    .filter(
      (l) => !/Reparsing as ESM|trace-warnings|To eliminate this warning/i.test(l)
    )
    .join("\n");

function report(gate, out, code) {
  const stdout = clean(out.stdout);
  const stderr = clean(out.stderr);
  const s = summarize(stdout);
  const ok = code === 0 && (s.fail ?? 0) === 0;
  const shown = s.known
    ? `${String(s.pass).padStart(4)} 通过 · ${s.fail} 失败`
    : "     — 通过 ·    — 失败";
  console.log(`${ok ? "✓" : "✗"} ${gate.file.padEnd(28)} ${shown}${code !== 0 ? ` · exit ${code}` : ""}`);
  if (!ok) {
    stdout
      .split("\n")
      .filter((l) => l.startsWith("FAIL") || /项失败/.test(l))
      .slice(0, 12)
      .forEach((l) => console.log(`    ${l}`));
    if (code !== 0) {
      const tail = `${stdout}\n${stderr}`.trim().split("\n").slice(-8).join("\n    ");
      if (tail) console.log(`    ── 输出尾部 ──\n    ${tail}`);
    }
  }
  return { ok, pass: s.known ? s.pass : 0, fail: s.known ? s.fail : 0, unknown: !s.known };
}

console.log("── 纯函数门禁 ─────────────────────────────────────────");
const results = [];
for (const g of pure) {
  const out = run(process.execPath, [join("scripts", g.file)]);
  results.push({ gate: g.file, ...report(g, out, out.status) });
}

if (integration.length) {
  console.log("\n── 隔离库集成门禁（各自 _scratch/*.db，不碰 dev.db）──");
  for (const g of integration) {
    const src = readFileSync(join(SCRIPTS, g.file), "utf8");
    // 每个 .mts 都在头注释里写明自己的隔离库；从注释解析而不是驱动器硬编码，
    // 才能保证"脚本说的库"与"实际用的库"不会分叉。
    // 各家写法不一（有的带 file:../_scratch/x.db，有的只写 _scratch/x.db），故放宽匹配。
    const dbm = /_scratch[\\/]([A-Za-z0-9._-]+\.db)/.exec(src);
    if (!dbm) {
      console.log(`✗ ${g.file.padEnd(28)}    0 通过 · 1 失败`);
      console.log("    脚本头注释未声明 `_scratch/<name>.db` 隔离库，驱动器无法确定库名");
      results.push({ gate: g.file, ok: false, pass: 0, fail: 1, unknown: true });
      continue;
    }
    const url = `file:../_scratch/${dbm[1]}`;
    const env = { ...process.env, DATABASE_URL: url };
    const reset = run("npx", ["--no-install", "prisma", "migrate", "reset", "--force", "--skip-generate"], { env });
    if (reset.status !== 0) {
      console.log(`✗ ${g.file.padEnd(28)}    0 通过 · 1 失败`);
      console.log(`    隔离库 ${url} reset 失败：${textOf(reset).trim().split("\n").slice(-4).join(" / ")}`);
      results.push({ gate: g.file, ok: false, pass: 0, fail: 1, unknown: true });
      continue;
    }
    const out = run("npx", ["--no-install", "tsx", "--tsconfig", "tsconfig.json", join("scripts", g.file)], { env });
    results.push({ gate: g.file, ...report(g, out, out.status) });
  }
} else if (pure.length) {
  const mtsCount = existsSync(SCRIPTS)
    ? readdirSync(SCRIPTS).filter((f) => f.startsWith("verify-") && f.endsWith(".mts")).length
    : 0;
  console.log(
    `\n（未跑集成门禁 ${mtsCount} 道；需要时加 --integration，单道约 10–30 秒）`
  );
}

const totalPass = results.reduce((s, r) => s + r.pass, 0);
const totalFail = results.reduce((s, r) => s + r.fail, 0);
const unknown = results.filter((r) => r.unknown).map((r) => r.gate);
const failedGates = results.filter((r) => !r.ok).map((r) => r.gate);

console.log(
  `\n合计：${results.length} 道门禁 · ${totalPass} 项通过 · ${totalFail} 项失败` +
    (unknown.length ? `\n断言数未能解析（退出码仍已判定）：${unknown.join(", ")}` : "") +
    (failedGates.length ? `\n失败门禁：${failedGates.join(", ")}` : "")
);
if (!wantIntegration) {
  console.log("提示：改到 core/domain 口径、schema 或模块 server 时，必须再跑 pnpm verify:integration（§8）。");
}
process.exit(failedGates.length || results.length === 0 ? 1 : 0);
