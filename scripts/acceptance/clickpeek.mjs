/**
 * clickpeek.mjs —— 点几下再 dump 界面控件（写场景前摸抽屉/弹窗结构）
 * 跑法：node _scratch/accept/clickpeek.mjs <路径> ["要点的文字" ...]
 */
import { startServer, openDb } from "./harness.mjs";
import { Browser } from "./cdp.mjs";

const [path, ...clicks] = process.argv.slice(2);
const srv = await startServer();
const br = await Browser.launch({ port: 9349 });
const dump = async (label) => {
  const info = await br.evaluate(`(() => {
    const A = window.__A;
    const ctrls = [...document.querySelectorAll('input,select,textarea')].filter(e=>A.visible(e)||e.classList.contains('sr-only'));
    return {
      url: location.pathname,
      buttons: [...new Set([...document.querySelectorAll('button,[role=button],summary')].filter(A.visible).map(e=>A.norm(e.innerText)))],
      fields: ctrls.map(e=>e.tagName.toLowerCase()+(e.type?':'+e.type:'')+(e.name?' name='+e.name:'')+' “'+(A.labelOf(e).split('|').filter(Boolean)[0]||'').slice(0,46)+'” 值='+JSON.stringify(String(e.value).slice(0,20))),
      tables: [...document.querySelectorAll('table')].map((t,i)=>'表'+i+'：'+[...t.querySelectorAll('thead th')].map(x=>A.norm(x.innerText)).join('·')+'（'+t.querySelectorAll('tbody tr').length+' 行）'),
      rows: [...document.querySelectorAll('table')].slice(0,2).map(t=>[...t.querySelectorAll('tbody tr')].slice(0,4).map(tr=>[...tr.querySelectorAll('td,th')].map(td=>A.norm(td.innerText).slice(0,22)).join(' | '))),
      forms: [...document.querySelectorAll('form')].length,
      heading: [...document.querySelectorAll('h1,h2,h3')].map(e=>A.norm(e.innerText)).join(' / '),
      tail: A.norm(document.body.innerText).slice(-320),
    };
  })()`);
  console.log(`\n████ ${label} ████  ${info.url}`);
  console.log("标题：" + info.heading + " · 表单 " + info.forms);
  console.log("按钮：" + info.buttons.join(" | "));
  console.log("控件：" + info.fields.join("\n      "));
  console.log("表格：" + info.tables.join(" ;; "));
  info.rows.forEach((r, i) => r.forEach((line) => console.log(`  表${i}行: ${line}`)));
  console.log("页尾：" + info.tail);
};

try {
  await br.goto(srv.url + path);
  await dump("初始");
  for (const c of clicks) {
    try {
      const r = await br.clickText(c);
      await dump("点击“" + c + "”→ " + JSON.stringify(r));
    } catch (e) {
      console.log("\n✗ 点击“" + c + "”失败：" + e.message);
    }
  }
} finally {
  const db = openDb();
  await db.$disconnect();
  br.close();
  srv.stop();
}
