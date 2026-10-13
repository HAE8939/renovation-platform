/**
 * smoke.mjs —— 验证台自检（先证明「打得动界面 + 只改副本库」，再谈场景）
 *
 * 元断言：跑完实库 prisma/dev.db 的 md5 必须与跑前一致。
 * 这条不成立，后面所有破坏性场景都不许跑。
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Browser } from "./cdp.mjs";
import { startServer, openDb, ROOT, SHOT_DIR } from "./harness.mjs";

const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");
const LIVE = resolve(ROOT, "prisma", "dev.db");

const rep = { pass: 0, fail: 0, lines: [] };
const chk = (ok, id, desc, detail) => {
  rep[ok ? "pass" : "fail"]++;
  rep.lines.push(`${ok ? "✓" : "✗"} [${id}] ${desc}${detail ? " → " + detail : ""}`);
  console.log(`${ok ? "✓" : "✗"} [${id}] ${desc}${detail ? " → " + detail : ""}`);
};

const liveBefore = md5(LIVE);
console.log("实库 md5（跑前）:", liveBefore);

const srv = await startServer();
console.log("服务起于", srv.url, "（DATABASE_URL=file:../_scratch/acceptance.db）");

const br = await Browser.launch({ port: 9333 });
const db = openDb();
try {
  await br.goto(srv.url + "/settings");
  const text = await br.text();
  chk(text.includes("主题"), "S1", "打开 /settings 并读到主题区", text.slice(0, 40).replace(/\s+/g, " "));

  // 选青碧 → 应用
  await br.pickRadio("themeKey", "teal");
  await br.clickText("应用主题", { type: "button" });
  await br.settle(1500);

  const row = await db.platformSetting.findUnique({ where: { id: "platform" } });
  chk(row?.themeKey === "teal", "S2", "切主题写库：副本库 themeKey 应为 teal", String(row?.themeKey));

  // 全站生效：驾驶舱主按钮前景色应变成 teal 的深墨 #0A7680
  await br.goto(srv.url + "/dashboard");
  const htmlTheme = await br.evaluate(`document.documentElement.getAttribute("data-theme")`);
  chk(htmlTheme === "teal", "S3", "外壳 <html data-theme> 随库切换", String(htmlTheme));
  await br.shot(resolve(SHOT_DIR, "smoke-dashboard-teal.png"));

  // 复位（副本库）
  await db.platformSetting.update({ where: { id: "platform" }, data: { themeKey: "cobalt" } });
} finally {
  await db.$disconnect();
  br.close();
  srv.stop();
}

const liveAfter = md5(LIVE);
chk(liveBefore === liveAfter, "S4", "实库零改动（md5 跑前后一致）", `${liveAfter}${liveBefore === liveAfter ? "" : " ≠ " + liveBefore}`);

console.log(`\n自检结果：PASS ${rep.pass} · FAIL ${rep.fail}`);
process.exit(rep.fail ? 1 : 0);
