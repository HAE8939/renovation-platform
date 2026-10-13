import { openDb } from "./harness.mjs";
const db = openDb();
const projects = await db.project.findMany({ select:{ id:true, code:true, name:true, area:true, contractAmount:true, status:true }, orderBy:{ code:"asc" } });
console.log("── 项目 ──");
for (const p of projects) console.log(`${p.code} | ${p.name} | id=${p.id} | area=${p.area} | 合同=${p.contractAmount} | ${p.status}`);
const quotes = await db.budgetQuote.findMany({ select:{ id:true, projectId:true, status:true, taxRate:true, _count:{select:{items:true}} }, orderBy:{id:"asc"} });
console.log("\n── 报价单 ──");
for (const q of quotes) console.log(`quote=${q.id} proj=${q.projectId} ${q.status} tax=${q.taxRate} items=${q._count.items}`);
const leads = await db.lead.findMany({ select:{ id:true, code:true, clientName:true, stage:true, phone:true, intentAmount:true }, orderBy:{code:"asc"} });
console.log("\n── 线索 "+leads.length+" 条 ──");
for (const l of leads) console.log(`${l.code} | ${l.clientName} | ${l.stage} | id=${l.id}`);
const nodes = await db.acceptanceNode.findMany({ select:{ id:true, projectId:true, name:true, status:true }, orderBy:{id:"asc"} });
console.log("\n── 验收节点按项目 ──");
const byP = {}; for(const n of nodes){ (byP[n.projectId] ||= []).push(n.name+":"+n.status); }
for (const [pid, list] of Object.entries(byP)) { const p = projects.find(x=>x.id===pid); console.log(`${p?p.code:pid} → ${list.join(", ")}`); }
console.log("\n── 其他计数 ──");
console.log("科目", await db.catalogCategory.count(), "模板项", await db.catalogItem.count(),
  "| 收支", await db.financeRecord.count(), "| 付款段", await db.paymentNode.count(),
  "| 变更单", await db.changeOrder.count(), "| 字段定义", await db.customFieldDef.count(),
  "| 排程任务", await db.scheduleTask.count(), "| 问题", await db.issue.count(), "| PlatformSetting themeKey=", (await db.platformSetting.findUnique({where:{id:"platform"}}))?.themeKey);
await db.$disconnect();
