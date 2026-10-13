/**
 * s2-quote.mjs —— A2 报价编辑器（§4-7 点名的第二项，含整表替换这条破坏性主链）
 */
import { withPlatform, moneyNear, fmt } from "./runner.mjs";

const CODE = "RP-2026-001";

await withPlatform("s2-quote", 9362, async ({ br, db, rep, go, shot }) => {
  const proj = await db.project.findUnique({ where: { code: CODE } });
  if (!proj) return rep.fail("PRE", "前置缺失：项目不存在");
  const quote = await db.budgetQuote.findUnique({ where: { projectId: proj.id } });
  if (!quote) return rep.fail("PRE", "前置缺失：该项目无报价单");
  const url = "/budget/" + proj.id;

  /* 独立预言机：从 DB 明细自己算一遍汇总，跟页面显示的数对账 */
  const oracle = async () => {
    const items = await db.quoteItem.findMany({ where: { quoteId: quote.id }, orderBy: { order: "asc" } });
    const direct = items.reduce((s, i) => s + Math.round(i.unitPrice * 100) * i.quantity, 0) / 100;
    const tax = Math.round(direct * quote.taxRate * 100) / 100;
    return { n: items.length, direct, tax, grand: direct + tax, unit: (direct + tax) / proj.area };
  };

  const base = await oracle();
  rep.ok("PRE", "基线（独立复算）", `行数 ${base.n} · 直接费 ${fmt(base.direct)} · 税 ${fmt(base.tax)} · 总价 ${fmt(base.grand)} · 单方 ${fmt(base.unit)}`);

  await rep.scenario("A2-1 页面汇总 ↔ DB 复算一致", async () => {
    await go(url);
    rep.eq(await moneyNear(br, "直接费"), fmt(base.direct), "UI↔DB", "直接费显示值");
    rep.eq(await moneyNear(br, "税金"), fmt(base.tax), "UI↔DB", "税金显示值");
    rep.eq(await moneyNear(br, "总价"), fmt(base.grand), "UI↔DB", "总价显示值");
    rep.eq(await moneyNear(br, "单方造价"), fmt(base.unit), "UI↔DB", "单方造价 = 总价 ÷ 面积");
  });

  const first = (await db.quoteItem.findMany({ where: { quoteId: quote.id }, orderBy: { order: "asc" }, take: 1 }))[0];
  const newPrice = Number(first.unitPrice) + 33;

  await rep.scenario("A2-2 改单价 → 汇总实时变 → 保存 → 落库", async () => {
    await go(url);
    const before = await moneyNear(br, "直接费");
    await br.fillRow(first.code, "单价", String(newPrice));
    await br.settle(500);
    const live = await moneyNear(br, "直接费");
    rep.assert(live !== before, "UI", "未保存前汇总条就跟着动（实时性）", `${before} → ${live}`);
    rep.eq(live, fmt(base.direct - Number(first.unitPrice) + newPrice), "UI↔算", "实时汇总数值正确");
    rep.assert((await br.text()).includes("有未保存改动"), "UI", "脏状态提示出现", await br.slice("有未保存改动", 40));
    await br.clickText("保存", { type: "button" });
    await br.settle(1600);
    const t = await br.text();
    rep.assert(/已保存 \d+ 行|全部已保存/.test(t), "UI", "保存回显成功态", (t.match(/已保存 \d+ 行|全部已保存/) || ["未见"])[0]);
    const row = await db.quoteItem.findFirst({ where: { quoteId: quote.id, code: first.code } });
    rep.eq(Number(row?.unitPrice), newPrice, "DB", "单价改动真的落库", String(row?.unitPrice));
    rep.assert(!(await db.quoteItem.findUnique({ where: { id: first.id } })), "DB",
      "整表替换语义：旧行 id 已被重建（改前 id 不复存在）");
    const after = await oracle();
    rep.eq(after.direct, base.direct - Number(first.unitPrice) + newPrice, "DB↔算", "落库后复算汇总与预期一致", fmt(after.direct));
    await go(url);
    rep.eq(await moneyNear(br, "直接费"), fmt(after.direct), "RST", "刷新后仍是新值（非内存态）");
  });

  await rep.scenario("A2-3 从科目库选入一行 → 快照带出 → 保存", async () => {
    await go(url);
    const tpl = await db.catalogItem.findFirst({ where: { code: "03.04" } });
    if (!tpl) return rep.fail("PRE", "前置缺失：模板 03.04 不在");
    await br.clickText("从科目库选入");
    await br.settle(800);
    rep.assert(await br.hasText(tpl.code), "UI", "选入面板展开且列出了模板项", tpl.code + " " + tpl.name);
    const picked = await br.pickRow(tpl.code);
    await br.settle(800);
    rep.ok("UI", "选入动作已发出", picked.picked);
    const rows = await db.quoteItem.count({ where: { quoteId: quote.id } });
    rep.eq(rows, base.n, "DB", "未点保存前不落库（改动只在本地草稿）", String(rows));
    const ui = await br.rowText(tpl.code);
    rep.assert(ui && ui.length >= 0, "UI", "编辑器里出现该编号的行", String(ui).slice(0, 60));
    rep.eq(await br.rowValue(tpl.code, "单价"), String(tpl.defaultPrice), "UI↔模板", "单价按模板默认值带出");
    await br.clickText("保存", { type: "button" });
    await br.settle(1600);
    const cnt = await db.quoteItem.count({ where: { quoteId: quote.id } });
    rep.eq(cnt, base.n + 1, "DB", "保存后新行落库", String(cnt));
    const added = await db.quoteItem.findFirst({ where: { quoteId: quote.id, code: tpl.code } });
    rep.assert(!!added, "DB", "快照行存在");
    rep.eq(added?.categoryName, (await db.catalogCategory.findUnique({ where: { id: tpl.categoryId } }))?.name, "DB", "科目名按快照存入");
  });

  await rep.scenario("A2-4 保存守卫：空名称 / 负单价", async () => {
    await go(url);
    await br.fillRow(first.code, "项目名称", "");
    await br.clickText("保存", { type: "button" });
    await br.settle(1600);
    const t = await br.text();
    rep.rejects(t, "缺少项目名称", "GUARD", "空行名应被拒并指出第几行");
    const still = await db.quoteItem.findFirst({ where: { quoteId: quote.id, code: first.code } });
    rep.eq(still?.name, first.name, "DB", "被拒后库中该行名称未被清空");
    await br.fillRow(first.code, "项目名称", first.name);

    await br.fillRow(first.code, "单价", "-50");
    await br.clickText("保存", { type: "button" });
    await br.settle(1600);
    rep.rejects(await br.text(), "不能为负数", "GUARD", "负单价应被拒");
    await br.fillRow(first.code, "单价", String(newPrice));
    await br.clickText("保存", { type: "button" });
    await br.settle(1400);
    rep.eq(Number((await db.quoteItem.findFirst({ where: { quoteId: quote.id, code: first.code } }))?.unitPrice), newPrice, "DB", "纠正后保存成功");
  });

  await rep.scenario("A2-5 行序调序 → order 连续且刷新保持", async () => {
    await go(url);
    const b0 = await db.quoteItem.findMany({ where: { quoteId: quote.id }, orderBy: { order: "asc" }, select: { code: true, order: true } });
    const dupOrder = b0.filter((r, i) => i > 0 && r.order <= b0[i - 1].order).length;
    rep.eq(dupOrder, 0, "DB", "order 严格递增无重复", b0.map((r) => r.order).join(","));
    await br.clickInRow(b0[0].code, "↓");
    await br.settle(500);
    await br.clickText("保存", { type: "button" });
    await br.settle(1600);
    const b1 = await db.quoteItem.findMany({ where: { quoteId: quote.id }, orderBy: { order: "asc" }, select: { code: true } });
    rep.eq(b1[1].code, b0[0].code, "DB", "首行下移到第二位后落库顺序一致", b1.slice(0, 3).map((r) => r.code).join(" > "));
    await go(url);
    const uiCodes = await br.evaluate(`[...document.querySelectorAll('tr')].map(r=>window.__A.norm(r.innerText)).filter(t=>/\\d\\.\\d/.test(t)).slice(0,3).map(t=>t.slice(0,5))`);
    rep.ok("UI", "刷新后页面行序（前 3）", String(uiCodes));
    // 复位回原顺序
    await br.clickInRow(b1[1].code, "↑");
    await br.settle(500);
    await br.clickText("保存", { type: "button" });
    await br.settle(1400);
    const b2 = await db.quoteItem.findMany({ where: { quoteId: quote.id }, orderBy: { order: "asc" }, select: { code: true } });
    rep.eq(b2.map((r) => r.code).join(","), b0.map((r) => r.code).join(","), "RST", "已复位原行序");
  });

  await rep.scenario("A2-6 整表替换语义：删行后保存即真删", async () => {
    await go(url);
    const before = await db.quoteItem.count({ where: { quoteId: quote.id } });
    const victim = await db.quoteItem.findMany({ where: { quoteId: quote.id }, orderBy: { order: "desc" }, take: 1 });
    await br.clickInRow(victim[0].code, "删除");
    await br.settle(500);
    await br.clickText("保存", { type: "button" });
    await br.settle(1600);
    const after = await db.quoteItem.count({ where: { quoteId: quote.id } });
    rep.eq(after, before - 1, "DB", "删一行保存后库里真少一行（整表替换非软删）", `${before} → ${after}`);
    rep.eq(await db.quoteItem.count({ where: { id: victim[0].id } }), 0, "DB", "被删行 id 已不存在");
    await shot("after-delete");
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "全过程无控制台报错", errs.slice(0, 3).join(" ;; "));
});
