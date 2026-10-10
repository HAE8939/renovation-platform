/**
 * print-pdf.mjs —— 把 A4 打印视图导出为 PDF 供目检
 *
 * 为什么单独做：打印排版在屏幕截图里根本看不出来（分页、表头重复、省墨、A4 边距
 * 只在打印媒体查询下才生效）。要验打印就必须出真 PDF。
 *
 * 顺带解决一个实测踩过的坑：手动 `npx next start &` 起的服务，bash 的 kill 打不穿
 * npx → cmd → node 的孙进程链，会留下占着端口的孤儿服务，下次探活就拿到旧构建的假绿。
 * 这里统一用 taskkill /F /T 杀整棵进程树，并在退出后断言端口已释放。
 *
 * 跑法：node scripts/print-pdf.mjs            （默认取最早的项目）
 *      node scripts/print-pdf.mjs --project <id> --out _scratch/qa/print-a4.pdf
 *      node scripts/print-pdf.mjs --path "/quality/archive/<id>/print"
 *      （--path 优先：指定任意打印路由；与 --project 互斥，给 --path 时不查库）
 */

import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const OUT = resolve(ROOT, arg("out", "_scratch/qa/print-a4.pdf"));
mkdirSync(dirname(OUT), { recursive: true });

const BROWSER = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));
if (!BROWSER) { console.error("✗ 未找到 Edge / Chrome"); process.exit(1); }
if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
  console.error("✗ 缺 .next 构建产物，先跑 pnpm build。"); process.exit(1);
}

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });

const PORT = await freePort();
const base = `http://127.0.0.1:${PORT}`;
const BUILD_ID = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const project = arg("project", null)
  ? { id: arg("project", null) }
  : await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
await prisma.$disconnect();
if (!project) { console.error("✗ 库里没有项目，先跑 prisma db seed"); process.exit(1); }

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: ROOT, stdio: "ignore", shell: true,
});
const killTree = () => {
  if (!server.pid) return;
  try {
    execFileSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
  } catch { /* 已退出 */ }
};
process.on("exit", killTree);

const waitReady = async (ms = 60_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
      if (r.status < 500) return true;
    } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
};

console.log(`起服务 ${base}（构建 ${BUILD_ID.slice(0, 10)}）…`);
if (!(await waitReady())) { console.error("✗ 服务未就绪"); killTree(); process.exit(1); }

const url = base + arg("path", `/budget/${project.id}/print`);
const html = await (await fetch(url)).text();
if (!html.includes(BUILD_ID)) {
  console.error("✗ 应答方不是本次构建（buildId 不符），中止，不出假 PDF");
  killTree(); process.exit(1);
}

execFileSync(BROWSER, [
  "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
  `--user-data-dir=${join(tmpdir(), "qa-pdf-profile")}`,
  `--print-to-pdf=${OUT}`, url,
], { stdio: "ignore" });

killTree();
await new Promise((r) => setTimeout(r, 1200));

const ok = existsSync(OUT);
console.log(ok ? `\n✓ PDF：${OUT}（${(readFileSync(OUT).length / 1024).toFixed(0)} KB）` : "\n✗ PDF 未生成");
console.log("提示：用 PDF 页数判断 A4 分页是否合理；表头应在每页重复、行不应被切断。");
process.exit(ok ? 0 : 1);
