/**
 * prisma/seed-templates.mjs —— 工序模板库引导（业务配置，非演示数据）
 *
 * 存在的理由：ProcessTemplate 是“新建项目排程自动套用标准工期”的必需配置
 * （11 道工序 × 3 面积档 = 33 行），不是可选的演示数据。但历史上它被埋在
 * prisma/seed.ts 的 seedSchedule() 里，和假客户/假台账混在一起；容器 CMD 只跑
 * bootstrap.mjs（组织 + boss），不跑完整 seed，导致内测部署“工序模板库”空壳、
 * 新排程无标准天数可套。本脚本把这块业务配置单独剥离，可安全放进 CMD。
 *
 * 与 seed.ts 的关系：天数常量与 seed.ts:250 SCHEDULE_PROCESS 逐字一致（照抄 v5.1
 * §6.5.2 / TASK_M6 §3，三档实算 lt90=54 / b90_130=76 / gt130=107）。改工期只改一处
 * 口径由本脚本承接；seed.ts 的 seedSchedule() 仍按 count()==0 灌同一批，两者幂等不冲突。
 *
 * 幂等且自愈：按 schema @@unique([tier, order]) 做 upsert，不整表判空。
 * 重复执行不报错、不清空人工改动之外的行；漏一行会自动补、错一行按 (tier,order)
 * 覆盖为标准天数。注意：这会把手工改过的“标准天数”拉回本表口径——若线上有意的
 * 个性化标准工期，应改本脚本常量而非在页面上改，否则下次启动被覆盖。
 *
 * 用纯 JS + @prisma/client：与 bootstrap.mjs 同理，production 依赖链下不依赖 tsx。
 *
 * 用法：node prisma/seed-templates.mjs        （DATABASE_URL 决定落哪个库）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 11 道工序 × 3 面积档。tier 取值须与 schema.prisma:361 注释一致。
const TIERS = ["lt90", "b90_130", "gt130"];
const SCHEDULE_PROCESS = [
  { name: "拆除工程", order: 1, days: { lt90: 3, b90_130: 5, gt130: 7 } },
  { name: "水电工程", order: 2, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "泥工工程", order: 3, days: { lt90: 10, b90_130: 14, gt130: 18 } },
  { name: "防水工程", order: 4, days: { lt90: 3, b90_130: 3, gt130: 5 } },
  { name: "地面工程", order: 5, days: { lt90: 5, b90_130: 7, gt130: 10 } },
  { name: "墙面工程", order: 6, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "天花工程", order: 7, days: { lt90: 7, b90_130: 10, gt130: 14 } },
  { name: "乳胶漆工程", order: 8, days: { lt90: 5, b90_130: 7, gt130: 10 } },
  { name: "定制工程", order: 9, days: { lt90: 3, b90_130: 5, gt130: 7 } },
  { name: "水电安装", order: 10, days: { lt90: 3, b90_130: 3, gt130: 5 } },
  { name: "竣工清洁", order: 11, days: { lt90: 1, b90_130: 2, gt130: 3 } },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const p of SCHEDULE_PROCESS) {
    for (const tier of TIERS) {
      const days = p.days[tier];
      const existing = await prisma.processTemplate.findUnique({
        where: { tier_order: { tier, order: p.order } },
        select: { id: true, name: true, days: true },
      });
      if (existing) {
        // 名称/天数与标准口径不一致才写，避免每次启动无谓更新 createdAt 之外的行。
        if (existing.name !== p.name || existing.days !== days) {
          await prisma.processTemplate.update({
            where: { tier_order: { tier, order: p.order } },
            data: { name: p.name, days },
          });
          updated++;
        }
      } else {
        await prisma.processTemplate.create({
          data: { name: p.name, order: p.order, tier, days },
        });
        created++;
      }
    }
  }

  // 自检：三档各 11、共 33，与 schema 唯一约束口径对齐。
  const total = await prisma.processTemplate.count();
  const tierCounts = await prisma.processTemplate.groupBy({ by: ["tier"], _count: true });
  const tierMap = Object.fromEntries(tierCounts.map((t) => [t.tier, t._count ?? 0]));
  if (
    total !== 33 ||
    tierMap.lt90 !== 11 ||
    tierMap.b90_130 !== 11 ||
    tierMap.gt130 !== 11
  ) {
    throw new Error(
      `工序模板自检失败：应 33 行三档各 11，实际 ${total}（lt90=${tierMap.lt90 ?? 0} b90_130=${tierMap.b90_130 ?? 0} gt130=${tierMap.gt130 ?? 0}）`
    );
  }

  console.log(
    `工序模板引导完成：新增 ${created} · 校正 ${updated} · 合计 ${total}（三档各 11）`
  );
}

main()
  .catch((e) => {
    console.error("工序模板引导失败：", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
