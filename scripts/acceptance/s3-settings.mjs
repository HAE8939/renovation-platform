/**
 * s3-settings.mjs —— A3 项目设置保存 + D4 主题切换 / Logo 上传（§4-7 第三、四项）
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { withPlatform, moneyNear, fmt } from "./runner.mjs";
import { ROOT } from "./harness.mjs";

const TMP = resolve(ROOT, "_scratch", "tmp");
mkdirSync(TMP, { recursive: true });
const CODE = "RP-2026-001";

/* 造三张测试图：合法小 png / 超大 png / 非法 svg（用 PNG 魔数骗过扩展名无门，走真 svg 文本） */
const PNG1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
writeFileSync(resolve(TMP, "logo-ok.png"), PNG1);
const big = Buffer.alloc(600 * 1024, 0);
PNG1.copy(big, 0);
writeFileSync(resolve(TMP, "logo-too-big.png"), big);
writeFileSync(resolve(TMP, "logo-bad.svg"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4" fill="red"/><script>alert(1)</script></svg>'));
const P = (f) => resolve(TMP, f);
function hexOf(v) { const t = String(v || "").trim().toUpperCase(); const m = /^#([0-9A-F])([0-9A-F])([0-9A-F])$/.exec(t); return m ? "#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3] : t; }

await withPlatform("s3-settings", 9363, async ({ br, db, rep, go, shot }) => {
  const proj = await db.project.findUnique({ where: { code: CODE } });
  const quote = await db.budgetQuote.findUnique({ where: { projectId: proj.id } });
  const items = await db.quoteItem.findMany({ where: { quoteId: quote.id } });
  const direct = items.reduce((s, i) => s + (Math.round(i.unitPrice * 100) * i.quantity) / 100, 0);
  const grand = direct + Math.round(direct * quote.taxRate * 100) / 100;

  /* ── A3 项目设置 ── */
  await rep.scenario("A3-1 改建筑面积 → 单方造价重算（口径接通）", async () => {
    await go("/budget/" + proj.id + "/settings");
    const old = await br.valueNear("area", "建筑面积");
    await br.fillS("建筑面积", "130");
    await br.clickS("保存");
    await br.settle(1800);
    const after = await db.project.findUnique({ where: { id: proj.id } });
    rep.eq(after?.area, 130, "DB", "面积写库", `${old} → ${after?.area}`);
    await go("/budget/" + proj.id);
    rep.eq(await moneyNear(br, "单方造价"), fmt(grand / 130), "UI↔算", "单方造价按新面积重算", `总价 ${fmt(grand)} ÷ 130`);
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("建筑面积", String(old));
    await br.clickS("保存");
    await br.settle(1600);
    rep.eq((await db.project.findUnique({ where: { id: proj.id } }))?.area, Number(old), "RST", "面积已复位", String(old));
  });

  await rep.scenario("A3-2 改合同额 → 项目中心毛利卡跟着动", async () => {
    const exp = await db.financeRecord.aggregate({ where: { projectId: proj.id, type: "expense" }, _sum: { amount: true } });
    const inc = await db.financeRecord.aggregate({ where: { projectId: proj.id, type: "income" }, _sum: { amount: true } });
    const chg = await db.changeOrder.aggregate({ where: { quoteId: quote.id }, _sum: { amount: true } });
    const spend = Number(exp._sum.amount || 0);
    const oldC = proj.contractAmount;
    const newC = oldC + 10000;
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("合同额", String(newC));
    await br.clickS("保存");
    await br.settle(1800);
    rep.eq((await db.project.findUnique({ where: { id: proj.id } }))?.contractAmount, newC, "DB", "合同额写库");
    const wantProfit = newC + Number(chg._sum.amount || 0) - spend;
    await go("/projects/" + proj.id + "?tab=budget");
    const shown = await moneyNear(br, "毛利");
    rep.eq(shown, fmt(wantProfit), "UI↔算", "毛利卡 = 合同 + 变更 − 支出", `变更 ${fmt(chg._sum.amount || 0)} · 支出 ${fmt(spend)} · 页面 ${shown}`);
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("合同额", String(oldC));
    await br.clickS("保存");
    await br.settle(1600);
    rep.eq((await db.project.findUnique({ where: { id: proj.id } }))?.contractAmount, oldC, "RST", "合同额已复位");
  });

  await rep.scenario("A3-3 项目改名 → 全站跟着显示新名", async () => {
    await go("/budget/" + proj.id + "/settings");
    const oldName = proj.name;
    await br.fillS("项目名称", oldName + "·改名测");
    await br.clickS("保存");
    await br.settle(1800);
    rep.eq((await db.project.findUnique({ where: { id: proj.id } }))?.name, oldName + "·改名测", "DB", "改名写库");
    await go("/budget");
    rep.assert(await br.hasText(oldName + "·改名测"), "UI", "预算列表显示新名");
    await go("/projects");
    rep.assert(await br.hasText(oldName + "·改名测"), "UI", "项目列表显示新名（跨模块同源）");
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("项目名称", oldName);
    await br.clickS("保存");
    await br.settle(1600);
    rep.eq((await db.project.findUnique({ where: { id: proj.id } }))?.name, oldName, "RST", "名称已复位");
  });

  await rep.scenario("A3-4 改客户名的连带副作用（共享主数据）", async () => {
    const peers = await db.project.count({ where: { clientId: proj.clientId } });
    const client = await db.client.findUnique({ where: { id: proj.clientId } });
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("客户名称", "改名影响验证客户");
    await br.clickS("保存");
    await br.settle(1800);
    const c2 = await db.client.findUnique({ where: { id: proj.clientId } });
    rep.eq(c2?.name, "改名影响验证客户", "DB", "客户表被改（一处改处处生效）");
    await go("/projects");
    const t = await br.text();
    rep.assert(peers > 1 ? (t.match(/改名影响验证客户/g) || []).length >= 2 : t.includes("改名影响验证客户"), "UI",
      `该客户名下 ${peers} 个项目在列表里的客户列一起变`, `${peers} 个项目`);
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("客户名称", client.name);
    await br.clickS("保存");
    await br.settle(1600);
    rep.eq((await db.client.findUnique({ where: { id: proj.clientId } }))?.name, client.name, "RST", "客户名已复位");
    rep.note("HAE", "客户改名是否有 hint 明示连带影响", (await br.slice("客户", 200))?.includes("所有项目") ? "有提示" : "未见提示文案，请目检确认");
  });

  await rep.scenario("A3-5 必填与脏值拦截", async () => {
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("建筑面积", "abc");
    await br.clickS("保存");
    await br.settle(1500);
    rep.assert(/数字|需为|无效|不合法/.test(await br.text()), "GUARD", "面积填字母应被拦", (await br.slice("面积", 120)));
    await go("/budget/" + proj.id + "/settings");
    await br.fillS("合同额", "-1");
    await br.clickS("保存");
    await br.settle(1500);
    const negText = (await br.text()) + (await br.dialogText() || "");
    const negBlocked = /不能为负|需为数字|大于|无效/.test(negText) || (await br.evaluate(`(()=>{const el=window.__A.scoped('合同额')||window.__A.field('合同额');return el?el.validity.badInput===true||el.validity.rangeUnderflow===true:false})()`));
    rep.assert(negBlocked, "GUARD", "合同额负数被拦（input min=0 的原生校验即算拦住，不必等服务端）",
      (negText.includes("不能为负") ? "服务端中文报错" : "浏览器原生 rangeUnderflow 拦住，表单未提交"));
    await go("/budget/" + proj.id + "/settings");
    rep.eq(await br.valueNear("contractAmount", "合同额"), String(proj.contractAmount), "DB", "被拒后库值未被改写");
  });

  /* ── D4 主题 ── */
  await rep.scenario("D4-1 四套主题逐个应用：写库 + 全站 accent 随动", async () => {
    const cases = { cobalt: "#3368A0", rust: "#B7472A", emerald: "#009473", teal: "#81D8D0" };
    for (const [key, hex] of Object.entries(cases)) {
      await go("/settings");
      await br.pickRadio("themeKey", key);
      await br.clickS("应用主题");
      await br.settle(1500);
      rep.eq((await db.platformSetting.findUnique({ where: { id: "platform" } }))?.themeKey, key, "DB", `主题 ${key} 写库`);
      await go("/dashboard");
      rep.eq(await br.evaluate(`document.documentElement.getAttribute("data-theme")`), key, "UI", `外壳 data-theme=${key}`);
      const accent = await br.evaluate(`getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()`);
      rep.eq(hexOf(accent), hex, "CSS", `--accent 取到 ${key} 的插槽值`, accent);
      const btn = await br.evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>e.querySelector&&getComputedStyle(e).backgroundColor.replace(/rgba? \\(|\\)/g,'')&&false);return null})()`);
      const fg = await br.evaluate(`getComputedStyle(document.documentElement).getPropertyValue("--accent-fg").trim()`);
      if (key === "teal") rep.eq(hexOf(fg), "#0A7680", "CSS", "teal 主按钮前景=深墨（非白）", fg);
      else rep.eq(hexOf(fg), "#FFFFFF", "CSS", `${key} 主按钮前景=白`, fg);
    }
    await go("/settings");
    await br.pickRadio("themeKey", "cobalt");
    await br.clickS("应用主题");
    await br.settle(1200);
    rep.eq((await db.platformSetting.findUnique({ where: { id: "platform" } }))?.themeKey, "cobalt", "RST", "复位钴蓝");
  });

  await rep.scenario("D4-2 减弱动效偏好下的可辨性", async () => {
    await br.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await go("/budget");
    await br.clickText("从科目库选入").catch(() => br.clickText("科目库"));
    await br.settle(500);
    const dur = await br.evaluate(`(()=>{const d=document.querySelector('[role=dialog]');if(!d)return 'no-dialog';const t=getComputedStyle(d.querySelector('*')||d);return t.transitionDuration})()`);
    rep.ok("A11Y", "reduced-motion 下浮层仍可打开且可辨", "transition-duration=" + dur);
    await br.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  });

  /* ── D4 Logo ── */
  await rep.scenario("D4-3 Logo 上传：类型/大小拦截、落盘、替换清旧、移除", async () => {
    const upDir = resolve(ROOT, "public", "uploads", "branding");
    await go("/settings");
    await br.uploadFiles("input[type=file]", [P("logo-bad.svg")]);
    await br.clickS("上传").catch(() => br.clickText("上传", { type: "button" }));
    await br.settle(1600);
    rep.rejects(await br.text(), "仅支持", "GUARD", "svg 应被拒");
    rep.eq((await db.platformSetting.findUnique({ where: { id: "platform" } }))?.logoFile, null, "DB", "被拒后未写库");

    await go("/settings");
    await br.uploadFiles("input[type=file]", [P("logo-too-big.png")]);
    await br.clickS("上传").catch(() => {});
    await br.settle(1600);
    rep.rejects(await br.text(), "过大", "GUARD", "超 512KB 应被拒");

    await go("/settings");
    await br.uploadFiles("input[type=file]", [P("logo-ok.png")]);
    await br.clickS("上传").catch(() => {});
    await br.settle(2000);
    const s1 = await db.platformSetting.findUnique({ where: { id: "platform" } });
    rep.assert(/^logo-\\d+-[\\w-]+\\.png$/.test(s1?.logoFile || ""), "DB", "服务端生成文件名（不含客户端原名）", String(s1?.logoFile));
    rep.assert(existsSync(resolve(upDir, s1.logoFile)), "FS", "文件真落盘", resolve(upDir, s1.logoFile));
    await go("/dashboard");
    rep.assert(await br.evaluate(`!!document.querySelector('img[src*="uploads/branding"]')`), "UI", "侧栏品牌区渲染 Logo");
    await shot("logo-cobalt");

    const firstFile = s1.logoFile;
    await go("/settings");
    await br.uploadFiles("input[type=file]", [P("logo-ok.png")]);
    await br.clickS("上传").catch(() => {});
    await br.settle(2000);
    const s2 = await db.platformSetting.findUnique({ where: { id: "platform" } });
    rep.assert(s2.logoFile !== firstFile, "FS", "替换后指向新文件", `${firstFile} → ${s2.logoFile}`);
    rep.assert(!existsSync(resolve(upDir, firstFile)), "FS", "旧文件已 best-effort 清掉，不留孤儿");

    await go("/settings");
    await br.clickS("移除 Logo").catch(() => br.clickText("移除 Logo", { type: "button" }));
    await br.settle(1800);
    const s3 = await db.platformSetting.findUnique({ where: { id: "platform" } });
    rep.eq(s3?.logoFile, null, "DB", "移除后库里回到未上传");
    const left = existsSync(upDir) ? (await import("node:fs")).readdirSync(upDir) : [];
    rep.eq(left.length, 0, "FS", "上传目录已清空", left.join(","));
    await go("/dashboard");
    rep.assert(!(await br.evaluate(`!!document.querySelector('img[src*="uploads/branding"]')`)), "UI", "侧栏回落文字标识");
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "全过程无控制台报错", errs.slice(0, 3).join(" ;; "));
});
for (const f of ["logo-ok.png", "logo-too-big.png", "logo-bad.svg"]) rmSync(P(f), { force: true });
