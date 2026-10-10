/**
 * verify-schedule-gen.mts —— 排程生成/清空的【端到端集成门禁】（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-schedule.mjs 只断言纯函数；generateSchedule / clearSchedule 的
 * 事务路径（单 tx 逐条 create 收集 id → createMany 依赖边）必须真跑生产服务层才能覆盖——
 * 承 M3-d2 教训（跨函数事务不共享连接，只有端到端集成能抓）。
 *
 * 运行配方（三步，指向一个临时库；在仓库根跑）：
 *   DATABASE_URL="file:../_scratch/schedgen.db" npx prisma migrate deploy
 *   DATABASE_URL="file:../_scratch/schedgen.db" npx prisma db seed
 *   DATABASE_URL="file:../_scratch/schedgen.db" npx tsx --tsconfig tsconfig.json scripts/verify-schedule-gen.mts
 * 退出码 0=全过，1=有 FAIL。临时库在 _scratch 下，不入库。
 */
import { prisma } from "@/core/db";
import {
  clearSchedule,
  generateSchedule,
  ScheduleGenerateError,
} from "@/modules/schedule/server/generate";
import { buildSchedule } from "@/modules/schedule/plan";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

async function main() {
  // 前置：seed 已建演示项目（004 = 未排程手测位）
  const p4 = await prisma.project.findUnique({ where: { code: "RP-2026-004" } });
  if (!p4 || !p4.startDate) throw new Error("RP-2026-004 或开工日缺失（先跑 prisma db seed）");
  const before004 = await prisma.scheduleTask.count({ where: { projectId: p4.id } });
  chk("前置：004 起始无排程", before004 === 0, `实际 ${before004}`);

  // 独立预言机：直接读 gt130 模板 + buildSchedule 复算期望链
  const rows = await prisma.processTemplate.findMany({
    where: { tier: "gt130" },
    orderBy: { order: "asc" },
    select: { name: true, order: true, days: true },
  });
  chk("前置：gt130 模板 11 行", rows.length === 11, `实际 ${rows.length}`);

  // ── 1) 生成 ────────────────────────────────────────────────
  await generateSchedule(p4.id);
  const tasks = await prisma.scheduleTask.findMany({
    where: { projectId: p4.id },
    orderBy: { order: "asc" },
  });
  chk("生成后任务数 = 11", tasks.length === 11, `实际 ${tasks.length}`);

  const sd = p4.startDate;
  const startNorm = new Date(
    Date.UTC(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate())
  );
  const expect = buildSchedule(rows, startNorm);
  let chainOk = tasks.length === expect.length;
  for (let i = 0; i < Math.min(tasks.length, expect.length); i++) {
    if (
      tasks[i].name !== expect[i].name ||
      tasks[i].startDate.getTime() !== expect[i].start.getTime() ||
      tasks[i].endDate.getTime() !== expect[i].end.getTime()
    ) {
      chainOk = false;
    }
  }
  chk("11 工序逐条与 buildSchedule 预言机一致（名/起/止）", chainOk);
  chk(
    "默认值：progress=0 且 status=pending 且实际起止为空",
    tasks.every(
      (t) => t.progress === 0 && t.status === "pending" && !t.actualStart && !t.actualEnd
    )
  );
  chk(
    "链尾 = 开工日 + 106 天（gt130 总工期 107 天）",
    tasks.length === 11 && tasks[10].endDate.getTime() === startNorm.getTime() + 106 * MS_PER_DAY
  );

  const deps = await prisma.scheduleTaskDependency.findMany({
    where: { task: { projectId: p4.id } },
  });
  chk("依赖边 = 10 条", deps.length === 10, `实际 ${deps.length}`);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const edgeOk = deps.every((d) => {
    const ti = byId.get(d.taskId);
    const di = byId.get(d.dependsOnId);
    return !!ti && !!di && ti.order === di.order + 1;
  });
  chk("依赖边均为相邻（i 依赖 i-1）", edgeOk);

  // ── 2) 重复生成防护 ────────────────────────────────────────
  let guarded = false;
  let guardMsg = "";
  try {
    await generateSchedule(p4.id);
  } catch (e) {
    guarded = e instanceof ScheduleGenerateError;
    guardMsg = e instanceof Error ? e.message : String(e);
  }
  chk("重复生成被拒（ScheduleGenerateError「已存在排程」）", guarded && guardMsg.includes("已存在"), guardMsg);
  const afterGuard = await prisma.scheduleTask.count({ where: { projectId: p4.id } });
  chk("被拒后数据未变（仍 11 条）", afterGuard === 11, `实际 ${afterGuard}`);

  // ── 3) 清空（依赖随 Cascade）────────────────────────────────
  await clearSchedule(p4.id);
  const afterClear = await prisma.scheduleTask.count({ where: { projectId: p4.id } });
  const afterClearDeps = await prisma.scheduleTaskDependency.count({
    where: { task: { projectId: p4.id } },
  });
  const orphanDeps = await prisma.scheduleTaskDependency.count({
    where: { dependsOn: { projectId: p4.id } },
  });
  chk("清空后 004 任务 = 0", afterClear === 0, `实际 ${afterClear}`);
  chk("清空后 004 依赖 = 0（Cascade 双向无孤儿）", afterClearDeps === 0 && orphanDeps === 0, `task=${afterClearDeps} dependsOn=${orphanDeps}`);

  // ── 4) 旁证：其余项目不受波及 ───────────────────────────────
  const p1 = await prisma.project.findUnique({ where: { code: "RP-2026-001" } });
  const p1Count = p1 ? await prisma.scheduleTask.count({ where: { projectId: p1.id } }) : 0;
  chk("001 排程不受波及（= 11）", p1Count === 11, `实际 ${p1Count}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
