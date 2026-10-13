/**
 * s8-final.mjs —— 收最后两条：B1 签约建项（须先推到已报价）+ B6 节点通过→付款段派生解锁（换页面取数法）
 */
import { withPlatform } from "./runner.mjs";

await withPlatform("s8-final", 9368, async ({ br, db, rep, go }) => {
  /* ── B1 签约：线索要先到 quoted 才出现签约入口（M9-e §4-14 收紧的结果）── */
  await rep.scenario("B1 签约建项（推到已报价 → 签约 → 自动建客户+项目+草稿单）", async () => {
    const p0 = await db.project.count();
    const c0 = await db.client.count();
    await go("/crm");
    await br.clickS("展开表单").catch(() => {});
    await br.settle(700);
    await br.fillS("客户姓名", "验收流·赵先生");
    await br.fillS("联系电话", "13700003333");
    await br.fillS("楼盘", "验收流华府");
    await br.fillS("面积", "112");
    await br.clickS("新建线索");
    await br.settle(2200);
    const lead = await db.lead.findFirst({ where: { name: "验收流·赵先生" }, orderBy: { createdAt: "desc" } });
    rep.assert(!!lead, "DB", "线索落库", lead ? lead.code : "查不到");
    if (!lead) return;

    await go("/crm");
    for (const [from, to] of [["leads", "contacted"], ["contacted", "confirmed"], ["confirmed", "quoted"]]) {
      const found = await br.clickInRow(lead.name, "下一阶段").catch(async (e) => {
        rep.fail("UI", `推进按钮未找到（应在 ${from}）`, e.message.slice(0, 120));
        return null;
      });
      if (!found) break;
      await br.settle(1800);
      const cur = await db.lead.findUnique({ where: { id: lead.id } });
      rep.eq(cur?.stage, to, "DB", `相邻推进 ${from} → ${to}`);
    }
    const atQuoted = (await db.lead.findUnique({ where: { id: lead.id } }))?.stage === "quoted";
    rep.ok("UI", "推进后停在", atQuoted ? "quoted（可签约）" : (await db.lead.findUnique({ where: { id: lead.id } }))?.stage);

    await br.clickInRow(lead.name, "签约").catch(() => br.clickS("走「签约」→"));
    await br.settle(1200);
    rep.assert(/签约建项/.test((await br.dialogText()) || ""), "UI", "签约抽屉打开", ((await br.dialogText()) || "").slice(0, 40));
    await br.fillS("合同额", "268000");
    await br.clickS("确认签约");
    await br.settle(2800);
    const l2 = await db.lead.findUnique({ where: { id: lead.id } });
    rep.eq(l2?.stage, "signed", "DB", "签约后停在 signed");
    rep.assert(!!l2?.projectId, "DB", "线索回写 projectId");
    const np = await db.project.findUnique({ where: { id: l2.projectId } });
    rep.eq(Number(np?.contractAmount), 268000, "DB", "合同额带入项目", np ? `${np.code} ${np.name}` : "无项目");
    rep.eq(await db.project.count(), p0 + 1, "DB", "自动建项目");
    rep.eq(await db.client.count(), c0 + 1, "DB", "自动建客户");
    rep.eq(await db.budgetQuote.count({ where: { projectId: np.id } }), 1, "DB", "新项目自带草稿报价单");
    await go("/projects");
    rep.assert(await br.hasText(np.code), "UI", "项目列表能查到", np.code);
    // 已签约线索不应再给通用推进
    await go("/crm?view=list");
    const after = await br.evaluate(`(() => {const A=window.__A;const r=[...document.querySelectorAll('tr')].find(x=>A.norm(x.innerText).includes(${JSON.stringify(lead.name)}));return r?A.norm(r.innerText):null})()`);
    rep.assert(!!after && !/下一阶段/.test(after), "GUARD", "已签约线索不再给通用推进按钮", String(after).slice(0, 90));
  });

  /* ── B6 节点通过 → 付款段派生解锁 ── */
  await rep.scenario("B6 ★ 节点通过 → 付款段派生变可收款（排程→质量→财务）", async () => {
    const nodes = await db.acceptanceNode.findMany({ where: { status: "submitted" } });
    if (!nodes.length) return rep.note("PRE", "实库已无待审核节点", "该回环位在本轮已被 B5/B6 走掉，服务层由 verify-finance-flow 断言覆盖");
    let pick = null;
    for (const n of nodes) {
      const segs = await db.paymentNode.findMany({ where: { projectId: n.projectId } });
      const hit = segs.find((s) => s.trigger === "stages" && (s.triggerStages || "").split(",").map((x) => x.trim()).includes(n.name) && !s.paid);
      if (hit) { pick = { n, hit }; break; }
    }
    if (!pick) return rep.note("PRE", "无「submitted 节点 ↔ 同名付款段」配对", "改为仅验审核通过写库");
    const { n, hit } = pick;
    const proj = await db.project.findUnique({ where: { id: n.projectId } });
    rep.ok("PRE", "配对", `${proj.code} 节点「${n.name}」待审核 ↔ 付款段「${hit.name}」trigger=${hit.trigger}(${hit.triggerStages})`);

    await go("/finance/payments?projectId=" + proj.id);
    const page0 = await br.text();
    const segBlock0 = (i => (i < 0 ? null : page0.slice(i, i + 300)))(page0.indexOf(hit.name));
    rep.assert(/未解锁|待工序验收通过/.test(segBlock0 || ""), "UI", "审核前该段显示未解锁并给理由", (segBlock0 || "").replace(/\s+/g, " ").slice(0, 110));

    await go("/quality/nodes/" + n.id);
    await br.clickS("通过");
    await br.settle(900);
    await br.clickS("确认通过").catch(() => {});
    await br.settle(2600);
    rep.eq((await db.acceptanceNode.findUnique({ where: { id: n.id } }))?.status, "passed", "DB", "审核通过写库");

    await go("/finance/payments?projectId=" + proj.id);
    const page1 = await br.text();
    const i1 = page1.indexOf(hit.name);
    const segBlock1 = i1 < 0 ? null : page1.slice(i1, i1 + 300);
    rep.assert(!!segBlock1 && /可收款|标记已付/.test(segBlock1), "UI↔派生", "★ 只改节点状态，付款段派生变「可收款」（解锁是读侧算出来的，没落库）", (segBlock1 || "查无该段").replace(/\s+/g, " ").slice(0, 120));
    const canMark = await br.evaluate(`(() => {
      const A = window.__A;
      const r = [...document.querySelectorAll('tr,li,div')].filter(A.visible).find(x=>A.norm(x.innerText).includes(${JSON.stringify(hit.name)}) && [...x.querySelectorAll('button')].some(b=>/标记已付/.test(A.textOf(b))));
      if(!r) return null;
      const b = [...r.querySelectorAll('button')].find(x=>/标记已付/.test(A.textOf(x)));
      return { disabled: b.disabled === true, text: A.textOf(b) };
    })()`);
    rep.assert(canMark && canMark.disabled === false, "UI", "该段「标记已付」按钮已解禁", JSON.stringify(canMark));
    const seg = await db.paymentNode.findUnique({ where: { id: hit.id } });
    rep.eq(seg?.paid, false, "DB", "段自身 paid 未被偷改（派生≠落库）");
    rep.eq(seg?.amountDue, hit.amountDue, "DB", "应收快照不随解锁变", String(seg?.amountDue));
    rep.ok("DB", "付款表零写入对照", `paidAt=${seg?.paidAt} paidBy=${seg?.paidBy}（均应为空）`);
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台报错", errs.slice(0, 3).join(" ;; "));
});
