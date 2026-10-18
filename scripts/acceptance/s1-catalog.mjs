/**
 * s1-catalog.mjs —— A1 科目库增删改排序（STATUS §4-7 点名的第一项）
 */
import { withPlatform } from "./runner.mjs";

const CAT = "验收测试科目";

await withPlatform("s1-catalog", 9361, async ({ br, db, rep, go, shot }) => {
  /* ── A1-1 新增科目 ── */
  await rep.scenario("A1-1 新增科目", async () => {
    await go("/budget/catalog");
    await br.clickText("新增科目");
    rep.ok("UI", "“新增科目”表单已展开", String(await br.evaluate("!!document.querySelector('input[name=name]')")));
    await br.fill("科目名称", CAT);
    await br.clickText("创建科目", { type: "button" });
    await br.settle(1200);
    const row = await db.catalogCategory.findFirst({ where: { name: CAT } });
    rep.assert(!!row, "DB", "科目落库", row ? `id=${row.id} order=${row.order}` : "库里查不到");
    rep.assert(await br.hasText(CAT), "UI", "刷新前页面即出现新科目");
    await go("/budget/catalog");
    rep.assert(await br.hasText(CAT), "RST", "重新打开页面仍在（非内存态）");
  });

  /* ── A1-2 新增科目项（QA 清单第 2 步：建完科目要能往里加项）── */
  await rep.scenario("A1-2 给新科目加科目项", async () => {
    await go("/budget/catalog");
    const cat = await db.catalogCategory.findFirst({ where: { name: CAT } });
    if (!cat) return rep.fail("PRE", "前置缺失：测试科目不存在");
    await br.clickInRow(CAT, "新增科目项");
    const dlg0 = await br.dialogText();
    rep.assert(/新增科目项/.test(dlg0 || ""), "UI", "抽屉以“新增科目项”态打开", (dlg0 || "").slice(0, 40));
    rep.assert((dlg0 || "").includes(CAT), "UI", "抽屉标明所属科目", CAT);
    await br.fillS("编号", "TEST-01");
    await br.fillS("名称", "测试项");
    await br.fillS("单位", "㎡");
    await br.fillS("默认单价", "100");
    await br.fillS("默认数量", "2");
    await br.clickS("新增科目项");
    await br.settle(1400);
    const item = await db.catalogItem.findFirst({ where: { code: "TEST-01" } });
    rep.assert(!!item, "DB", "科目项落库", item ? `id=${item.id} categoryId=${item.categoryId === cat.id ? "属于测试科目" : "挂错科目"}` : "查不到 TEST-01");
    if (item) rep.eq(item.categoryId, cat.id, "DB", "挂在正确的科目下");
    rep.eq(Number(item?.defaultPrice), 100, "DB", "默认单价按表单值存", String(item?.defaultPrice));

    // 故意做错：再建一条同编号
    await br.clickInRow(CAT, "新增科目项");
    await br.fillS("编号", "TEST-01");
    await br.fillS("名称", "重复编号项");
    await br.fillS("单位", "项");
    await br.fillS("默认单价", "1");
    await br.clickS("新增科目项");
    await br.settle(1400);
    const t = (await br.text()) + "\n" + (await br.dialogText() || "");
    rep.rejects(t, "已存在", "GUARD", "同编号重复应被拒");
    rep.eq(await db.catalogItem.count({ where: { code: "TEST-01" } }), 1, "DB", "被拒后没有多插一条", String(await db.catalogItem.count({ where: { code: "TEST-01" } })));
    await br.clickS("取消").catch(() => {});
    await go("/budget/catalog");
    rep.assert(await br.hasText("测试项"), "RST", "刷新后页面显示新建的科目项");
  });

  /* ── A1-3 重命名 ── */
  await rep.scenario("A1-3 重命名科目", async () => {
    await go("/budget/catalog");
    const before = await db.catalogCategory.findFirst({ where: { name: CAT } });
    if (!before) return rep.fail("PRE", "前置缺失：新科目不存在，跳过重命名");
    await br.clickInRow(CAT, "重命名");
    const renamed = CAT + "改名";
    await br.fillNear("name", CAT, renamed);
    await br.submitNear("name", CAT);
    await br.settle(1200);
    const after = await db.catalogCategory.findUnique({ where: { id: before.id } });
    rep.eq(after?.name, renamed, "DB", "重命名写库（同一 id，非新建）");
  });

  /* ── A1-4 调序 ── */
  await rep.scenario("A1-4 科目上下移调序", async () => {
    await go("/budget/catalog");
    const orders = async () =>
      (await db.catalogCategory.findMany({ orderBy: { order: "asc" } })).map((c) => c.name);
    const t0 = await orders();
    const target = t0[t0.length - 1];
    await br.clickInRow(target, "↑ 上移");
    await br.settle(1000);
    const t1 = await orders();
    rep.assert(t1[t1.length - 2] === target && t1[t1.length - 1] !== target, "DB",
      `“${target}”上移一位后 order 序列真的变了`, t1.join(" > "));
    await go("/budget/catalog");
    rep.assert(await br.hasText(target), "RST", "刷新后仍在列表里");
    const ui = await br.evaluate(`[...document.querySelectorAll('h3')].map(e=>window.__A.norm(e.innerText))`);
    rep.eq(ui.join(">"), t1.filter((n) => ui.includes(n)).join(">"), "UI↔DB", "页面科目顺序与 DB 顺序一致");
  });

  /* ── A1-5 编辑科目项：改默认单价 + 编号重复拒绝 ── */
  await rep.scenario("A1-5 编辑科目项（改价 / 编号唯一）", async () => {
    await go("/budget/catalog");
    const item = await db.catalogItem.findFirst({ orderBy: { code: "asc" } });
    if (!item) return rep.fail("PRE", "前置缺失：无科目项可编辑");
    await br.clickInRow(item.code, "编辑");
    rep.ok("UI", "科目项抽屉已打开", item.code + " " + item.name);
    const newPrice = Number(item.defaultPrice) + 7;
    await br.fillS("默认单价", String(newPrice));
    await br.clickS("保存修改");
    await br.settle(1200);
    const after = await db.catalogItem.findUnique({ where: { id: item.id } });
    rep.eq(after?.defaultPrice, newPrice, "DB", "默认单价改动落库", `${item.defaultPrice} → ${after?.defaultPrice}`);

    // 故意做错：把编号改成别的科目项已用的编号
    const other = await db.catalogItem.findFirst({ where: { code: { not: after.code } }, orderBy: { code: "desc" } });
    await br.clickInRow(after.code, "编辑");
    await br.fillS("编号", other.code);
    await br.clickS("保存修改");
    await br.settle(1400);
    const t = await br.text();
    const dlg = await br.dialogText();
    rep.rejects(t + "\n" + (dlg || ""), "已存在", "GUARD", "编号重复应被拒并说清哪不对");
    const still = await db.catalogItem.findUnique({ where: { id: after.id } });
    rep.eq(still?.code, after.code, "DB", "被拒后库中编号未被改写", String(still?.code));

    // 复位：重开抽屉改回原价（若上一步抽屉已关，这里重新打开）
    if (!dlg) await br.clickInRow(after.code, "编辑");
    await br.fillS("默认单价", String(item.defaultPrice));
    await br.fillS("编号", after.code);
    await br.clickS("保存修改");
    await br.settle(1200);
    const back = await db.catalogItem.findUnique({ where: { id: item.id } });
    rep.eq(back?.defaultPrice, item.defaultPrice, "RST", "已复位默认单价", String(back?.defaultPrice));
  });

  /* ── A1-6 删除：删科目项 → 删空科目 ── */
  await rep.scenario("A1-6 删除科目与科目项", async () => {
    await go("/budget/catalog");
    const cat = await db.catalogCategory.findFirst({ where: { name: { startsWith: CAT } } });
    if (!cat) return rep.fail("PRE", "前置缺失：测试科目不在");
    const items = await db.catalogItem.findMany({ where: { categoryId: cat.id } });
    for (const it of items) {
      await br.clickInRow(it.code, "删除");
      const t1 = await br.text();
      if (/确认|确定|删除/.test(t1)) await br.clickText("确认删除").catch(() => {});
      await br.settle(1000);
    }
    const left = await db.catalogItem.count({ where: { categoryId: cat.id } });
    rep.eq(left, 0, "DB", "科目项删除生效（无残留）", `剩余 ${left} 项`);
    await br.clickInRow(cat.name, "删除");
    await br.settle(400);
    const t2 = await br.text();
    rep.assert(/确认|不可恢复|连带/.test(t2), "UI", "删科目有二次确认而非一键没");
    await br.clickText("确认删除").catch(() => br.clickText("删除", { nth: 1 }));
    await br.settle(1200);
    rep.eq(await db.catalogCategory.count({ where: { id: cat.id } }), 0, "DB", "科目删除生效");
    rep.eq(await db.catalogItem.count({ where: { categoryId: cat.id } }), 0, "DB", "其下科目项无孤儿残留");
  });

  await shot("final");
  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "全过程无控制台报错 / 资源加载失败", errs.slice(0, 3).join(" ;; "));
});
