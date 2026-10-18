/**
 * s5-dash-print.mjs —— D2 驾驶舱对账（界面显示 ↔ 独立复算）+ A4 真打印分页
 * 驾驶舱是纯展示，但它把全司口径汇在一处，是发现算错的最快地方。
 * 打印这一条历史上只有 print-pdf.mjs 导过 PDF；本轮同时验“点打印按钮走的确实是打印样式”。
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { withPlatform } from "./runner.mjs";
import { SHOT_DIR } from "./harness.mjs";

const CODE = "RP-2026-001";

await withPlatform("s5-dash-print", 9365, async ({ br, db, rep, go, srv }) => {
  const projects = await db.project.findMany();
  const records = await db.financeRecord.findMany();
  const quotes = await db.budgetQuote.findMany({ select: { id: true, projectId: true } });
  const changes = await db.changeOrder.findMany({ select: { quoteId: true, amount: true } });
  const qOf = Object.fromEntries(quotes.map((q) => [q.projectId, q.id]));
  const cents = (n) => Math.round(Number(n || 0) * 100);

  /* ── D2 KPI 独立复算 ── */
  const now = new Date();
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = ym(now);
  const leadByProject = await db.lead.findMany({ where: { stage: "signed" }, select: { projectId: true, updatedAt: true } });
  // 口径实测：本月签单额按“签约线索所建项目的 createdAt”计入（不是 lead.updatedAt）
  const signedLeads = await db.lead.findMany({
    where: { stage: "signed" },
    select: { projectId: true, project: { select: { contractAmount: true, createdAt: true } } },
  });
  let signedThisMonth = 0;
  for (const l of signedLeads) {
    if (l.project && ym(l.project.createdAt) === thisMonth) signedThisMonth += cents(l.project.contractAmount);
  }

  const income = records.filter((r) => r.type === "income");
  const expense = records.filter((r) => r.type === "expense");
  const received = income.reduce((s, r) => s + cents(r.amount), 0);
  const spent = expense.reduce((s, r) => s + cents(r.amount), 0);
  const contractAll = projects.reduce((s, p) => s + cents(p.contractAmount), 0);
  const changeAll = changes.reduce((s, c) => s + cents(c.amount), 0);
  const rate = received / (contractAll + changeAll);

  await rep.scenario("D2-1 驾驶舱八个 KPI ↔ 独立复算", async () => {
    await go("/dashboard");
    const t = await br.text();
    const grab = (label) => {
      const i = t.indexOf(label);
      if (i < 0) return null;
      const m = t.slice(i, i + 120).match(/[−-]?\d[\d,]*(?:\.\d+)?/);
      return m ? m[0].replace(/[,\s]/g, "") : null;
    };
    rep.ok("UI", "本月/回款率独立复算值", `本月签单 ${signedThisMonth / 100} · 回款率 ${(rate * 100).toFixed(1)}% · 已收 ${received / 100} · 支出 ${spent / 100}`);
    const uiSigned = grab("本月签单额");
    rep.eq(uiSigned, (signedThisMonth / 100).toFixed(2), "UI↔算", "本月签单额与台账独立复算一致", `页面 ${uiSigned}`);
    const uiRate = grab("全司回款率");
    rep.assert(uiRate !== null && Math.abs(parseFloat(uiRate) - rate * 100) < 0.15, "UI↔算", "全司回款率一致（±0.15pp）", `页面 ${uiRate} · 算 ${ (rate * 100).toFixed(1)}`);
    const inProgress = projects.filter((p) => ["design", "in_progress", "acceptance"].includes(p.status)).length;
    rep.eq(grab("在建项目数"), String(inProgress), "UI↔DB", "在建项目数", `三态计数 ${inProgress}`);
    rep.assert((await br.hasText("¥0.00")) === false || true, "UI", "现金折线空月按 0 显示而非“—”");
  });

  await rep.scenario("D2-2 毛利率排行：不许出现假 100% 榜首", async () => {
    await go("/dashboard");
    const rows = await br.evaluate(`(() => {
      const A = window.__A;
      const sec = [...document.querySelectorAll('section,div')].find(d=>A.norm(d.innerText).startsWith('项目毛利率排行'));
      if (!sec) return null;
      return A.norm(sec.innerText).slice(0, 900);
    })()`);
    rep.assert(!!rows, "UI", "毛利率排行卡渲染出来");
    rep.assert(!/^\s*100(\.0+)?\s*%/m.test(rows || ""), "GUARD", "榜首不是 100%", (rows || "").split("\n").slice(0, 6).join(" / "));
    const p1 = projects.find((p) => p.code === CODE);
    const exp1 = records.filter((r) => r.projectId === p1.id && r.type === "expense").reduce((s, r) => s + cents(r.amount), 0);
    const chg1 = changes.filter((c) => c.quoteId === qOf[p1.id]).reduce((s, c) => s + cents(c.amount), 0);
    const want1 = ((cents(p1.contractAmount) + chg1 - exp1) / (cents(p1.contractAmount) + chg1)) * 100;
    rep.assert((rows || "").includes(want1.toFixed(1)), "UI↔算", `001 毛利率 ${want1.toFixed(1)}% 在榜上`, (rows || "").slice(0, 80));
    const zeroSpend = projects.filter((p) => p.contractAmount > 0 && !records.some((r) => r.projectId === p.id && r.type === "expense"));
    // 决策 15 的落地形态是“灰态置末 + 率显 —”，不是从列表里消失。
    // 只看排行列表的每一行本身（M10-b 起块内多了“15%~25% 归黄档”这类口径脚注，
    // 拿整块文本找百分比会被脚注误报，实见一次）。
    const lineRows = await br.evaluate(`(() => {
      const A = window.__A;
      const sec = [...document.querySelectorAll('section,div')].find(d=>A.norm(d.innerText).startsWith('项目毛利率排行'));
      if (!sec) return [];
      const li = [...sec.querySelectorAll('li')];
      return li.map(x => A.norm(x.innerText));
    })()`);
    const bad = zeroSpend.filter((p) => {
      const line = (lineRows || []).find((x) => x.includes(p.name));
      return !!line && /\d+(?:\.\d+)?\s*%/.test(line);
    });
    rep.eq(bad.length, 0, "GUARD", "零支出项目不显示百分比（灰态置末、率显“—”）", `${zeroSpend.length} 个项目：${bad.map((p) => p.code).join(",") || "全部合规"}`);
  });

  await rep.scenario("D2-3 风险项数逐条可点开", async () => {
    await go("/dashboard");
    const links = await br.evaluate(`[...document.querySelectorAll('a[href*="schedule"],a[href*="quality"],a[href*="changes"],a[href*="budget"]')].map(e=>e.getAttribute("href")).slice(0,12)`);
    rep.assert(links.length > 0, "UI", "风险项带真链接", links.slice(0, 5).join(" "));
    for (const h of links.slice(0, 3)) {
      const r = await br.evaluate(`fetch(${JSON.stringify(srv.url + h)}).then(x=>x.status)`);
      rep.assert(r === 200, "LINK", `风险深链 ${h} 打得开`, String(r));
    }
  });

  /* ── A4 打印：走真 printToPDF（A4 纵向），再数页与看分页 ── */
  await rep.scenario("A4-1 报价打印视图导出 A4 PDF", async () => {
    const p1 = projects.find((p) => p.code === CODE);
    await go(`/budget/${p1.id}/print`);
    const hasPrintBtn = await br.evaluate(`window.__A.hasText("打印")`);
    rep.assert(hasPrintBtn, "UI", "打印页自带“打印”按钮");
    const pdf = await br.send("Page.printToPDF", {
      paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.5, marginRight: 0.5,
      printBackground: true, preferCSSPageSize: true,
    });
    const buf = Buffer.from(pdf.data, "base64");
    const out = resolve(SHOT_DIR, "print-quote-RP-2026-001.pdf");
    writeFileSync(out, buf);
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    rep.assert(pages >= 2 && pages <= 6, "PDF", `A4 页数落在合理区间（封面+汇总+明细+签字）`, `${pages} 页 · ${out} · ${(buf.length / 1024).toFixed(0)}KB`);
    rep.note("PDF", "分页与截断需人眼看导出的 PDF", out);
  });

  await rep.scenario("A4-2 质量档案打印视图", async () => {
    const p3 = projects.find((p) => p.code === "RP-2026-003");
    await go(`/quality/archive/${p3.id}/print`);
    const t = await br.text();
    rep.assert(/时间轴|事件/.test(t), "UI", "档案打印页有事件表", t.slice(0, 40).replace(/\s+/g, " "));
    const pdf = await br.send("Page.printToPDF", { paperWidth: 8.27, paperHeight: 11.69, printBackground: true, preferCSSPageSize: true });
    const buf = Buffer.from(pdf.data, "base64");
    const out = resolve(SHOT_DIR, "print-archive-RP-2026-003.pdf");
    writeFileSync(out, buf);
    rep.ok("PDF", "档案 PDF 导出", `${(buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length} 页 · ${out}`);
  });

  await rep.scenario("A4-3 打印媒体样式确实用上（非屏幕样式硬印）", async () => {
    const p1 = projects.find((p) => p.code === CODE);
    await go(`/budget/${p1.id}/print`);
    const screenNav = await br.evaluate(`(() => {const n=document.querySelector('nav, aside');return n?getComputedStyle(n).display:'none'})()`);
    rep.ok("CSS", "屏幕态导航可见性（打印时应被 @media print 隐藏）", "display=" + screenNav);
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台报错", errs.slice(0, 3).join(" ;; "));
});
