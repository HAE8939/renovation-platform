/**
 * runner.mjs —— 场景套件的统一生命周期（服务 + 浏览器 + 断言库 + 结果落盘）
 *
 * 每个套件一次 withPlatform()：起一次服务、开一次浏览器，跑完把结果写
 * _scratch/accept/results/<name>.json，最后由 report.mjs 汇总成人看的报告。
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Browser } from "./cdp.mjs";
import { startServer, openDb, Report, ROOT, SHOT_DIR, scenario, ACCEPT_DB } from "./harness.mjs";

export const RESULTS_DIR = resolve(ROOT, "_scratch", "accept", "results");
mkdirSync(RESULTS_DIR, { recursive: true });

const LIVE_DB = resolve(ROOT, "prisma", "dev.db");

/** 每个套件从实库的同一快照起步：套件互不污染，破坏性操作也不用怕 */
export function resetCopy(label) {
  copyFileSync(LIVE_DB, ACCEPT_DB);
  return label || "副本库已从 dev.db 重灌";
}

const md5 = (p) => {
  try {
    return createHash("md5").update(readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
};

export async function withPlatform(name, cdpPort, body) {
  const liveBefore = md5(LIVE_DB);
  resetCopy();
  const srv = await startServer();
  const br = await Browser.launch({ port: cdpPort });
  const db = openDb();
  const rep = new Report(name);
  rep.scenario = (label, fn) => scenario(rep, label, fn);
  const ctx = {
    srv,
    br,
    db,
    rep,
    scenario: rep.scenario,
    shot: async (file) => {
      const p = resolve(SHOT_DIR, `${name}-${file}.png`);
      await br.shot(p);
      return p;
    },
    async go(path) {
      await br.goto(srv.url + path);
      return path;
    },
    liveMd5: () => md5(resolve(ROOT, "prisma", "dev.db")),
  };
  let crashed = null;
  try {
    await body(ctx);
  } catch (e) {
    crashed = e;
    rep.fail("SUITE", name + " 套件异常", (e && e.message) || String(e));
  } finally {
    const liveAfter = ctx.liveMd5();
    rep.assert(liveBefore === liveAfter, "ISO", "元断言：实库 dev.db 未被写过",
      liveBefore === liveAfter ? "md5 一致" : `实库被改了！${liveBefore} → ${liveAfter}`);
    await db.$disconnect().catch(() => {});
    br.close();
    srv.stop();
    const sum = rep.summary();
    sum.crashed = crashed ? String(crashed.message || crashed) : null;
    sum.serverLog = (sum.fail ? srv.log().slice(-1500) : "");
    writeFileSync(resolve(RESULTS_DIR, `${name}.json`), JSON.stringify(sum, null, 2), "utf8");
    console.log("结果写入", `${name}.json`);
  }
  return rep.summary();
}

/** 从页面抓某段文本附近的金额，做「界面显示 ↔ DB 算出」交叉比对 */
export async function moneyNear(br, needle) {
  return br.evaluate(`window.__A.afterMoney(${JSON.stringify(needle)})`);
}

export const fmt = (n) => Number(n).toFixed(2);
