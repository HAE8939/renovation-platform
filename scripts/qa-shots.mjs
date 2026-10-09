/**
 * qa-shots.mjs —— 起服务 + 逐页截图验收（集成者的 QA 面）
 *
 * 为什么存在：M1a/M1b 的验收靠「手动起 dev → 人肉开浏览器 → 手动截图」。
 * AGENTS §8 的质量门槛含"关键页 1:1 目检设计语言保真"，那就得有个可重跑的截图面。
 * 本脚本用生产构建（next start，非 dev）起在独立端口，逐页无头截图，跑完关服务。
 *
 * 跑法：pnpm build && node scripts/qa-shots.mjs
 *      node scripts/qa-shots.mjs --port 3120 --out _qa
 * 产物：<out>/<页名>.png + 控制台清单（哪些页 200、哪些 404 跳过）
 *
 * 注意：必须先 pnpm build。dev 模式的编译遮罩会被截进图里，白截。
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ── 参数 ────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const OUT = resolve(ROOT, arg("out", "_qa"));
const VIEWPORT = arg("viewport", "1440,900");

const BROWSER = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));

if (!BROWSER) {
  console.error("✗ 未找到 Edge / Chrome，无法截图。");
  process.exit(1);
}
if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
  console.error("✗ 缺 .next 构建产物，先跑 pnpm build。");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/* ── 起服务 ──────────────────────────────────────────────────── */
/* 端口必须自动挑空闲端口，不能写死：上一轮残留的 next start 若还占着固定端口，
   新服务会静默绑不上，而探活请求会由旧进程应答 200 —— 于是截到旧构建还报"全绿"。
   实测踩过：改完 CSS 重跑，两次截图字节数一模一样。 */
const { createServer } = await import("node:net");
const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const PORT = argv.includes("--port") ? Number(arg("port", 3120)) : await freePort();
const base = `http://127.0.0.1:${PORT}`;
const BUILD_ID = readFileSync(join(ROOT, ".next", "BUILD_ID"), "utf8").trim();

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  shell: true,
  detached: false,
});
const stopServer = () => {
  if (!server.pid) return;
  try {
    if (process.platform === "win32") {
      // 必须同步阻塞杀：shell:true 下 server.pid 是 cmd.exe，其下还挂着 node（next start）。
      // 早先用异步 spawn 发 taskkill 后立刻 process.exit()，taskkill 还没来得及执行就被带走，
      // 于是每次跑完都留一个占着端口的孤儿服务 —— 下次探活由它应答，截图就是假绿。
      execFileSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  } catch {
    /* 已退出 */
  }
};
process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});

const waitReady = async (ms = 60_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
      if (r.status < 500) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
};

console.log(`\n起服务 ${base}（构建 ${BUILD_ID.slice(0, 10)}）…`);
if (!(await waitReady())) {
  console.error("✗ 60s 内服务没起来（build 是否绿？）");
  stopServer();
  process.exit(1);
}

/* 验明正身：页面引用的 chunk 路径里带 buildId，与本地 .next/BUILD_ID 不一致
   说明应答的是别处起着的旧服务 —— 此时截图毫无意义，必须停。 */
{
  const html = await (await fetch(`${base}/`)).text();
  if (!html.includes(BUILD_ID)) {
    console.error(
      `✗ 应答方不是本次构建（页面内 buildId ≠ .next/BUILD_ID=${BUILD_ID}）。\n` +
        `  多半是有残留的 next start 占着端口，请先结束它。截图已中止，不出假绿。`
    );
    stopServer();
    process.exit(1);
  }
}
console.log("✓ 服务就绪且身份核对通过\n");


/* ── 目标页：项目 id 从库里取，不写死 ────────────────────────── */
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
await prisma.$disconnect();

const targets = [
  { name: "01-home", path: "/" },
  { name: "02-budget-list", path: "/budget" },
  project
    ? { name: "03-quote-detail", path: `/budget/${project.id}` }
    : { name: "03-quote-detail", path: "/budget/__none__" },
  { name: "04-catalog", path: "/budget/catalog" },
  { name: "05-crm", path: "/crm" },
  { name: "06-crm-list", path: "/crm?view=list" },
  { name: "07-projects", path: "/projects" },
];

const shot = (url, file) =>
  new Promise((done) => {
    const profile = join(tmpdir(), `qa-profile-${Math.random().toString(36).slice(2)}`);
    const p = spawn(
      BROWSER,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--user-data-dir=${profile}`,
        `--window-size=${VIEWPORT}`,
        // 等异步渲染（Server Component 水合 + 字体）落定再截
        "--virtual-time-budget=6000",
        `--screenshot=${file}`,
        url,
      ],
      { stdio: "ignore" }
    );
    p.on("exit", () => done());
    p.on("error", () => done());
  });

/* ── 逐页处理 ────────────────────────────────────────────────── */
const rows = [];
for (const t of targets) {
  let status = "ERR";
  try {
    const r = await fetch(base + t.path, { signal: AbortSignal.timeout(15_000) });
    status = String(r.status);
  } catch (e) {
    status = "TIMEOUT";
  }

  if (status !== "200") {
    rows.push({ ...t, status, file: "— 跳过（页面不通）" });
    continue;
  }
  const file = join(OUT, `${t.name}.png`);
  await shot(base + t.path, file);
  const ok = existsSync(file);
  rows.push({
    ...t,
    status,
    file: ok ? `${t.name}.png (${(statSync(file).size / 1024).toFixed(0)} KB)` : "✗ 未生成文件",
  });
}

stopServer();

/* ── 报告 ────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padEnd(n);
console.log("页名            HTTP    路径                                  截图");
console.log("─".repeat(96));
for (const r of rows) console.log(`${pad(r.name, 16)}${pad(r.status, 7)}${pad(r.path, 39)}${r.file}`);
const bad = rows.filter((r) => r.status !== "200").length;
console.log(`\n输出目录：${OUT}`);
console.log(bad ? `\n${bad} 个页面不通 —— 不通即未通过，别当成"截图工具坏了"。\n` : "\n全部页面可达并已截图。\n");
process.exit(0);
