/**
 * s12-archive-facts.mjs —— “钱按事实 · 事按可见性”在驾驶舱上的闭环（M10-c 收口 + M10-b 对齐）
 *
 * 这条套件钉的是 M10-c 那批留在纸上没合上的另一半：
 * 归档一个**有历史收支**的项目之后——
 *   钱（签单额 / 回款率 / 现金线 / 毛利排行）一格不许动；
 *   事（需要你处理 / 项目健康度 / 风险）必须收窄；
 *   页面必须把"哪些格子含它"说出来，不许沉默地少数字；
 *   恢复后一切分毫回来，且 financeRecord 行数全程不变（证明归档只翻位、没动钱）。
 * 归档对象按实库真值动态选（承 §4-20 锚点漂移教训，不写死 code）。
 */
import { withPlatform, moneyNear } from "./runner.mjs";

const cents = (n) => Math.round(Number(n || 0) * 100);

await withPlatform("s12-archive-facts", 9376, async ({ br, db, rep, go, shot }) => {
  /* 挑一个"有钱、有未收段、最好还有未闭环问题"的项目来归档 */
  const cands = await db.project.findMany({
    where: { status: { not: "archived" } },
    select: {
      id: true, code: true, name: true, status: true, contractAmount: true,
      financeRecords: { select: { type: true, amount: true } },
      paymentNodes: { select: { paid: true, amountDue: true } },
      issues: { select: { status: true } },
    },
  });
  const scored = cands
    .map((p) => ({
      p,
      income: p.financeRecords.filter((r) => r.type === "income").reduce((s, r) => s + cents(r.amount), 0),
      unpaid: p.paymentNodes.filter((n) => !n.paid).length,
      open: p.issues.filter((i) => i.status !== "closed").length,
    }))
    .sort((a, b) => b.income - a.income || b.unpaid - a.unpaid);
  const target = scored[0]?.p;
  if (!target || scored[0].income === 0) {
    rep.fail("PRE", "找不到带历史收入的可归档项目", JSON.stringify(scored.slice(0, 2).map((x) => [x.p.code, x.income])));
    return;
  }
  const meta = scored[0];
  rep.ok("PRE", "归档对象（按实库真值动态选）", `${target.code} 已收 ${meta.income / 100} · 未收段 ${meta.unpaid} · 未闭环问题 ${meta.open}`);

  const readDash = async () => {
    await go("/dashboard");
    return {
      signed: await moneyNear(br, "本月签单额"),
      rate: await br.evaluate(`window.__A.afterNumber("全司回款率")`),
      rows: await br.evaluate(`document.querySelectorAll('table tbody tr').length`),
      todos: await br.evaluate(`(() => {
        const A = window.__A;
        const sec = [...document.querySelectorAll('section')].find(x => A.norm(x.innerText).startsWith('需要你处理'));
        if (!sec) return null;
        return [...sec.querySelectorAll('li')].filter(x => /打开模块/.test(x.innerText))
          .map(x => { const n = A.norm(x.innerText).match(/^(\\d+)/); return n ? Number(n[1]) : 0; })
          .reduce((s, n) => s + n, 0);
      })()`),
      note: await br.evaluate(`(() => {
        const A = window.__A;
        const p = [...document.querySelectorAll('p')].find(x => /个已归档项目/.test(A.norm(x.innerText)));
        return p ? A.norm(p.innerText) : null;
      })()`),
      cashTotal: await br.evaluate(`(() => {
        const A = window.__A;
        const p = [...document.querySelectorAll('p')].find(x => A.norm(x.innerText).startsWith('近 6 个月合计'));
        return p ? A.norm(p.innerText) : null;
      })()`),
    };
  };

  const before = await readDash();
  const recCount0 = await db.financeRecord.count();
  rep.ok("BASE", "归档前基线", `签单 ${before.signed} · 率 ${before.rate}% · 表 ${before.rows} 行 · 待办 ${before.todos} · 说明行 ${before.note ? "有" : "无"}`);
  rep.assert(before.note === null, "UI", "无归档时页面不加任何口径说明（不制造噪声）");

  await rep.scenario("AR1 归档确认框如实列出未闭环事项（HAE 拍板“允许但提示”）", async () => {
    await go("/projects?view=table");
    br.lastDialog = null;
    await br.clickInRow(target.code, "归档");
    await br.settle(900);
    const msg = br.lastDialog?.message ?? "";
    rep.ok("DIAG", "确认框原文（Chrome 对长文案有截断，先看全貌再判）", JSON.stringify(msg).slice(0, 400));
    rep.assert(/确认归档/.test(msg), "UI", "确认框出现且点名项目", msg.slice(0, 40));
    rep.assert(/已收、支出、合同额、毛利/.test(msg), "UI", "说清“钱仍照常计入报表”");
    rep.assert(/改变的是“还要做什么”，不是“发生过什么”/.test(msg), "UI", "一句话口径进确认框");
    if (meta.unpaid > 0) {
      rep.assert(new RegExp(`${meta.unpaid} 段款未收`).test(msg), "UI", `列出未收款段 ${meta.unpaid} 段`, (msg.match(/注意：[^\n]*/) || ["未列出"])[0]);
    }
    if (meta.open > 0) {
      rep.assert(new RegExp(`${meta.open} 个未整改质量问题`).test(msg), "UI", `列出未整改问题 ${meta.open} 个`);
    }
  });

  await rep.scenario("AR2 归档后：钱一格未动，事全部收窄，说明行如实出现", async () => {
    const after = await readDash();
    rep.eq(after.signed, before.signed, "钱按事实", "本月签单额未因归档而变化", `${before.signed} → ${after.signed}`);
    rep.eq(after.rate, before.rate, "钱按事实", "全司回款率未因归档而变化", `${before.rate} → ${after.rate}`);
    rep.eq(after.cashTotal, before.cashTotal, "钱按事实", "近 6 个月现金合计未因归档而变化");
    rep.eq(after.rows, before.rows - 1, "事按可见性", "项目健康度表少一行", `${before.rows} → ${after.rows}`);
    rep.assert(after.todos <= before.todos - (meta.unpaid + meta.open), "事按可见性",
      "“需要你处理”按该项目的未闭环事项数收窄", `${before.todos} → ${after.todos}（应至少减 ${meta.unpaid + meta.open}）`);
    const wantIncome = "¥" + (meta.income / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    rep.assert(!!after.note && after.note.includes(wantIncome), "UI",
      `说明行出现且带上归档项目的历史已收 ${wantIncome}`, (after.note || "无说明行").slice(0, 140));
    await shot("archived");
  });

  await rep.scenario("AR3 /finance 同步：已收不变、待收款下降", async () => {
    await go("/finance");
    const recv = await moneyNear(br, "已收款");
    const wantRecv = (await db.financeRecord.aggregate({ where: { type: "income" }, _sum: { amount: true } }))._sum.amount;
    rep.eq(recv, (Math.round(Number(wantRecv || 0) * 100) / 100).toFixed(2), "钱按事实", "台账“已收款”含已归档项目的历史收入", String(recv));
    const unpaidNow = await moneyNear(br, "待收款");
    // 待收款 = Σ max(0, 合同额 + 累计变更 − 已收)，且只算未归档项目（ledger.receivable 同口径）
    const liveSum = await db.project.findMany({
      where: { status: { not: "archived" } },
      select: {
        contractAmount: true,
        financeRecords: { where: { type: "income" }, select: { amount: true } },
        quotes: { select: { changes: { select: { amount: true } } } },
      },
    });
    const wantUnpaid = liveSum.reduce((s, p) => {
      const inc = p.financeRecords.reduce((t, r) => t + cents(r.amount), 0);
      const chg = p.quotes.reduce((t, q) => t + q.changes.reduce((u, c) => u + cents(c.amount), 0), 0);
      return s + Math.max(0, cents(p.contractAmount) + chg - inc);
    }, 0) / 100;
    rep.eq(unpaidNow, wantUnpaid.toFixed(2), "事按可见性", "“待收款”只算未归档项目", `页面 ${unpaidNow} · 应 ${wantUnpaid.toFixed(2)}`);
  });

  await rep.scenario("AR4 恢复归档：一切分毫回来，且全程没动过钱", async () => {
    await go("/projects?view=table");
    await br.clickInRow(target.code, "恢复");
    await br.settle(1600);
    const back = await readDash();
    rep.eq(back.signed, before.signed, "可逆", "签单额回到基线");
    rep.eq(back.rows, before.rows, "可逆", "健康表行数回来", `${before.rows} ↔ ${back.rows}`);
    rep.eq(back.todos, before.todos, "可逆", "待办计数回来", `${before.todos} ↔ ${back.todos}`);
    rep.eq(back.note, null, "UI", "无归档后说明行自动消失（不留过期文案）");
    rep.eq(await db.financeRecord.count(), recCount0, "DB", "全程 financeRecord 行数不变——归档真的只翻一个位");
    const logs = await db.operationLog.findMany({ where: { projectId: target.id, action: { in: ["project.archive", "project.restore"] } }, orderBy: { at: "desc" } });
    rep.assert(logs.length >= 2, "流水", "归档与恢复都留了流水", logs.map((l) => l.action).join(","));
    rep.eq(logs.find((l) => l.action === "project.archive")?.before, target.status, "流水",
      "归档流水的 before 存机器值（恢复靠它，不是中文态名）", String(logs.find((l) => l.action === "project.archive")?.before));
    rep.eq((await db.project.findUnique({ where: { id: target.id } }))?.status, target.status, "DB", "状态精确回到归档前", target.status);
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台报错", errs.slice(0, 3).join(" ;; "));
});
