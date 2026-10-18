/**
 * s11-dashboard.mjs —— 驾驶舱改版（M10-b）结构与口径验收
 * 钉的是"排版改版有没有把数据弄丢/弄错"，以及三处截图实见的毛病有没有真修掉。
 */
import { withPlatform, moneyNear } from "./runner.mjs";

await withPlatform("s11-dashboard", 9375, async ({ br, db, rep, go, shot }) => {
  const cents = (n) => Math.round(Number(n || 0) * 100);

  await rep.scenario("DB1 密集表：全部在册项目一行一个，1440 下不产生横向溢出", async () => {
    await go("/dashboard");
    const m = await br.evaluate(`(() => {
      const t = document.querySelector('table');
      if (!t) return null;
      const wrap = t.parentElement;
      const rows = [...t.querySelectorAll('tbody tr')];
      return {
        rows: rows.length,
        cols: t.querySelectorAll('thead th').length,
        fits: t.scrollWidth <= wrap.clientWidth + 1,
        tableScroll: t.scrollWidth, wrapClient: wrap.clientWidth,
        docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        firstRowLights: (() => {
          // 量内层 flex 容器（Td 自身含 12px 上下内边距，拿它判"是否一行"会虚高）
          const box = rows[0].children[3].firstElementChild;
          const r = box.getBoundingClientRect();
          const tops = new Set([...box.children].map((x) => Math.round(x.getBoundingClientRect().top)));
          return { height: Math.round(r.height), lines: tops.size };
        })(),
      };
    })()`);
    const live = await db.project.count({ where: { status: { not: "archived" } } });
    rep.eq(m?.rows, live, "DB↔UI", `密集表行数 = 未归档项目数（含筹备中与已竣工，不再只列在建）`, String(live));
    rep.eq(m?.cols, 9, "UI", "九列齐全（项目/状态/进度/三灯/合同额/已收/毛利/毛利率/风险）");
    rep.assert(m?.fits === true, "UI", "表格在 1440 下不横向溢出（内容完整可见）", `${m?.tableScroll} ≤ ${m?.wrapClient}`);
    rep.assert(m?.docOverflow <= 0, "UI", "文档级无横向溢出", `溢出 ${m?.docOverflow}px`);
    rep.assert(m?.firstRowLights.lines === 1 && m?.firstRowLights.height <= 24, "UI", "三灯排在同一行、没被挤成竖排", `${m?.firstRowLights.height}px · ${m?.firstRowLights.lines} 行`);
  });

  await rep.scenario("DB2 项目名不截断（原来卡视图显“云栖名…”）", async () => {
    const names = await br.evaluate(`[...document.querySelectorAll('table tbody tr')].map(r=>window.__A.norm(r.children[0].innerText))`);
    const long = (await db.project.findMany({ where: { status: { not: "archived" } }, select: { name: true } })).map((p) => p.name);
    const missing = long.filter((n) => !names.some((cell) => cell.includes(n)));
    rep.eq(missing.length, 0, "UI↔DB", "每行都完整含项目全名", missing.join(" / ") || "全部完整");
    rep.assert(names.every((x) => /RP-2026-/.test(x)), "UI", "每行同时带编号，便于对账");
  });

  await rep.scenario("DB3 未录入支出的项目：毛利与毛利率一起置“—”，不给假数", async () => {
    const rows = await br.evaluate(`(() => {
      const t = document.querySelector('table');
      return [...t.querySelectorAll('tbody tr')].map(r => ({
        code: (window.__A.norm(r.children[0].innerText).match(/RP-\\d{4}-\\d{3}/) || [])[0] ?? "",
        profit: window.__A.norm(r.children[6].innerText),
        rate: window.__A.norm(r.children[7].innerText),
      }));
    })()`);
    let checked = 0;
    for (const r of rows) {
      const p = await db.project.findUnique({ where: { code: r.code } });
      if (!p) continue;
      const exp = await db.financeRecord.aggregate({ where: { projectId: p.id, type: "expense" }, _sum: { amount: true } });
      const hasExpense = cents(exp._sum.amount) > 0;
      if (!hasExpense) {
        checked += 1;
        rep.assert(r.profit === "—" && r.rate === "—", "口径", `${r.code} 无支出 → 毛利与率都不可算`, `毛利“${r.profit}”率“${r.rate}”`);
      } else {
        const chg = await db.changeOrder.aggregate({ where: { quote: { projectId: p.id } }, _sum: { amount: true } });
        const want = (cents(p.contractAmount) + cents(chg._sum.amount) - cents(exp._sum.amount)) / 100;
        const shown = Number(String(r.profit).replace(/[¥,\s]/g, ""));
        rep.assert(Math.abs(shown - want) < 0.01, "口径↔算", `${r.code} 毛利 = 合同+变更−支出`, `页面 ${shown} · 算 ${want}`);
      }
    }
    rep.assert(checked > 0, "PRE", `确有未录入支出的项目可验（${checked} 个）`, String(checked));
  });

  await rep.scenario("DB4 需要你处理：占位组不进清单，计数与库一致", async () => {
    const strip = await br.evaluate(`(() => {
      const A = window.__A;
      const sec = [...document.querySelectorAll('section')].find(s=>A.norm(s.innerText).startsWith('需要你处理'));
      if (!sec) return null;
      return {
        text: A.norm(sec.innerText),
        items: [...sec.querySelectorAll('li')].filter(x=>/打开模块/.test(x.innerText)).map(x=>A.norm(x.innerText).slice(0,40)),
      };
    })()`);
    rep.assert(!!strip, "UI", "“需要你处理”清单在位");
    rep.assert(!/人效|未接入/.test(strip?.text || ""), "GUARD", "占位组（人员管控未上线）不混进待办清单", (strip?.text || "").slice(0, 40));
    const want = {
      node: await db.acceptanceNode.count({ where: { status: "submitted", project: { status: { not: "archived" } } } }),
      issue: await db.issue.count({ where: { status: { not: "closed" }, project: { status: { not: "archived" } } } }),
      design: await db.designTask.count({ where: { status: "submitted", project: { status: { not: "archived" } } } }),
      pay: await db.paymentNode.count({ where: { paid: false, project: { status: { not: "archived" } } } }),
    };
    rep.ok("DB", "库侧真值", JSON.stringify(want));
    const hit = (label, n) =>
      rep.assert((strip?.items || []).some((x) => x.includes(label) && x.startsWith(String(n))), "UI↔DB", `${label} 计数与库一致`, String(n));
    hit("待收付款段", want.pay);
    hit("未关闭质量问题", want.issue);
    hit("待审验收节点", want.node);
    hit("待审设计任务", want.design);
  });

  await rep.scenario("DB5 主指标带：签单额独占 + 对比条真的画出来了", async () => {
    const hero = await br.evaluate(`(() => {
      const A = window.__A;
      const bars = [...document.querySelectorAll('.flex.h-8 > span')].map(b => ({ h: Math.round(b.getBoundingClientRect().height), bg: getComputedStyle(b).backgroundColor }));
      const big = [...document.querySelectorAll('p')].filter(p => /¥/.test(p.innerText) && getComputedStyle(p).fontSize === '28px');
      return { bars, bigCount: big.length, bigText: big[0] ? A.norm(big[0].innerText) : null };
    })()`);
    rep.assert(hero.bars.length >= 2, "UI", "上月/本月对比条都渲染出来（此前百分比高度无父盒，条子塌成 0）", JSON.stringify(hero.bars));
    rep.assert(hero.bars.every((b) => b.h > 0), "UI", "每根条高度大于 0", hero.bars.map((b) => b.h).join("/"));
    rep.eq(hero.bigCount, 1, "UI", "28px 大字号全页只有一处（单点强调，不给四张卡抢）", String(hero.bigCount));
    rep.assert(/¥/.test(hero.bigText || ""), "UI", "那唯一的大数就是本月签单额", String(hero.bigText));
    const kpiText = await moneyNear(br, "本月签单额");
    rep.assert(!!kpiText, "UI", "签单额可读回对账", String(kpiText));
  });

  await rep.scenario("DB6 窄屏不破版（表格允许内部滚，文档不许溢出）", async () => {
    await br.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 820, deviceScaleFactor: 1, mobile: true });
    await go("/dashboard");
    const m = await br.evaluate(`({ doc: document.documentElement.scrollWidth, vw: window.innerWidth, body: document.body.scrollWidth })`);
    rep.assert(m.doc <= m.vw + 1, "375", "文档级无横向溢出", JSON.stringify(m));
    await br.send("Emulation.clearDeviceMetricsOverride");
    await go("/dashboard");
    await shot("dashboard-final");
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台报错", errs.slice(0, 3).join(" ;; "));
});
