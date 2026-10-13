/**
 * cdp.mjs —— 极简 Chrome DevTools Protocol 驱动（无第三方依赖）
 *
 * 为什么存在：STATUS §4-7 的缺口是「交互写回路径从没被点过」。历史验收全靠
 * `--screenshot` CLI（只截不改）与直连服务的门禁（不经过 UI），两条都碰不到
 * 「界面上点了 → 服务端收了 → 库里真变了 → 页面回读一致」这一整段。
 * 本机没有 playwright / puppeteer，Node 24 自带 WebSocket 与 fetch，
 * 于是用裸 CDP 写一个够用的驱动：能点、能填、能上传、能截图、能读回 DOM。
 *
 * 只服务验收，不进生产代码；产物落 `_scratch/`（见 AGENTS §9）。
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

export function findBrowser() {
  const p = BROWSERS.find((b) => existsSync(b));
  if (!p) throw new Error("未找到 Chrome / Edge");
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 页面侧工具：注入到 window.__A，供 Runtime.evaluate 调用 ───────── */
const HELPERS = String.raw`
(function () {
  const A = {};
  A.norm = (s) => (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
  A.visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };
  A.labelOf = (el) => {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(A.norm(l.innerText));
    // Field 组件常把标题渲成 span（没有 for），故无条件把祖先文本也当候选
    const wrap = el.closest("label") || el.parentElement?.parentElement || el.parentElement;
    if (wrap) parts.push(A.norm(wrap.innerText).slice(0, 40));
    parts.push(A.norm(el.getAttribute("aria-label")));
    parts.push(A.norm(el.getAttribute("placeholder")));
    parts.push(A.norm(el.getAttribute("name")));
    parts.push(A.norm(el.title));
    return parts.filter(Boolean).join("|").toLowerCase();
  };
  A.textOf = (el) =>
    A.norm(el.innerText) || A.norm(el.value) || A.norm(el.getAttribute("aria-label")) || A.norm(el.title);
  A.CLICKABLE = 'button,a[href],[role="button"],summary,input[type=submit],input[type=button],label,option';
  A.findByText = (text, opt) => {
    opt = opt || {};
    const pool = opt.css ? [...document.querySelectorAll(opt.css)] : [...document.querySelectorAll(A.CLICKABLE)];
    const t = A.norm(text).toLowerCase();
    const wantType = opt.type; // 'button' | 'link' 等粗筛
    const usable = pool.filter((e) => {
      if (!A.visible(e)) return false;
      if (wantType === "button" && !(e.tagName === "BUTTON" || e.type === "submit" || e.type === "button" || e.getAttribute("role") === "button")) return false;
      if (wantType === "link" && e.tagName !== "A") return false;
      return true;
    });
    const exact = usable.filter((e) => A.textOf(e).toLowerCase() === t);
    if (exact.length) return exact;
    return usable.filter((e) => A.textOf(e).toLowerCase().includes(t));
  };
  A.clickText = (text, opt) => {
    const hits = A.findByText(text, opt);
    if (!hits.length) throw new Error("找不到可点元素：" + text);
    const el = hits[(opt && opt.nth) || 0];
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
    return { clicked: A.textOf(el).slice(0, 60), matches: hits.length };
  };
  A.field = (label) => {
    const t = A.norm(label).toLowerCase();
    const match = (list) => {
      const exact = list.filter((e) => A.labelOf(e) === t);
      if (exact.length) return exact[0];
      const loose = list.filter((e) => A.labelOf(e).includes(t));
      return loose.length ? loose[0] : null;
    };
    const all = () => [...document.querySelectorAll("input,select,textarea")];
    return (
      match(all().filter(A.visible)) ||
      match(all().filter((e) => !A.visible(e))) // sr-only 单选/复选：功能在、视觉上藏
    );
  };
  /** 按 name+value 点单选（覆盖 sr-only 自定义控件） */
  A.pickRadio = (name, value) => {
    const sel = 'input[type=radio][name="' + name + '"]';
    const list = [...document.querySelectorAll(sel)];
    if (!list.length) throw new Error("找不到单选组：" + name);
    const want = A.norm(value).toLowerCase();
    const byValue = list.find((e) => A.norm(e.value).toLowerCase() === want);
    const byLabel = list.find((e) => {
      const lb = e.labels ? [...e.labels].map((l) => A.norm(l.innerText).toLowerCase()).join(" ") : "";
      const wrap = e.closest("label") ? A.norm(e.closest("label").innerText).toLowerCase() : "";
      return lb.includes(want) || wrap.includes(want);
    });
    const el = byValue || byLabel;
    if (!el) throw new Error("单选「" + name + "」无值：" + value + "（可选：" + list.map((e) => e.value).join("/") + "）");
    el.click();
    return { name, value: el.value, checked: el.checked };
  };
  A.setNative = (el, value) => {
    const proto =
      el.tagName === "SELECT" ? HTMLSelectElement.prototype
      : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    d.set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  A.fill = (label, value) => {
    const el = A.field(label);
    if (!el) throw new Error("找不到输入控件：" + label);
    A.setNative(el, value);
    return { tag: el.tagName, name: el.name || null, value: el.value };
  };
  /** 行内控件：按「行标识」（行文本或任一控件的值）定位行，再按 placeholder/label 找控件 */
  A.rowOf = (key) => {
    const k = A.norm(key).toLowerCase();
    const rows = [...document.querySelectorAll("tr")].filter(A.visible);
    for (const r of rows) {
      if (A.norm(r.innerText).toLowerCase().includes(k)) return r;
      if ([...r.querySelectorAll("input,select,textarea")].some((e) => A.norm(e.value).toLowerCase().includes(k))) return r;
    }
    return null;
  };
  A.rowField = (key, label) => {
    const row = A.rowOf(key);
    if (!row) throw new Error("找不到行：" + key);
    const l = A.norm(label).toLowerCase();
    const ctrls = [...row.querySelectorAll("input,select,textarea")];
    const el = ctrls.find((e) => A.labelOf(e) === l) || ctrls.find((e) => A.labelOf(e).includes(l));
    if (!el) throw new Error("行「" + key + "」内无控件「" + label + "」（该行控件：" + ctrls.map((e) => A.labelOf(e).split("|")[0]).join(", ") + "）");
    return el;
  };
  A.fillRow = (key, label, value) => {
    const el = A.rowField(key, label);
    A.setNative(el, value);
    return { key: A.norm(key), label, value: el.value };
  };
  A.rowValue = (key, label) => {
    try { return A.rowField(key, label).value; } catch { return null; }
  };
  A.rowText = (key) => {
    const r = A.rowOf(key);
    return r ? A.norm(r.innerText) : null;
  };
  A.rowButtons = (key) => {
    const r = A.rowOf(key);
    return r ? [...r.querySelectorAll("button")].map((e) => A.norm(e.innerText)) : [];
  };
  A.clickInRow = (key, text) => {
    const k = A.norm(key).toLowerCase();
    const t = A.norm(text).toLowerCase();
    const eq = (e) => A.textOf(e).toLowerCase() === t;
    const hit = (e) => eq(e) || A.textOf(e).toLowerCase().includes(t);
    const pool = [...document.querySelectorAll("button,[role=button],a")].filter((e) => A.visible(e));
    const want = pool.filter(hit);
    const prefer = want.filter(eq);
    const cands = prefer.length ? prefer : want;
    const keyIn = (el) => {
      if (A.norm(el.innerText).toLowerCase().includes(k)) return true;
      // 行里的编号/名称常是 input 的 value，不进 innerText
      return [...el.querySelectorAll("input,select,textarea")].some((e) => A.norm(e.value).toLowerCase().includes(k));
    };
    for (const b of cands) {
      let el = b;
      for (let depth = 0; depth < 8 && el; depth++) {
        el = el.parentElement;
        if (!el) break;
        const own = [...el.querySelectorAll("button,[role=button],a")].filter((e) => A.visible(e));
        const eqHits = own.filter(eq);
        const inScope = eqHits.length ? eqHits : own.filter(hit);
        if (inScope.length === 1 && inScope[0] === b && keyIn(el)) {
          b.scrollIntoView({ block: "center", inline: "center" });
          b.click();
          return { key: A.norm(key), clicked: A.textOf(b), scope: el.tagName + "." + (el.className || "").split(" ")[0] };
        }
      }
    }
    throw new Error("找不到行「" + key + "」内的按钮「" + text + "」（全页同名按钮 " + want.length + " 个）");
  };
  /* 抽屉 / 弹窗内的控件：有 dialog 时只在其中找，避免与背景同名控件混淆 */
  A.dialog = () => {
    const ds = [...document.querySelectorAll('[role="dialog"],dialog')].filter(A.visible);
    return ds.length ? ds[ds.length - 1] : null;
  };
  A.scoped = (label, root) => {
    const t = A.norm(label).toLowerCase();
    const scope = root || A.dialog() || document;
    const ctrls = [...scope.querySelectorAll("input,select,textarea")];
    const vis = ctrls.filter(A.visible).concat(ctrls.filter((e) => !A.visible(e) && e.classList.contains("sr-only")));
    return vis.find((e) => A.labelOf(e) === t) || vis.find((e) => A.labelOf(e).includes(t)) || null;
  };
  A.fillS = (label, value) => {
    const el = A.scoped(label);
    if (!el) throw new Error("弹窗/页面内找不到控件「" + label + "」(dialog=" + !!A.dialog() + ")");
    A.setNative(el, value);
    return { value: el.value, inDialog: !!A.dialog() };
  };
  A.clickS = (text) => {
    const t = A.norm(text).toLowerCase();
    const scope = A.dialog() || document;
    const btns = [...scope.querySelectorAll("button,[role=button],a")].filter((e) => A.visible(e));
    const el = btns.find((e) => A.textOf(e).toLowerCase() === t) || btns.find((e) => A.textOf(e).toLowerCase().includes(t));
    if (!el) throw new Error("弹窗/页面内找不到按钮「" + text + "」（有：" + btns.map((e) => A.textOf(e)).slice(0, 12).join(", ") + "）");
    el.click();
    return { clicked: A.textOf(el), inDialog: !!A.dialog() };
  };
  /** 点「文本里含该关键字」的最specific可点元素（取最短文本，避免命中大容器） */
  A.pickRow = (key) => {
    const k = A.norm(key).toLowerCase();
    const hits = [...document.querySelectorAll("button,[role=button],a,li,td,th,summary")]
      .filter((e) => A.visible(e) && A.norm(e.innerText).toLowerCase().includes(k));
    if (!hits.length) {
      // 退回：找含该文本的最深元素，点它自己或最近的可点/可悬停祖先（React onClick 常挂在 div/tr 上）
      const any = [...document.querySelectorAll("*")].filter(
        (e) => A.visible(e) && e.children.length < 6 && A.norm(e.innerText).toLowerCase().includes(k)
      );
      if (!any.length) throw new Error("找不到含「" + key + "」的可点元素");
      any.sort((a, b) => A.norm(a.innerText).length - A.norm(b.innerText).length);
      const leaf = any[0];
      const target = leaf.closest("a,button,[role=button],[onclick],[class*=cursor-pointer],[class*=hover\\:bg],tr,summary") || leaf;
      target.scrollIntoView({ block: "center" });
      target.click();
      return { picked: A.norm(leaf.innerText).slice(0, 70), tag: target.tagName, candidates: any.length, via: "fallback" };
    }
    hits.sort((a, b) => A.norm(a.innerText).length - A.norm(b.innerText).length);
    const el = hits[0];
    el.scrollIntoView({ block: "center" });
    el.click();
    return { picked: A.norm(el.innerText).slice(0, 70), tag: el.tagName, candidates: hits.length };
  };
  A.pickS = (label, optionText) => {
    const el = A.scoped(label);
    if (!el) throw new Error("找不到下拉：" + label + "（dialog=" + !!A.dialog() + "）");
    const want = A.norm(optionText).toLowerCase();
    const op = [...el.querySelectorAll("option")].find((o) => A.norm(o.innerText).toLowerCase() === want)
      || [...el.querySelectorAll("option")].find((o) => A.norm(o.innerText).toLowerCase().includes(want));
    if (!op) throw new Error("下拉「" + label + "」无选项：" + optionText + "（现有：" + [...el.querySelectorAll("option")].map((o) => A.norm(o.innerText)).join(" / ") + "）");
    A.setNative(el, op.value);
    return { selected: A.norm(op.innerText), value: op.value };
  };
  A.optionsS = (label) => {
    const el = A.scoped(label);
    if (!el) throw new Error("找不到下拉：" + label);
    return [...el.querySelectorAll("option")].map((o) => A.norm(o.innerText)).filter(Boolean);
  };
  A.dialogText = () => {
    const d = A.dialog();
    return d ? A.norm(d.innerText) : null;
  };
  /** 按 name 找控件，且要求它所在的作用域文本含 key（同页多个同名 input 时用） */
  A.fillNear = (name, key, value) => {
    const k = A.norm(key).toLowerCase();
    const list = [...document.querySelectorAll('[name="' + name + '"]')];
    if (!list.length) throw new Error("页面上没有 name=" + name + " 的控件");
    for (const el of list) {
      let node = el;
      for (let d = 0; d < 8 && node; d++) {
        node = node.parentElement;
        if (!node) break;
        if (A.norm(node.innerText).toLowerCase().includes(k)) {
          A.setNative(el, value);
          return { name, key: A.norm(key), value: el.value, tag: el.tagName };
        }
      }
    }
    const byValue = list.filter((el) => A.norm(el.value).toLowerCase().includes(k));
    if (byValue.length === 1) {
      A.setNative(byValue[0], value);
      return { name, key: A.norm(key), value: byValue[0].value, tag: byValue[0].tagName, via: "value" };
    }
    if (list.length === 1) {
      A.setNative(list[0], value);
      return { name, key: A.norm(key), value: list[0].value, tag: list[0].tagName, via: "only-one" };
    }
    throw new Error("name=" + name + " 的控件都不在含「" + key + "」的作用域里（共 " + list.length + " 个）");
  };
  A.valueNear = (name, key) => {
    const el = A.resolveNear(name, key, true);
    return el ? el.value : null;
  };
  /** 共用解析：按 name + 作用域/值线索定位控件 */
  A.resolveNear = (name, key, soft) => {
    const k = A.norm(key).toLowerCase();
    const list = [...document.querySelectorAll('[name="' + name + '"]')];
    if (!list.length) {
      if (soft) return null;
      throw new Error("页面上没有 name=" + name + " 的控件");
    }
    for (const el of list) {
      let node = el;
      for (let d = 0; d < 8 && node; d++) {
        node = node.parentElement;
        if (!node) break;
        if (A.norm(node.innerText).toLowerCase().includes(k)) return el;
      }
    }
    const byValue = list.filter((el) => A.norm(el.value).toLowerCase().includes(k));
    if (byValue.length === 1) return byValue[0];
    if (list.length === 1) return list[0];
    if (soft) return null;
    throw new Error("name=" + name + " 的控件都不在含「" + key + "」的作用域里（共 " + list.length + " 个）");
  };
  /** 提交控件所属的 form（内联改名这类没有按钮锚点的场景） */
  A.submitNear = (name, key) => {
    const el = A.resolveNear(name, key, false);
    const f = el.closest("form");
    if (!f) throw new Error("name=" + name + " 的控件不在任何 form 里");
    f.requestSubmit ? f.requestSubmit() : f.submit();
    return { name, key: A.norm(key), submitted: true };
  };
  A.check = (label) => {
    const el = A.field(label);
    if (!el) throw new Error("找不到控件：" + label);
    if (!el.checked) el.click();
    return { type: el.type, checked: el.checked };
  };
  A.pickByOption = (label, optionText) => {
    const el = A.field(label);
    if (!el) throw new Error("找不到下拉：" + label);
    const want = A.norm(optionText).toLowerCase();
    const op = [...el.querySelectorAll("option")].find((o) => A.norm(o.innerText).toLowerCase() === want)
      || [...el.querySelectorAll("option")].find((o) => A.norm(o.innerText).toLowerCase().includes(want));
    if (!op) throw new Error("下拉「" + label + "」无选项：" + optionText + "（现有：" + [...el.querySelectorAll("option")].map(o=>A.norm(o.innerText)).join(" / ") + "）");
    A.setNative(el, op.value);
    return { selected: A.norm(op.innerText), value: op.value };
  };
  A.optionsOf = (label) => {
    const el = A.field(label);
    if (!el) throw new Error("找不到下拉：" + label);
    return [...el.querySelectorAll("option")].map((o) => A.norm(o.innerText)).filter(Boolean);
  };
  A.value = (label) => {
    const el = A.field(label);
    if (!el) throw new Error("找不到控件：" + label);
    return el.value;
  };
  A.hasText = (t) => document.body.innerText.includes(t);
  A.text = () => document.body.innerText;
  A.slice = (from, len) => {
    const s = document.body.innerText;
    const i = s.indexOf(from);
    return i < 0 ? null : s.slice(Math.max(0, i - 120), i + (len || 320));
  };
  /** 从锚点文字「往后」取一段（取标签后面的数值时用，避免 -120 前窗把上一个值带进来） */
  A.after = (from, len) => {
    const s = document.body.innerText;
    const i = s.indexOf(from);
    return i < 0 ? null : s.slice(i, i + (len || 120));
  };
  /** 标签后第一个数字（计数类 KPI，如「在建项目数 2」，不带 ¥） */
  A.afterNumber = (from) => {
    const t = A.after(from, 90);
    if (!t) return null;
    const m = t.match(/(\d+(?:\.\d+)?)/);
    return m ? m[1] : null;
  };
  A.afterMoney = (from) => {
    const t = A.after(from, 90);
    if (!t) return null;
    const m = t.match(/¥\s?[-\d,]+(?:\.\d{2})?/);
    return m ? m[0].replace(/[¥\s,]/g, "") : null;
  };
  A.submitInForm = (marker) => {
    const m = A.norm(marker).toLowerCase();
    const forms = [...document.querySelectorAll("form")].filter(A.visible);
    const f = forms.find((x) => A.norm(x.innerText).toLowerCase().includes(m));
    if (!f) throw new Error("找不到含「" + marker + "」的表单（共 " + forms.length + " 个）");
    const btn = [...f.querySelectorAll("button[type=submit],button:not([type]),input[type=submit]")].find(A.visible);
    if (btn) { btn.click(); return { via: "button", text: A.textOf(btn) }; }
    f.requestSubmit ? f.requestSubmit() : f.submit();
    return { via: "requestSubmit" };
  };
  A.cssOf = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  A.rects = (sel) => [...document.querySelectorAll(sel)].filter(A.visible).map((e) => {
    const r = e.getBoundingClientRect();
    return { text: A.norm(e.innerText).slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), right: Math.round(r.right) };
  });
  window.__A = A;
  return true;
})()`;

