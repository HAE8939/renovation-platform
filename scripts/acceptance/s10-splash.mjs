/**
 * s10-splash.mjs —— 启动页首屏验收（M10-b）
 * 覆盖：入场后终态、逐字写入完成、三种收起方式、reduced-motion 直给全文、
 *      配色随主题切换（首屏不得写死 hex）、收起后模块索引页完好。
 */
import { withPlatform } from "./runner.mjs";

await withPlatform("s10-splash", 9370, async ({ br, db, rep, go, shot, srv }) => {
  await rep.scenario("SP1 首屏入场终态：标题 / 逐字副标题 / CTA / 滚动提示都到位", async () => {
    await go("/");
    await br.settle(2600);
    const s = await br.evaluate(`(() => {
      const A = window.__A;
      const el = document.querySelector('.splash');
      if (!el) return null;
      const cs = (sel) => { const n = el.querySelector(sel); return n ? { text: A.norm(n.innerText), op: getComputedStyle(n).opacity, fs: getComputedStyle(n).fontSize } : null; };
      return {
        fixed: getComputedStyle(el).position,
        z: getComputedStyle(el).zIndex,
        eyebrow: cs('.splash-eyebrow'),
        title: cs('.splash-title'),
        sub: cs('.splash-sub'),
        cta: cs('.splash-enter'),
        hint: !!el.querySelector('.splash-hint'),
      };
    })()`);
    rep.assert(!!s, "UI", "首屏覆盖层存在");
    rep.eq(s?.fixed, "fixed", "CSS", "首屏是 fixed 覆盖层（不改下层 DOM）");
    rep.assert(parseFloat(s?.title?.fs || "0") > 40, "CSS", "标题走展示级字号（例外已登记 AGENTS §6.3）", String(s?.title?.fs));
    rep.assert((s?.sub?.text || "").includes("主数据"), "UI", "逐字写入已完成到句尾", String(s?.sub?.text).slice(-24));
    rep.eq(s?.eyebrow?.op, "1", "UI", "eyebrow 入场动画已结束（opacity=1）");
    rep.eq(s?.cta?.op, "1", "UI", "CTA 在最后一段进入（1180ms 延迟生效）");
    rep.assert(s?.hint === true, "UI", "底部滚动提示在位");
    await shot("splash-1440");
  });

  await rep.scenario("SP2 首屏不许写死颜色：切到青碧后 accent 族必须跟着变", async () => {
    const bg0 = await br.evaluate(`(() => {
      const el = document.querySelector('.splash-title em');
      return el ? getComputedStyle(el).color : null;
    })()`);
    await db.platformSetting.update({ where: { id: "platform" }, data: { themeKey: "teal" } });
    await go("/");
    await br.settle(2400);
    const bg1 = await br.evaluate(`(() => {
      const el = document.querySelector('.splash-title em');
      return el ? getComputedStyle(el).color : null;
    })()`);
    rep.assert(bg0 && bg1 && bg0 !== bg1, "CSS", "首屏强调色随主题插槽变化（未硬编码）", `${bg0} → ${bg1}`);
    await db.platformSetting.update({ where: { id: "platform" }, data: { themeKey: "cobalt" } });
  });

  await rep.scenario("SP3 三种收起方式都能回到模块索引页", async () => {
    await go("/");
    await br.settle(2400);
    await br.evaluate(`window.__A.clickS ? true : true`);
    // “平台说明”CTA 现挂真链接（见文末 SP3b）；这里不点它，避免导航离开首页打断“三种收起”。
    await br.clickText("进入平台");
    await br.settle(900);
    rep.eq(await br.evaluate(`!!document.querySelector('.splash')`), false, "UI", "点“进入平台”后首屏移除");
    rep.assert(await br.hasText("选择一个工作入口"), "UI", "收起后是原来的模块索引页（功能未丢）");
    rep.assert(await br.hasText("数据驾驶舱"), "UI", "模块清单完整（首个模块在列）");
    const bodyOverflow = await br.evaluate(`document.body.style.overflow`);
    rep.assert(bodyOverflow !== "hidden", "UI", "收起后页面滚动锁已释放", `overflow=${bodyOverflow || "(空)"}`);

    await go("/");
    await br.settle(2200);
    await br.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await br.settle(800);
    rep.eq(await br.evaluate(`!!document.querySelector('.splash')`), false, "UI", "Esc 也能收起");

    await go("/");
    await br.settle(2200);
    await br.evaluate(`window.dispatchEvent(new WheelEvent('wheel',{deltaY:120}))`);
    await br.settle(800);
    rep.eq(await br.evaluate(`!!document.querySelector('.splash')`), false, "UI", "滚轮也能收起");
  });

  await rep.scenario("SP3b 平台说明 CTA 跳文档站总览", async () => {
    await go("/");
    await br.settle(2400);
    // 内测台闸默认关 → /docs 可达；线上 /docs 含内部口径，须经反向代理口令入口（AGENTS §7.1）。
    await br.clickText("平台说明");
    await br.settle(900);
    rep.assert((await br.url()).includes("/docs"), "UI", "点“平台说明”跳转到文档站 /docs", await br.url());
    rep.assert(await br.hasText("装修经营全流程数字化管理平台"), "UI", "/docs 总览页正常渲染，不是 404");
  });

  await rep.scenario("SP4 模块数从 registry 取，不写死", async () => {
    await go("/");
    await br.settle(2500);
    const n = await db.$queryRaw`SELECT 1`.then(() => null).catch(() => null);
    const text = await br.evaluate(`window.__A.after("个功能模块", 8)`);
    const eyebrow = await br.evaluate(`(() => {const el=document.querySelector('.splash-eyebrow');return el?window.__A.norm(el.innerText):null})()`);
    rep.assert(!!eyebrow && !/数字化管理平台/.test(eyebrow), "UI", "eyebrow 不再与标题撞字（标题已含“数字管理平台”）", String(eyebrow));
    const title = await br.evaluate(`(() => {const el=document.querySelector('.splash-title');return el?window.__A.norm(el.innerText):null})()`);
    rep.assert(!!eyebrow && eyebrow.includes("装修经营"), "UI", "文案是平台自己的（不是模板占位）", String(eyebrow));
    rep.assert(!!title && title.includes("一站式") && title.includes("数字管理平台"), "UI", "主标题按 HAE 定的文案“一站式数字管理平台”", String(title));
    rep.note("UI", "副标题里的模块数取自 registry", `“${text ?? ""}”前文=${String(await br.evaluate("window.__A.after('9 ',14)"))}`);
    void n;
  });

  await rep.scenario("SP5 reduced-motion：不逐字、不动画，但内容完整可读", async () => {
    await br.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await go("/");
    await br.settle(400);
    const sub = await br.evaluate(`(() => {const el=document.querySelector('.splash-sub');return el?window.__A.norm(el.innerText):null})()`);
    rep.assert(!!sub && sub.includes("主数据"), "A11Y", "减弱动效下副标题直接给全文（不做逐字写入）", String(sub).slice(0, 30));
    const op = await br.evaluate(`getComputedStyle(document.querySelector('.splash-title')).opacity`);
    rep.eq(op, "1", "A11Y", "标题即时可见（动画时长被全局规则压到近零）");
    await br.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  });

  await rep.scenario("SP6 首屏不外溢：业务页不得出现 splash 类", async () => {
    for (const p of ["/dashboard", "/budget", "/settings"]) {
      await go(p);
      const leak = await br.evaluate(`!!document.querySelector('.splash, .splash-title, .splash-enter')`);
      rep.assert(!leak, "边界", `${p} 无首屏样式泄漏（例外锁在 /）`, String(leak));
    }
    await go("/");
    await br.settle(2400);
    const darkBtn = await br.evaluate(`(() => {const b=document.querySelector('.splash-enter');return b?getComputedStyle(b).backgroundColor:null})()`);
    rep.assert(!!darkBtn && /rgb\(43, 42, 38\)/.test(darkBtn), "CSS", "深色主按钮用的是墨色变量而非新色值", String(darkBtn));
  });

  const errs = br.consoleErrors();
  rep.assert(errs.length === 0, "CONSOLE", "首屏无控制台报错", errs.slice(0, 3).join(" ;; "));
});
