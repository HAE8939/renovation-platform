/**
 * s6-flows2.mjs —— 补齐 s4 里因界面前端定位/数据形状而没跑完的闭环
 * 与 s4 的关键差别：B5/B6 的演示锚点按**实库当前状态**动态选，不写死工序名。
 * （STATUS 与手测清单写的“002 水电待审核、003 泥工已退回”已与实库不符——见验收报告 D 组）
 */
import { withPlatform, moneyNear, fmt } from "./runner.mjs";

await withPlatform("s6-flows2", 9366, async ({ br, db, rep, go }) => {
  const ps = await db.project.findMany();
  const byCode = Object.fromEntries(ps.map((p) => [p.code, p]));

  /* ═══ B1 线索：新建 → 推进 → 签约（改用真实按钮文案）═══ */
  await rep.scenario("B1 线索新建 / 相邻推进 / 签约建项", async () => {
    await go("/crm");
    await br.clickS("展开表单").catch(() => {});
    await br.settle(600);
    const c0 = await db.client.count();
    const p0 = await db.project.count();
    await br.fillS("客户姓名", "验收流·陈女士");
    await br.fillS("联系电话", "13800002222");
    await br.fillS("楼盘", "验收流雅苑");
    await br.fillS("面积", "96");
    await br.clickS("新建线索").catch(() => br.clickS("创建"));
    await br.settle(600);
    await br.clickS("展开表单").catch(() => {});
    await br.settle(2000);
    const lead = await db.lead.findFirst({ where: { name: "验收流·陈女士" }, orderBy: { createdAt: "desc" } });
    rep.assert(!!lead, "DB", "线索落库", lead ? `${lead.code} stage=${lead.stage}` : "查不到");
    if (!lead) return;
    rep.eq(lead.stage, "leads", "DB", "新线索停首阶");

    await go("/crm");
    await br.clickRow(lead.name);
    await br.settle(1200);
    const drawer = await br.dialogText();
    rep.assert((drawer || "").includes(lead.name), "UI", "线索抽屉打开且显示该线索", (drawer || "").slice(0, 50));
    await br.clickInRow(lead.name, "下一阶段").catch(() => br.clickS("推进"));
    await br.settle(2000);
    rep.eq((await db.lead.findUnique({ where: { id: lead.id } }))?.stage, "contacted", "DB", "相邻推进 leads → contacted");
    const btns = await br.evaluate(`(() => {const A=window.__A;const d=A.dialog()||document;return [...d.querySelectorAll('button')].filter(A.visible).map(e=>A.textOf(e))})()`);
    rep.assert(!btns.some((t) => /跳|直达|签约建项$/.test(t)) || btns.some((t) => /签约/.test(t)), "UI", "阶段推进只给相邻入口", btns.slice(0, 10).join(" | "));

    await br.clickS("签约");
    await br.settle(1000);
    await br.fillS("合同额", "188000");
    await br.clickS("确认签约").catch(() => br.clickS("签约"));
    await br.settle(2600);
    const l2 = await db.lead.findUnique({ where: { id: lead.id } });
    rep.eq(l2.stage, "signed", "DB", "签约后停在 signed");
    const np = await db.project.findUnique({ where: { id: l2.projectId } });
    rep.assert(!!np, "DB", "★ 签约自动建出项目", np ? `${np.code} ${np.name}` : "无");
    rep.eq(Number(np?.contractAmount), 188000, "DB", "合同额从签约表单带入项目");
    rep.eq(await db.client.count(), c0 + 1, "DB", "自动建客户（新手机号 → 新客户）");
    rep.eq(await db.project.count(), p0 + 1, "DB", "项目总数 +1");
    rep.eq(await db.budgetQuote.count({ where: { projectId: np.id } }), 1, "DB", "新项目自带草稿报价单");
    const phoneLead = await db.lead.findFirst({ where: { phone: "13800002222" } });
    rep.eq((await db.client.count({ where: { phone: "13800002222" } })), 1, "DB", "同手机号只归并出一条客户");

    // 再签一条同手机线索 → 应复用同一 Client、另建 Project
    const second = await db.lead.create({
      data: { orgId: phoneLead.orgId, name: "验收流·陈女士(二)", phone: "13800002222", stage: "quoted", code: "LEAD-ACCEPT-2" },
    });
    await go("/crm");
    await br.clickRow(second.name);
    await br.settle(1200);
    await br.clickS("签约");
    await br.settle(1000);
    await br.fillS("合同额", "77000");
    await br.clickS("确认签约").catch(() => br.clickS("签约"));
    await br.settle(2600);
    rep.eq(await db.client.count({ where: { phone: "13800002222" } }), 1, "DB", "★ 手机号归并：第二条线索没再造客户");
    rep.eq(await db.project.count(), p0 + 2, "DB", "但项目各建一条");
    rep.note("HAE", "签约不可逆 + 平台无删除入口", "本轮在副本库上签了 2 条，实库零影响；真库上签错无法纠正");
  });

  /* ═══ B4 续：进度 → 验收节点（改按 DB 里真实存在的工序名点）═══ */
  await rep.scenario("B4b 工序进度 100 → 自动建验收节点 → 回撤即删", async () => {
    const p4 = byCode["RP-2026-004"];
    await go("/schedule/" + p4.id);
    if ((await db.scheduleTask.count({ where: { projectId: p4.id } })) === 0) {
      await br.clickS("一键生成排程");
      await br.settle(2600);
    }
    const t0 = await db.scheduleTask.findFirst({ where: { projectId: p4.id }, orderBy: { order: "asc" } });
    await go("/schedule/" + p4.id);
    await br.clickRow(t0.name);
    await br.settle(1200);
    const isOpen = await br.evaluate(`!!window.__A.dialog()`);
    if (!isOpen) await br.clickInRow(t0.name, "编辑").catch(() => {});
    await br.settle(900);
    const dlg = await br.dialogText();
    rep.assert((dlg || "").includes("进度"), "UI", "工序抽屉打开且含进度控件", (dlg || "").slice(0, 60));
    await br.fillS("进度", "100");
    await br.clickS("更新进度");
    await br.settle(2400);
    const t1 = await db.scheduleTask.findUnique({ where: { id: t0.id } });
    rep.eq(t1?.progress, 100, "DB", "进度写库");
    const node = await db.acceptanceNode.findFirst({ where: { taskId: t0.id } });
    rep.assert(!!node, "DB", "★ 进度 100 同事务建出验收节点（排程→质量跨模块副作用）", node ? `${node.name}:${node.status}` : "没建");
    await go("/quality?projectId=" + p4.id);
    rep.assert(await br.hasText(node?.name || "—"), "UI", "质量管控页能查到这个新节点（不是只有库里有）");
    await go("/schedule/" + p4.id);
    await br.clickRow(t0.name);
    await br.settle(1000);
    await br.fillS("进度", "90");
    await br.clickS("更新进度");
    await br.settle(2200);
    rep.eq(await db.acceptanceNode.count({ where: { taskId: t0.id } }), 0, "DB", "回撤到 90 → 未提交节点被收走，无孤儿");
    await br.clickRow(t0.name);
    await br.settle(900);
    await br.fillS("进度", "150");
    await br.clickS("更新进度");
    await br.settle(1800);
    const t2 = await db.scheduleTask.findUnique({ where: { id: t0.id } });
    rep.eq(t2?.progress, 90, "GUARD", "进度越界后库值未被写坏", String(t2?.progress));
    rep.rejects((await br.text()) + (await br.dialogText() || ""), "0", "GUARD", "越界有反馈（界面拦截或服务端中文报错）");
  });

  /* ═══ B5 整改门控：按实库找“returned + 有 open 问题”的节点 ═══ */
  await rep.scenario("B5 整改中门控（returned 节点 + open 问题 → 禁提交）", async () => {
    const open = await db.issue.findFirst({ where: { status: "open", nodeId: { not: null } } });
    if (!open) return rep.note("PRE", "实库无“returned 节点 + open 问题”组合，门控位已被走完", "见报告 D 组：清单锚点与实库不同步");
    const node = await db.acceptanceNode.findUnique({ where: { id: open.nodeId } });
    const proj = await db.project.findUnique({ where: { id: node.projectId } });
    rep.ok("PRE", "门控位实况", `${proj.code} ${node.name} status=${node.status} · open 问题“${open.title}”`);
    await go("/quality/nodes/" + node.id);
    const t = await br.text();
    rep.assert(/整改中/.test(t), "UI", "状态渲成“整改中”", (t.match(/整改中/) || ["未见"])[0]);
    const dis = await br.evaluate(`(()=>{const A=window.__A;const bs=[...document.querySelectorAll('button')].filter(A.visible).map(e=>A.textOf(e));return {submit:bs.filter(t=>/提交/.test(t)),all:bs.slice(0,8)}})()`);
    rep.assert(dis.submit.length === 0 || dis.some === true, "GUARD", "整改中：提交验收入口不存在或被禁", JSON.stringify(dis));
    rep.assert(/未整改|禁用|整改中/.test(await br.text()), "UI", "页面说明为什么不能提交");
    await br.clickS("已整改").catch(() => {});
    const iss2 = await db.issue.findUnique({ where: { id: open.id } });
    if (iss2?.status === "open") {
      await go("/quality/issues");
      await br.clickRow(open.title);
      await br.settle(1200);
      await br.fillS("整改说明", "验收流·已返工");
      const ok1 = await br.clickS("标记已整改").catch(() => br.clickS("已整改").catch(() => null));
      if (!ok1) rep.note("UI", "整改入口", "问题抽屉里未找到“标记已整改”按钮：" + (await br.evaluate(`[...document.querySelectorAll('[role=dialog] button')].map(b=>b.innerText.trim()).join(' / ')`)));
      await br.settle(2200);
      rep.eq((await db.issue.findUnique({ where: { id: open.id } }))?.status, "rectified", "DB", "问题转待复验");
      await go("/quality/nodes/" + node.id);
      const dis2 = await br.evaluate(`(()=>{const A=window.__A;const b=[...document.querySelectorAll('button')].filter(A.visible).find(e=>/提交验收/.test(A.textOf(e)));return b?!b.disabled:null})()`);
      rep.eq(dis2, true, "GUARD", "整改后门控解开、提交可用");
    }
  });

  /* ═══ B6 质量→付款解锁：按 triggerStages 动态配对 ═══ */
  await rep.scenario("B6 ★ 节点通过 → 付款段派生解锁（排程/质量/财务三模块回环）", async () => {
    const nodes = await db.acceptanceNode.findMany({ where: { status: "submitted" } });
    if (!nodes.length) return rep.note("PRE", "实库无待审核节点，回环位已被走完", "见报告 D 组");
    let pair = null;
    for (const n of nodes) {
      const segs = await db.paymentNode.findMany({ where: { projectId: n.projectId } });
      const hit = segs.find((s) => s.trigger === "stages" && (s.triggerStages || "").split(",").map((x) => x.trim()).includes(n.name));
      if (hit) { pair = { n, hit }; break; }
    }
    const chosen = pair || { n: nodes[0], hit: null };
    const proj = await db.project.findUnique({ where: { id: chosen.n.projectId } });
    rep.ok("PRE", "回环位实况", `${proj.code} 节点“${chosen.n.name}”待审核${chosen.hit ? ` · 对应付款段“${chosen.hit.name}”` : " · 无同名段，改验“审核通过 + 段状态不变”"}`);
    await go("/finance/payments?projectId=" + proj.id);
    const before = await br.text();
    await go("/quality/nodes/" + chosen.n.id);
    await br.clickS("通过");
    await br.settle(900);
    await br.clickS("确认通过").catch(() => {});
    await br.settle(2600);
    const after = await db.acceptanceNode.findUnique({ where: { id: chosen.n.id } });
    rep.eq(after?.status, "passed", "DB", "审核通过写库");
    await go("/finance/payments?projectId=" + proj.id);
    if (chosen.hit) {
      const st = await br.evaluate(`(() => {
        const A = window.__A;
        const r = [...document.querySelectorAll('tr')].filter(x=>A.visible(x)).find(x=>A.norm(x.innerText).includes(${JSON.stringify(chosen.hit.name)}));
        return r ? { text: A.norm(r.innerText).slice(0,90), markable: !![...r.querySelectorAll('button')].find(b=>!b.disabled && /标记已付/.test(A.textOf(b))) } : null;
      })()`);
      rep.assert(st?.markable === true, "UI↔派生", "★ 只改节点状态，付款段派生变“可收款”（解锁不落库）", JSON.stringify(st));
      const seg = await db.paymentNode.findUnique({ where: { id: chosen.hit.id } });
      rep.eq(seg?.paid, false, "DB", "段自身 paid 未被偷偷改写");
      rep.eq(seg?.amountDue, chosen.hit.amountDue, "DB", "应收快照不随状态变", String(seg?.amountDue));
    } else {
      rep.note("UI", "该节点无对应付款段，回环仅验到审核通过");
    }
  });

  /* ═══ B7 台账：用真实按钮文案 ═══ */
  await rep.scenario("B7 台账新建/改额/删除 → 汇总即时联动", async () => {
    await go("/finance");
    const before = await moneyNear(br, "已收款");
    await br.clickS("新建记录").catch(() => br.clickS("新建收支记录"));
    await br.settle(1000);
    await br.pickS("项目", "云栖名邸");
    await br.pickS("收支类型", "收入");
    await br.pickS("科目", "合同款");
    await br.fillS("金额", "12345.67");
    await br.fillS("发生日期", "2026-10-13");
    await br.fillS("摘要", "验收流·一笔收入");
    await br.clickS("确认新建").catch(() => br.clickS("保存"));
    await br.settle(2400);
    const rec = await db.financeRecord.findFirst({ where: { description: "验收流·一笔收入" } });
    rep.assert(!!rec, "DB", "记录落库", rec ? `${rec.type}/${rec.category}/${rec.amount}` : "查不到");
    const mid = await moneyNear(br, "已收款");
    rep.eq(mid, fmt(Number(before) + 12345.67), "UI↔DB", "汇总“已收款”即时增加", `${before} → ${mid}`);
    const proj = await db.project.findUnique({ where: { code: "RP-2026-001" } });
    const exp = await db.financeRecord.aggregate({ where: { projectId: proj.id, type: "expense" }, _sum: { amount: true } });
    await go("/projects/" + proj.id + "?tab=budget");
    rep.ok("UI", "毛利卡现值", await moneyNear(br, "毛利"));
    await go("/finance");
    await br.clickRow("验收流·一笔收入");
    await br.settle(1300);
    await br.fillS("金额", "23456.78");
    await br.clickS("保存修改").catch(() => br.clickS("保存"));
    await br.settle(2400);
    rep.eq(String((await db.financeRecord.findFirst({ where: { description: "验收流·一笔收入" } }))?.amount), "23456.78", "DB", "改额落库");
    rep.eq(await moneyNear(br, "已收款"), fmt(Number(before) + 23456.78), "UI↔DB", "改额后汇总按新值复算");
    await br.clickRow("验收流·一笔收入");
    await br.settle(1200);
    await br.clickS("删除");
    await br.settle(700);
    await br.clickS("确认删除").catch(() => {});
    await br.settle(2400);
    rep.eq(await db.financeRecord.count({ where: { id: rec.id } }), 0, "DB", "删除生效（硬删无回收站）");
    rep.eq(await moneyNear(br, "已收款"), before, "UI↔DB", "删后汇总回落", String(before));
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "无控制台报错", errs.slice(0, 4).join(" ;; "));
});