/* ── 驱动 ─────────────────────────────────────────────────────── */
export class Browser {
  constructor({ port, userDataDir, windowSize }) {
    this.port = port;
    this.userDataDir = userDataDir;
    this.windowSize = windowSize || "1440,1000";
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.proc = null;
    this.eventLog = [];
  }

  static async launch(opts = {}) {
    const b = new Browser({
      port: opts.port || 9333,
      userDataDir:
        opts.userDataDir || resolve(tmpdir(), `cdp-accept-${Date.now()}`),
      windowSize: opts.windowSize,
    });
    await b.start();
    await b.open(opts.url || "about:blank");
    return b;
  }

  async start() {
    mkdirSync(this.userDataDir, { recursive: true });
    const exe = findBrowser();
    this.proc = spawn(exe, [
      "--headless=new",
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--hide-scrollbars",
      "--mute-audio",
      `--window-size=${this.windowSize}`,
      "--allow-file-access-from-files",
      "about:blank",
    ]);
    this.proc.on("error", (e) => console.error("[chrome spawn error]", e.message));
    // 等调试端点起来
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (r.ok) {
          this.version = (await r.json()).Browser;
          return this;
        }
      } catch {}
      await sleep(250);
    }
    this.close();
    throw new Error("Chrome 调试端点未就绪");
  }

  async open(url) {
    const r = await fetch(`http://127.0.0.1:${this.port}/json/new?${new URLSearchParams({ url })}`, {
      method: "PUT",
    });
    if (!r.ok) throw new Error("开标签失败 " + r.status);
    const target = await r.json();
    await this.connect(target.webSocketDebuggerUrl);
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.send("Network.enable");
    return target;
  }

  connect(wsUrl) {
    return new Promise((res, rej) => {
      if (this.ws) {
        try { this.ws.close(); } catch {}
      }
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.binaryType = "arraybuffer";
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: r, reject: j } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) j(new Error(msg.error.message || JSON.stringify(msg.error)));
          else r(msg.result);
        } else if (msg.method) {
          // 原生对话框（confirm/alert）必须立刻回，否则无头浏览器会卡在 confirm 上，
          // 表现是 Runtime.evaluate 超时——看着像页面挂了（本轮归档按钮就踩了这个）。
          if (msg.method === "Page.javascriptDialogOpening") {
            const id = ++this.id;
            this.ws.send(JSON.stringify({ id, method: "Page.handleJavaScriptDialog", params: { accept: true } }));
            this.lastDialog = msg.params;
          } else if (msg.method.startsWith("Network.") || msg.method.startsWith("Console.") || msg.method === "Runtime.exceptionThrown") {
            this.eventLog.push({ method: msg.method, params: msg.params, at: Date.now() });
          }
        }
      };
      ws.onerror = (e) => rej(new Error("ws error: " + (e.message || "unknown")));
      ws.onopen = () => res();
      setTimeout(() => rej(new Error("ws 连接超时")), 15000);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error("超时：" + method)); }, 60000);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(t); res(v); },
        reject: (e) => { clearTimeout(t); rej(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** 在当前页注入 window.__A（导航后需重来一次） */
  async goto(url, { waitMs = 500 } = {}) {
    await this.send("Page.navigate", { url });
    await this.waitForLoad();
    await sleep(waitMs);
    await this.evaluate(HELPERS);
    return url;
  }

  async waitForLoad(timeoutMs = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = await this.evaluate("document.readyState", false).catch(() => null);
      if (r === "complete") return true;
      await sleep(150);
    }
    return false;
  }

  async eval(expr, args) {
    const res = await this.send("Runtime.evaluate", {
      expression: args && args.length
        ? `((...a)=>{${expr}})(${args.map((a) => JSON.stringify(a)).join(",")})`
        : expr,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(d.exception?.description?.split("\n")[0] || d.text);
    }
    return res.result?.value;
  }

  /** 求值一个表达式；导航后助手掉了就重装再试一次 */
  async evaluate(expr) {
    const wrap = (e) => `(async()=>{ return (${e}); })()`;
    try {
      return await this.eval(wrap(expr));
    } catch (err) {
      const msg = String((err && err.message) || "");
      const helperGone = expr.includes("__A") && /Cannot read properties of undefined/i.test(msg);
      await this.eval(HELPERS).catch(() => {});
      if (!helperGone) throw err;
      return this.eval(wrap(expr));
    }
  }

  async installHelpers() {
    return this.eval(HELPERS);
  }

  async clickText(text, opt) {
    const r = await this.evaluate(`window.__A.clickText(${JSON.stringify(text)}, ${JSON.stringify(opt || null)})`);
    await this.settle(opt?.settle ?? 450);
    return r;
  }

  async fill(label, value) {
    return this.evaluate(`window.__A.fill(${JSON.stringify(label)}, ${JSON.stringify(value)})`);
  }

  async fillRow(key, label, value) {
    const r = await this.evaluate(
      `window.__A.fillRow(${JSON.stringify(key)}, ${JSON.stringify(label)}, ${JSON.stringify(value)})`
    );
    await this.settle(260);
    return r;
  }

  async rowValue(key, label) {
    return this.evaluate(`window.__A.rowValue(${JSON.stringify(key)}, ${JSON.stringify(label)})`);
  }

  async rowText(key) {
    return this.evaluate(`window.__A.rowText(${JSON.stringify(key)})`);
  }

  async rowButtons(key) {
    return this.evaluate(`window.__A.rowButtons(${JSON.stringify(key)})`);
  }

  async clickInRow(key, text) {
    const r = await this.evaluate(
      `window.__A.clickInRow(${JSON.stringify(key)}, ${JSON.stringify(text)})`
    );
    await this.settle(420);
    return r;
  }

  async pickRow(key) {
    const r = await this.evaluate(`window.__A.pickRow(${JSON.stringify(key)})`);
    await this.settle(500);
    return r;
  }

  async clickRow(key) {
    return this.pickRow(key);
  }

  async pickS(label, optionText) {
    const r = await this.evaluate(`window.__A.pickS(${JSON.stringify(label)}, ${JSON.stringify(optionText)})`);
    await this.settle(260);
    return r;
  }

  async optionsS(label) {
    return this.evaluate(`window.__A.optionsS(${JSON.stringify(label)})`);
  }

  /** 弹窗内填写（有 dialog 只在其中找） */
  async fillS(label, value) {
    const r = await this.evaluate(`window.__A.fillS(${JSON.stringify(label)}, ${JSON.stringify(value)})`);
    await this.settle(200);
    return r;
  }

  async clickS(text) {
    const r = await this.evaluate(`window.__A.clickS(${JSON.stringify(text)})`);
    await this.settle(500);
    return r;
  }

  async dialogText() {
    return this.evaluate(`window.__A.dialogText()`);
  }

  async fillNear(name, key, value) {
    const r = await this.evaluate(
      `window.__A.fillNear(${JSON.stringify(name)}, ${JSON.stringify(key)}, ${JSON.stringify(value)})`
    );
    await this.settle(220);
    return r;
  }

  async valueNear(name, key) {
    return this.evaluate(`window.__A.valueNear(${JSON.stringify(name)}, ${JSON.stringify(key)})`);
  }

  async submitNear(name, key) {
    const r = await this.evaluate(`window.__A.submitNear(${JSON.stringify(name)}, ${JSON.stringify(key)})`);
    await this.settle(1200);
    return r;
  }

  async pick(label, optionText) {
    return this.evaluate(`window.__A.pickByOption(${JSON.stringify(label)}, ${JSON.stringify(optionText)})`);
  }

  async options(label) {
    return this.evaluate(`window.__A.optionsOf(${JSON.stringify(label)})`);
  }

  async check(label) {
    return this.evaluate(`window.__A.check(${JSON.stringify(label)})`);
  }

  async pickRadio(name, value) {
    const r = await this.evaluate(`window.__A.pickRadio(${JSON.stringify(name)}, ${JSON.stringify(value)})`);
    await this.settle(250);
    return r;
  }

  async value(label) {
    return this.evaluate(`window.__A.value(${JSON.stringify(label)})`);
  }

  async submitInForm(marker) {
    const r = await this.evaluate(`window.__A.submitInForm(${JSON.stringify(marker)})`);
    await this.settle();
    return r;
  }

  async text() {
    return this.evaluate(`window.__A.text()`);
  }

  async slice(from, len) {
    return this.evaluate(`window.__A.slice(${JSON.stringify(from)}, ${len || 320})`);
  }

  async hasText(t) {
    return this.evaluate(`window.__A.hasText(${JSON.stringify(t)})`);
  }

  async css(sel, prop) {
    return this.evaluate(`window.__A.cssOf(${JSON.stringify(sel)}, ${JSON.stringify(prop)})`);
  }

  async url() {
    return this.evaluate("location.href", false);
  }

  /** 轮询等表达式为真 */
  async waitFor(expr, { timeout = 8000, step = 200 } = {}) {
    const t0 = Date.now();
    for (;;) {
      const ok = await this.evaluate(expr).catch(() => false);
      if (ok) return ok;
      if (Date.now() - t0 > timeout) throw new Error("等待超时：" + expr.slice(0, 90));
      await sleep(step);
    }
  }

  /** server action 之后等一轮（Next 客户端路由 + revalidate 有延迟） */
  async settle(ms = 700) {
    await sleep(ms);
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const busy = await this.evaluate("!!document.querySelector('[aria-busy=true]')").catch(() => false);
      if (!busy) break;
      await sleep(150);
    }
    await sleep(120);
  }

  async shot(path) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(r.data, "base64"));
    return path;
  }

  async fullShot(path) {
    const metrics = await this.send("Page.getLayoutMetrics");
    const w = Math.ceil(metrics.cssContentSize.width);
    const h = Math.min(Math.ceil(metrics.cssContentSize.height), 9000);
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(300);
    const r = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(path, Buffer.from(r.data, "base64"));
    await this.send("Emulation.clearDeviceMetricsOverride");
    return path;
  }

  /** 上传文件到 input[type=file] */
  async uploadFiles(labelOrSel, files) {
    const { root } = await this.send("DOM.getDocument", { depth: -1 });
    const sel = labelOrSel.startsWith("input") || labelOrSel.startsWith("#") || labelOrSel.startsWith(".")
      ? labelOrSel
      : null;
    const q = await this.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: sel || "input[type=file]",
    });
    if (!q.nodeId) throw new Error("找不到 file input：" + labelOrSel);
    await this.send("DOM.setFileInputFiles", { nodeId: q.nodeId, files: files.map((f) => resolve(f)) });
    await this.evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(sel || "input[type=file]")});el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`
    );
    await this.settle();
    return true;
  }

  consoleErrors() {
    const out = [];
    for (const e of this.eventLog) {
      if (e.method === "Runtime.exceptionThrown") {
        out.push("EXC " + (e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text));
      }
      if (e.method === "Network.loadingFailed") {
        const p = e.params;
        if (!/aborted|ERR_ABORTED/i.test(p.errorText || "")) out.push("NETFAIL " + p.type + " " + p.errorText);
      }
    }
    return [...new Set(out)];
  }

  close() {
    try { this.ws && this.ws.close(); } catch {}
    try { this.proc && this.proc.kill("SIGKILL"); } catch {}
    try {
      rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {}
  }
}

export { sleep, HELPERS };
