import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const roots = ["src/app", "src/modules", "src/core/ui"];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f).split(String.fromCharCode(92)).join("/"); const s = statSync(p); if (s.isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
roots.forEach(walk);
const out = {};
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const texts = new Set();
  // JSX 文本节点：<Tag ...>中文</Tag>  以及裸中文行
  for (const m of src.matchAll(/>([^<>{}\n]*[一-龥][^<>{}\n]*)</g)) { const t = m[1].trim(); if (t && t.length <= 18) texts.add(t); }
  for (const m of src.matchAll(/(?:label|placeholder|title|aria-label|confirmText|emptyText)\s*=\s*[{"]{1,2}([^"'}]{2,24})["}]/g)) texts.add("#" + m[1].trim());
  for (const m of src.matchAll(/<Button[^>]*>\s*(?:\{)?\s*["']([^"']{2,18})["']/g)) texts.add("@" + m[1]);
  for (const m of src.matchAll(/<Input[^>]*name="([^"]+)"/g)) texts.add("i:" + m[1]);
  for (const m of src.matchAll(/<Select[^>]*name="([^"]+)"/g)) texts.add("s:" + m[1]);
  for (const m of src.matchAll(/<Textarea[^>]*name="([^"]+)"/g)) texts.add("t:" + m[1]);
  for (const m of src.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"/g)) texts.add("h:" + m[1]);
  if (texts.size) out[f] = [...texts];
}
const only = process.argv[2];
for (const [f, t] of Object.entries(out)) {
  if (only && !f.includes(only)) continue;
  console.log("\n## " + f);
  console.log("   " + t.join(" · "));
}
