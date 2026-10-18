/**
 * harness.mjs —— §4-7 交互写回验收的运行台
 *
 * 三条硬规矩（都是踩过坑换来的）：
 * 1. **绝不打实库**：服务与断言客户端的 DATABASE_URL 一律指向 `_scratch/acceptance.db`
 *    （dev.db 的副本）。平台没有删除界面，写一次就多一批清不掉的数据——所以破坏性
 *    场景只能在副本上跑。跑完实库 md5 必须与跑前一致，这是本套件的元断言。
 * 2. **端口自动挑空闲**：残留的 next start 会应答探活造成假绿（实测截到旧构建）。
 * 3. **阻塞杀进程树**：异步 kill + 立刻退出等于没杀，会留孤儿服务。
 */

import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
export const ACCEPT_DB = resolve(ROOT, "_scratch", "acceptance.db");
export const ACCEPT_DB_URL = "file:../_scratch/acceptance.db";
export const SHOT_DIR = resolve(ROOT, "_scratch", "qa", "accept");
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

/* ── 服务 ─────────────────────────────────────────────────────── */
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

export async function startServer({ dbUrl = ACCEPT_DB_URL } = {}) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const proc = spawn(
    process.execPath,
    [resolve(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: dbUrl, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  const log = [];
  proc.stdout.on("data", (d) => log.push(String(d)));
  proc.stderr.on("data", (d) => log.push(String(d)));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url + "/", { redirect: "manual" });
      if (r.status < 500) { ready = true; break; }
    } catch {}
    await sleep(300);
  }
  if (!ready) {
    stopServer(proc);
    throw new Error("服务未就绪：\n" + log.join(""));
  }
  return {
    port,
    url,
    proc,
    log: () => log.join(""),
    stop() { stopServer(proc); },
  };
}

function stopServer(proc) {
  if (!proc || proc.killed) return;
  try {
    execFileSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    try { proc.kill("SIGKILL"); } catch {}
  }
}

/* ── 断言用 DB 客户端（同一副本库）────────────────────────────── */
export function openDb() {
  return new PrismaClient({ datasources: { db: { url: ACCEPT_DB_URL } } });
}

export function dbFingerprint() {
  if (!existsSync(ACCEPT_DB)) return null;
  const st = statSync(ACCEPT_DB);
  return `${st.size}:${st.mtimeMs}`;
}

/* ── 记账本 ───────────────────────────────────────────────────── */
export class Report {
  constructor(section) {
    this.section = section;
    this.rows = [];
  }
  push(status, id, desc, detail) {
    this.rows.push({ status, id, desc, detail: detail == null ? "" : String(detail) });
    const mark = status === "PASS" ? "  ✓" : status === "FAIL" ? "  ✗" : "  ~";
    console.log(`${mark} [${id}] ${desc}${detail ? "  → " + detail : ""}`);
    return status === "PASS";
  }
  ok(id, desc, detail) { return this.push("PASS", id, desc, detail); }
  fail(id, desc, detail) { return this.push("FAIL", id, desc, detail); }
  note(id, desc, detail) { return this.push("NOTE", id, desc, detail); }
  assert(cond, id, desc, detail) { return cond ? this.ok(id, desc, detail) : this.fail(id, desc, detail); }
  eq(actual, expected, id, desc) {
    const a = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
    const e = typeof expected === "object" ? JSON.stringify(expected) : String(expected);
    return this.assert(a === e, id, desc, a === e ? a : `实得 ${a} · 应为 ${e}`);
  }
  /** 期望服务端拒绝并给出中文文案（含关键词） */
  rejects(text, keyword, id, desc) {
    const hit = keyword ? text.includes(keyword) : false;
    return this.assert(hit, id, desc, hit ? `已见“${keyword}”` : `未见“${keyword}”；页面片段：${(text || "").replace(/\s+/g, " ").slice(0, 160)}`);
  }
  summary() {
    const p = this.rows.filter((r) => r.status === "PASS").length;
    const f = this.rows.filter((r) => r.status === "FAIL").length;
    const n = this.rows.filter((r) => r.status === "NOTE").length;
    console.log(`\n── ${this.section}：PASS ${p} · FAIL ${f} · NOTE ${n} ──\n`);
    return { section: this.section, pass: p, fail: f, note: n, rows: this.rows };
  }
}

/** 跑一段场景，异常也算失败但不炸全局 */
export async function scenario(rep, name, fn) {
  console.log(`\n▶ ${name}`);
  try {
    return await fn();
  } catch (e) {
    rep.fail("EXC", name + "（场景异常中断）", (e && e.message) || String(e));
    return null;
  }
}

/* ── 表格取数：把页面里的表格读成数组，供与 DB 交叉比对 ───────── */
export const TABLE_HELPER = String.raw`
(label) => {
  const norm=(s)=>(s==null?"":String(s)).replace(/\s+/g," ").trim();
  const tables=[...document.querySelectorAll("table")];
  const t = tables.find(x=>norm(x.innerText).toLowerCase().includes(norm(label).toLowerCase())) || tables[0];
  if(!t) return null;
  const head=[...t.querySelectorAll("thead th")].map(x=>norm(x.innerText));
  const body=[...t.querySelectorAll("tbody tr")].map(tr=>[...tr.querySelectorAll("td,th")].map(td=>norm(td.innerText)));
  return { head, body, tableIndex: tables.indexOf(t) };
}`;

export async function readTable(br, label) {
  return br.evaluate(`(${TABLE_HELPER})(${JSON.stringify(label)})`);
}

export function saveMd(path, text) {
  writeFileSync(path, text, "utf8");
  return path;
}

export function cash(n) {
  return Number(n).toFixed(2);
}

/** 从页面文本里抓金额（用于“界面显示 == DB 算出”交叉比对） */
export function findMoney(text, needle) {
  const re = /¥\s?[-\d,]+(?:\.\d{2})?/g;
  const i = text.indexOf(needle);
  if (i < 0) return null;
  const win = text.slice(i, i + 260);
  const m = win.match(re);
  return m ? m[0].replace(/[¥\s,]/g, "") : null;
}

export function normMoney(s) {
  if (s == null) return null;
  const v = String(s).replace(/[¥\s,]/g, "");
  return v === "" ? null : v;
}
