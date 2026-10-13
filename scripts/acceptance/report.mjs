/**
 * report.mjs —— 汇总 _scratch/accept/results/*.json 成人看的验收报告（Markdown）
 * 输出到 docs/ACCEPTANCE_WRITEBACK_2026-10-13.md
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./harness.mjs";

const DIR = resolve(ROOT, "_scratch", "accept", "results");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const suites = files.map((f) => JSON.parse(readFileSync(resolve(DIR, f), "utf8")));

const TITLES = {
  "s1-catalog": "A1 科目库增删改排序",
  "s2-quote": "A2 报价编辑器（整表替换主链）",
  "s3-settings": "A3 项目设置 + D4 主题 / Logo",
  "s4-flows": "B/D 业务流转闭环（首跑）",
  "s5-dash-print": "D2 驾驶舱对账 + A4 打印",
  "s6-flows2": "B/D 业务流转闭环（补齐重跑）",
  "s8-final": "B1 签约建项 + B6 节点通过→付款解锁（收尾补验）",
  "s9-m10a": "M10-a 备料批（归档 / 作废 / 操作流水 / 通知中心 / 错误日志 / 六项 UI）",
  "s10-splash": "M10-b 启动页首屏（入场节奏 / 三种收起 / 主题随动 / reduced-motion / 例外不外溢）",
};

let md = `# 交互写回路径验收报告 · 2026-10-13

> 目的：闭合 STATUS §4-7（「交互写回路径尚未经人手验证」）。
> 做法：**无头 Chrome 真点击**（裸 CDP，非只截图）→ 服务端收 → Prisma 落库 → 回读页面，三方对账。
> 安全：全程打 \`_scratch/acceptance.db\`（dev.db 副本）；每个套件开跑前重灌副本；每套件收尾一条元断言「实库 md5 未变」。
> 工具：\`_scratch/accept/\`（cdp.mjs / harness.mjs / runner.mjs / s*.mjs），不进生产代码。

`;

let tp = 0, tf = 0, tn = 0;
const fails = [];
for (const s of suites) {
  tp += s.pass; tf += s.fail; tn += s.note;
  md += `## ${TITLES[s.section] || s.section}　·　PASS ${s.pass} / FAIL ${s.fail} / NOTE ${s.note}\n\n`;
  md += `| 结果 | 项 | 断言 | 实测 |\n|---|---|---|---|\n`;
  for (const r of s.rows) {
    const mark = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "·";
    const esc = (x) => String(x || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ⏎ ").slice(0, 190);
    md += `| ${mark} | ${esc(r.id)} | ${esc(r.desc)} | ${esc(r.detail)} |\n`;
    if (r.status === "FAIL") fails.push({ suite: s.section, ...r });
  }
  md += "\n";
}

md += `## 总计\n\nPASS **${tp}** · FAIL **${tf}** · NOTE **${tn}**（NOTE = 需要人判断或纯登记项）\n\n`;
md += `## 未通过清单（逐条待裁定）\n\n`;
for (const f of fails) md += `- **[${f.suite}] ${f.desc}**${f.detail ? ` — ${f.detail}` : ""}\n`;

/* 逐条处置与「需 HAE 判断」两段是人工判定，放在 _scratch/logs/triage.md 里，
   重新生成报告时自动接回——否则每次跑 report.mjs 都会把判定冲掉（已踩过一次）。 */
const triagePath = resolve(ROOT, "_scratch", "logs", "triage.md");
if (existsSync(triagePath)) {
  const i = md.indexOf("## 未通过清单");
  if (i >= 0) md = md.slice(0, i) + readFileSync(triagePath, "utf8");
}

const out = resolve(ROOT, "docs", "ACCEPTANCE_WRITEBACK_2026-10-13.md");
writeFileSync(out, md, "utf8");
console.log("写出", out, `PASS ${tp} FAIL ${tf} NOTE ${tn}`);
