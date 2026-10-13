/**
 * peek.mjs —— 页面控件清单探针（写场景前先摸清界面有哪些可点/可填）
 * 跑法：node _scratch/accept/peek.mjs /budget/RP-2026-001 /crm ...
 */
import { startServer, openDb } from "./harness.mjs";
import { Browser } from "./cdp.mjs";

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("用法：node _scratch/accept/peek.mjs <路径> [<路径>...]");
  process.exit(2);
}

const srv = await startServer();
const br = await Browser.launch({ port: 9341 });
const out = [];
try {
  for (const p of urls) {
    await br.goto(srv.url + p);
    const info = await br.evaluate(`(() => {
      const A = window.__A;
      const uniq = (a) => [...new Set(a.filter(Boolean))];
      const btns = uniq([...document.querySelectorAll('button,[role=button],input[type=submit],summary')].filter(A.visible).map(e=>A.norm(e.innerText||e.value)));
      const links = uniq([...document.querySelectorAll('a')].filter(A.visible).map(e=>A.norm(e.innerText)+' → '+e.getAttribute('href')));
      const fields = uniq([...document.querySelectorAll('input,select,textarea')].map(e=>{
        const kind = e.tagName.toLowerCase()+':'+(e.type||'')+':'+(e.name||'-');
        const lab = A.labelOf(e).split('|').filter(Boolean)[0] || '';
        return kind+' 「'+lab.slice(0,40)+'」';
      }));
      const tables = [...document.querySelectorAll('table')].map((t,i)=>'表'+i+' 头：'+[...t.querySelectorAll('thead th')].map(x=>A.norm(x.innerText)).join(' · ')+'（'+t.querySelectorAll('tbody tr').length+' 行）');
      const forms = [...document.querySelectorAll('form')].length;
      const headings = uniq([...document.querySelectorAll('h1,h2,h3')].map(e=>A.norm(e.innerText)));
      return { btns, links, fields, tables, forms, headings, chars: document.body.innerText.length };
    })()`);
    out.push({ path: p, ...info });
  }
} finally {
  const db = openDb();
  await db.$disconnect();
  br.close();
  srv.stop();
}

for (const o of out) {
  console.log("\n══ " + o.path + " ══ 正文 " + o.chars + " 字 · 表单 " + o.forms + " 个");
  console.log("标题：" + o.headings.join(" / "));
  console.log("按钮(" + o.btns.length + ")：" + o.btns.slice(0, 60).join(" | "));
  console.log("控件(" + o.fields.length + ")：" + o.fields.slice(0, 40).join(" | "));
  console.log("表格：" + (o.tables.join(" ;; ") || "无"));
  console.log("链接(" + o.links.length + ")：" + o.links.slice(0, 40).join(" | "));
}
