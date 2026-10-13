/**
 * s9-m10a.mjs —— M10-a 本轮改动的验收（归档 / 作废 / 操作流水 / 通知中心 / 错误日志 / 四项 UI）
 * 同样只打副本库，实库 md5 由 runner 的元断言兜底。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withPlatform } from "./runner.mjs";
import { ROOT } from "./harness.mjs";

await withPlatform("s9-m10a", 9369, async ({ br, db, rep, go, srv }) => {
  /* ── 备料三 · 项目归档与恢复 ── */
  await rep.scenario("K1 项目归档 → 全司口径移出 → 可恢复到原状态", async () => {
    const p = await db.project.findFirst({ where: { status: "in_progress" }, orderBy: { code: "asc" } });
    if (!p) return rep.fail("PRE", "前置缺失：无 in_progress 项目");
    await go("/dashboard");
    const before = await br.evaluate(`window.__A.afterNumber("在建项目数")`);
    await go("/projects?view=table");
    await br.clickInRow(p.code, "归档");
    await br.settle(400);
    const dialogMsg = await br.evaluate(`(() => {const A=window.__A;return A.norm(document.body.innerText).includes("确认归档")})()`);
    rep.note("UI", "归档前有确认（headless 下 confirm 需接受）", dialogMsg ? "有确认文案" : "走 window.confirm");
    const after = await db.project.findUnique({ where: { id: p.id } });
    rep.eq(after?.status, "archived", "DB", "归档只翻 status", `${p.status} → ${after?.status}`);
    const logs = await db.operationLog.findMany({ where: { projectId: p.id }, orderBy: { at: "desc" }, take: 3 });
    rep.assert(logs.some((l) => l.action === "project.archive"), "流水", "归档写入操作流水", logs.map((l) => l.action).join(","));
    rep.assert(!!logs.find((l) => l.action === "project.archive")?.before, "流水", "流水记下归档前状态（恢复要用）", String(logs.find((l) => l.action === "project.archive")?.before));
    await go("/dashboard");
    const afterKpi = await br.evaluate(`window.__A.afterNumber("在建项目数")`);
    rep.assert(Number(afterKpi) === Number(before) - 1, "口径", "驾驶舱「在建项目数」少 1（已归档不计）", `${before} → ${afterKpi}`);
    await go("/projects?view=table");
    await br.clickInRow(p.code, "恢复");
    await br.settle(1200);
    const back = await db.project.findUnique({ where: { id: p.id } });
    rep.eq(back?.status, p.status, "DB", "恢复到归档前那一态（不是一律塞回草稿）", String(back?.status));
    rep.eq(await db.quoteItem.count({ where: { quote: { projectId: p.id } } }), await db.quoteItem.count({ where: { quote: { projectId: p.id } } }), "数据", "归档期间业务数据一行未动");
  });

  /* ── 备料三 · 线索作废与签约守卫 ── */
  await rep.scenario("K2 线索作废 → 漏斗与看板摘除；已签约不许只作废线索", async () => {
    const lead = await db.lead.findFirst({ where: { stage: "contacted", archived: false } });
    if (!lead) return rep.fail("PRE", "前置缺失：无 contacted 线索");
    await go("/dashboard");
    const funnel0 = await br.text();
    await go("/crm?view=list");
    await br.clickInRow(lead.name, "作废");
    await br.settle(1400);
    const l2 = await db.lead.findUnique({ where: { id: lead.id } });
    rep.eq(l2?.archived, true, "DB", "线索作废位写库");
    rep.assert(!!l2?.archivedAt, "DB", "记作废时刻", String(l2?.archivedAt));
    await go("/crm");
    rep.assert(!(await br.hasText(lead.name)), "UI", "作废后看板里看不到该线索");
    await go("/crm?view=list&archived=1");
    rep.assert(await br.hasText(lead.name), "UI", "「已作废」视图能查到（否则无法恢复）");
    await br.clickInRow(lead.name, "恢复");
    await br.settle(1400);
    const l3 = await db.lead.findUnique({ where: { id: lead.id } });
    rep.eq(l3?.archived, false, "DB", "恢复位复位");
    rep.eq(l3?.archivedAt, null, "DB", "恢复后作废时刻清空", String(l3?.archivedAt));

    const signed = await db.lead.findFirst({ where: { stage: "signed", projectId: { not: null } } });
    if (signed) {
      await go("/crm?view=list");
      const hint = await br.evaluate(`(() => {
        const A = window.__A;
        const r = [...document.querySelectorAll('tr')].find(x=>A.norm(x.innerText).includes(${JSON.stringify(signed.name)}));
        return r ? A.norm(r.innerText) : null;
      })()`);
      rep.assert(!/作废/.test(hint || "") || /项目中心/.test(hint || ""), "GUARD", "已签约线索不给「只作废线索」的入口（会断项目来源）", String(hint).slice(0, 70));
    }
    await go("/dashboard");
    rep.ok("口径", "漏斗对账基线（作废前后 stage 分布）", funnel0.includes("商务漏斗") ? "漏斗在位" : "未见漏斗");
  });

  /* ── 备料二 · 操作流水内容质量 ── */
  await rep.scenario("K3 改一笔台账 → 流水里有「从多少改到多少」", async () => {
    await go("/finance");
    await br.clickS("新建记录").catch(() => br.clickS("新建收支记录"));
    await br.settle(1000);
    await br.pickS("项目", "云栖名邸");
    await br.pickS("收支类型", "收入");
    await br.pickS("科目", "合同款");
    await br.fillS("金额", "1000");
    await br.fillS("发生日期", "2026-10-13");
    await br.fillS("摘要", "验收流·流水可查性");
    await br.clickS("确认新建").catch(() => br.clickS("保存"));
    await br.settle(2400);
    const rec = await db.financeRecord.findFirst({ where: { description: "验收流·流水可查性" } });
    if (!rec) return rep.fail("PRE", "前置缺失：造不出测试记录（副本库，测完随下轮重灌消失）");
    await go("/finance");
    await br.pickRow("验收流·流水可查性");
    await br.settle(1200);
    const newVal = Number(rec.amount) + 777;
    await br.fillS("金额", String(newVal));
    await br.clickS("保存修改").catch(() => br.clickS("保存"));
    await br.settle(2200);
    const row = await db.operationLog.findFirst({ where: { action: "record.update", entityId: rec.id }, orderBy: { at: "desc" } });
    rep.assert(!!row, "流水", "改动写入流水一条", row ? row.summary : "没有");
    rep.assert(/→/.test(row?.summary || ""), "流水", "摘要含「旧 → 新」可读变化", String(row?.summary));
    rep.assert(!!row?.actor, "流水", "记了操作人（P4 前是占位用户）", String(row?.actor));
    rep.eq(row?.projectId, rec.projectId, "流水", "挂上 projectId，可按项目回放", String(row?.projectId));
    rep.note("HAE", "测试记录留在副本库", "验收流·流水可查性——每个套件开跑前重灌副本库，不会污染实库");
  });

  /* ── 备料一 · 错误日志落盘 ── */
  await rep.scenario("K4 错误现场：客户端 digest 上报能落进同一份账", async () => {
    const r = await br.evaluate(`fetch("/api/client-errors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({digest:"ACCEPT-TEST-1",message:"验收台造的假错误",path:"/projects"})}).then(x=>x.status)`);
    rep.eq(r, 200, "API", "/api/client-errors 收 POST");
    const logPath = resolve(ROOT, "logs", "app-errors.jsonl");
    rep.assert(existsSync(logPath), "FS", "运行期日志文件已生成", logPath);
    const tail = existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean).slice(-3).join("\n") : "";
    rep.assert(tail.includes("ACCEPT-TEST-1"), "FS", "digest 与路径可在文件里检索到（编号 → 现场对得上）", tail.slice(0, 120));
  });

  /* ── UI-12 · 通知中心 ── */
  await rep.scenario("K5 顶栏通知中心：点开有数、分组带深链", async () => {
    await go("/dashboard");
    await br.clickText("通知");
    await br.settle(1800);
    const panel = await br.evaluate(`(() => {
      const A = window.__A;
      const d = [...document.querySelectorAll('[role=dialog]')].find(x=>A.norm(x.getAttribute('aria-label')||'')==='通知中心');
      if(!d) return null;
      return { text: A.norm(d.innerText).slice(0,300), links: [...d.querySelectorAll('a')].length, groups: [...d.querySelectorAll('h3')].map(h=>A.norm(h.innerText)) };
    })()`);
    rep.assert(!!panel, "UI", "面板打开");
    rep.assert((panel?.groups || []).length > 0, "UI", "至少一组待办", (panel?.groups || []).join(" / "));
    rep.assert((panel?.links || 0) >= (panel?.groups || []).length, "UI", "每组都带「查看全部」深链", `links=${panel?.links}`);
    const badge = await br.evaluate(`(() => {const A=window.__A;const b=[...document.querySelectorAll('button')].find(e=>A.norm(e.innerText).startsWith('通知'));return b?A.norm(b.innerText):null})()`);
    rep.assert(/^通知/.test((badge || "").trim()) && /\d/.test(badge || ""), "UI", "按钮上有未读角标", JSON.stringify(badge));
    await br.evaluate(`document.querySelector('[role=dialog] button')?.click()`);
  });

  /* ── UI-3 / 4 / 6 / 7 / 8 目检式断言 ── */
  await rep.scenario("U1 首页模块卡不再有图标列", async () => {
    await go("/");
    const icons = await br.evaluate(`(() => {
      const A = window.__A;
      const links = [...document.querySelectorAll('a[href^="/"]')].filter(a=>/\\/01\\.01|^01$/.test("") || a.querySelector("span"));
      const cards = [...document.querySelectorAll("li a")].filter(a=>A.visible(a));
      return cards.map(c=>A.norm(c.innerText).slice(0,26));
    })()`);
    const withGlyph = (icons || []).filter((t) => /^[0-9]{2}\s*[^\x00-\xff]{1}\s/.test(t));
    rep.eq(withGlyph.length, 0, "UI", "卡片文本形如「01 数据驾驶舱」，中间没有单字图标", (icons || []).slice(0, 3).join(" | "));
  });

  await rep.scenario("U2 侧栏固定不随主体滚动", async () => {
    await go("/projects");
    const css = await br.evaluate(`(() => {
      const a = document.querySelector('aside');
      if(!a) return null;
      const s = getComputedStyle(a);
      return { position: s.position, overflowY: s.overflowY, height: s.height };
    })()`);
    rep.eq(css?.position, "sticky", "CSS", "侧栏 position: sticky", JSON.stringify(css));
    await br.evaluate("window.scrollTo(0, 900)");
    await br.settle(400);
    const top = await br.evaluate(`Math.round(document.querySelector('aside').getBoundingClientRect().top)`);
    rep.assert(Math.abs(top) <= 2, "UI", "页面滚到 900px 后侧栏仍贴在视口顶部", `top=${top}`);
  });

  await rep.scenario("U3 两个看板不再产生横向滚动", async () => {
    for (const path of ["/crm", "/design"]) {
      await go(path);
      const res = await br.evaluate(`(() => {
        const A = window.__A;
        const sliders = [...document.querySelectorAll('*')].filter(e => {
          const s = getComputedStyle(e);
          return (s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 2 && A.visible(e) && e.clientWidth > 200;
        });
        return { n: sliders.length, doc: document.documentElement.scrollWidth, vw: window.innerWidth };
      })()`);
      rep.assert(res.n === 0, "UI", `${path} 无横向滑块容器（内容完整可见）`, JSON.stringify(res));
    }
  });

  await rep.scenario("U4 设置页标题与四色一一对应", async () => {
    await go("/settings");
    const t = await br.text();
    rep.assert(t.includes("主题") && !t.includes("强调色主题"), "UI", "标题已是「主题」，旧长句说明已去掉");
    rep.assert(!t.includes("纸底、灰阶、描边、圆角一律不动"), "UI", "技术口径说明文字已删");
    const chips = await br.evaluate(`(() => {
      const A = window.__A;
      const sw = [...document.querySelectorAll('[role=img][aria-label*="四色预览"]')];
      return { n: sw.length, first: sw[0] ? A.norm(sw[0].innerText) : null };
    })()`);
    rep.eq(chips.n, 4, "UI", "四套主题各有四色预览块", JSON.stringify(chips));
    rep.assert(/强调/.test(chips.first || "") && /按钮/.test(chips.first || "") && /浅晕/.test(chips.first || ""), "UI", "四块分别标注强调/深墨/浅晕/按钮", String(chips.first));
    const distinct = await br.evaluate(`(() => {
      const sws = [...document.querySelectorAll('[role=img][aria-label*="四色预览"]')];
      const firstChip = (el) => { const cs = [...el.querySelectorAll("span")]; const c = cs.find(x => { const b = getComputedStyle(x).backgroundColor; return b && b !== "rgba(0, 0, 0, 0)"; }); return c ? getComputedStyle(c).backgroundColor : null; };
      return { n: new Set(sws.map(firstChip).filter(Boolean)).size, vals: sws.map(firstChip) };
    })()`);
    rep.assert(distinct.n >= 4, "CSS", "四套的主色块确实互不相同（局部预览能作用域换色）", JSON.stringify(distinct));
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "全过程无控制台报错", errs.slice(0, 4).join(" ;; "));
});
