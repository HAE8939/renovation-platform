/**
 * verify-sign.mts —— 签约归并建项目的【端到端集成门禁】（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-crm.mjs 只断言归并的纯函数决策（normalizePhone/pickClientByPhone），
 * 覆盖不到 signLead→createProject 的**事务传播**与**幂等**——M3-d2 正是靠本脚本抓出
 * 「signLead 自开事务建 Client、createProject 又开独立事务看不见它」的真 bug（SQLite 隔离）。
 * 集成门禁必须真跑生产 signLead，故用 tsx 解析 @/ 别名直连。
 *
 * 运行配方（三步，指向一个临时库）：
 *   DATABASE_URL="file:../_scratch/sign.db" npx prisma migrate deploy
 *   DATABASE_URL="file:../_scratch/sign.db" npx prisma db seed
 *   DATABASE_URL="file:../_scratch/sign.db" npx tsx --tsconfig tsconfig.json scripts/verify-sign.mts
 * 退出码 0=全过，1=有 FAIL。临时库跑完可留可删（在 _scratch 下，不入库）。
 */
import { prisma } from "@/core/db";
import { signLead } from "@/modules/crm/server/leads";

const norm = (s: string | null) => (s ? s.replace(/[\s-]/g, "").replace(/\D/g, "") : "");

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: "default" } });
  if (!org) throw new Error("seed 未建默认组织（先跑 prisma db seed）");
  const lead = await prisma.lead.findUnique({ where: { code: "LEAD-2026-001" } });
  if (!lead) throw new Error("LEAD-2026-001 不存在（先跑 prisma db seed）");
  const phone = lead.phone;

  // 1) 首次签约 + 2) 幂等重签（合同额给不同值，验证不覆盖）
  const r1 = await signLead(lead.id, { contractAmount: 380000, designer: "张三", pm: "李四" });
  const r2 = await signLead(lead.id, { contractAmount: 999999, designer: "王五", pm: "赵六" });
  chk("幂等：两次 signLead 返回同一 projectId", r1.projectId === r2.projectId);

  const proj = await prisma.project.findUnique({ where: { id: r1.projectId } });
  chk("建出项目存在", !!proj);
  chk("合同额=首次 380000（二次不覆盖）", !!proj && proj.contractAmount === 380000);
  chk("项目 status=draft（筹备中）", !!proj && proj.status === "draft");
  chk("项目 source 从 lead 带入", !!proj && proj.source === lead.source);
  chk("项目 designer=张三（首次，不被二次覆盖）", !!proj && proj.designer === "张三");

  const leadAfter = await prisma.lead.findUnique({ where: { id: lead.id } });
  chk("lead.projectId 已回写", !!leadAfter && leadAfter.projectId === r1.projectId);
  chk("lead.stage=signed", !!leadAfter && leadAfter.stage === "signed");

  const clients = await prisma.client.findMany({ where: { orgId: org.id } });
  chk("同手机号 Client 恰好 1 个（未重复）", clients.filter((c) => norm(c.phone) === norm(phone)).length === 1);

  // 3) 第二条同手机号 lead 签约 → 复用同一 Client、另建不同 Project
  const lead2 = await prisma.lead.create({
    data: { orgId: org.id, code: "LEAD-VERIFY-TMP", name: "同号客户", phone, estate: "同号楼盘", stage: "quoted" },
  });
  const r3 = await signLead(lead2.id, { contractAmount: 100000 });
  const proj3 = await prisma.project.findUnique({ where: { id: r3.projectId } });
  chk("第二条 lead 建了不同项目", r3.projectId !== r1.projectId);
  chk("第二条 lead 复用同一 Client（clientId 相同）", !!proj && !!proj3 && proj3.clientId === proj.clientId);
  const clientsAfter = await prisma.client.findMany({ where: { orgId: org.id } });
  chk("归并后同手机号仍只 1 个 Client", clientsAfter.filter((c) => norm(c.phone) === norm(phone)).length === 1);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n集成结果：${results.length - failed}/${results.length} 通过`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("集成脚本异常：", e);
  await prisma.$disconnect();
  process.exit(1);
});
