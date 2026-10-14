/**
 * prisma/bootstrap.mjs —— 空库最小引导（M13-c）
 *
 * 存在的理由：新容器挂空卷时，core/domain/projects.ts 会在无 Organization 时直接抛
 * 「请先运行 prisma db seed」，而 seed 会连演示客户/财务/线索一起灌进真实库。
 * 内测部署需要的是"能被使用的最小骨架"，不是"能被演示的数据集"。
 *
 * 本脚本只做两件事，且幂等（可重复执行、可放进 CMD）：
 *   ① 确保默认 Organization 存在
 *   ② 确保至少有一个 boss 用户（流水与录入人的默认归属）
 * 不建客户、不建项目、不灌任何演示数据。
 *
 * 用纯 JS + @prisma/client：容器 runner 里没有 tsx，seed 那条链在 production 依赖下跑不动。
 *
 * 用法：node prisma/bootstrap.mjs        （DATABASE_URL 决定落哪个库）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG_SLUG = "default";
const ORG_NAME = process.env.BOOTSTRAP_ORG_NAME || "默认工作室";
const BOSS_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@renovation.local";
const BOSS_NAME = process.env.BOOTSTRAP_ADMIN_NAME || "管理员";

/**
 * boss 而非 owner：USER_ROLE 常量表（core/domain/types.ts:58）里的老板值是 "boss"，
 * 没有 "owner"。历史上 seed 写的是 "owner"，只靠 resolveActor 的
 * 「缺 boss 则取最早的任意用户」兜底才没出错——那是巧合不是设计。
 */
const BOSS_ROLE = "boss";

async function main() {
  let org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG } });
  if (org) {
    console.log(`组织已存在，跳过创建：${org.name}（slug=${org.slug}）`);
  } else {
    org = await prisma.organization.create({
      data: { name: ORG_NAME, slug: ORG_SLUG },
    });
    console.log(`已创建默认组织：${org.name}（slug=${org.slug}）`);
  }

  const existingBoss = await prisma.user.findFirst({
    where: { role: BOSS_ROLE },
    select: { id: true, name: true, email: true },
  });
  if (existingBoss) {
    console.log(`已存在 boss 用户，跳过创建：${existingBoss.name} <${existingBoss.email}>`);
  } else {
    const byEmail = await prisma.user.findUnique({ where: { email: BOSS_EMAIL } });
    if (byEmail) {
      // 老库里的历史账号（seed 建的「管理员」）：补上合法角色，不动其它字段
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { role: BOSS_ROLE },
      });
      console.log(`已将既有账号角色补为 ${BOSS_ROLE}：${byEmail.name} <${byEmail.email}>`);
    } else {
      const created = await prisma.user.create({
        data: { orgId: org.id, name: BOSS_NAME, email: BOSS_EMAIL, role: BOSS_ROLE },
      });
      console.log(`已创建 boss 账号：${created.name} <${created.email}>`);
    }
  }

  const counts = {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
  };
  console.log(`引导完成 · organizations=${counts.organizations} users=${counts.users}`);
  console.log(
    "下一步：打开平台即可建客户与项目。要演示数据请另跑 `pnpm db:seed`（会一并灌入假客户与台账，勿在真实库执行）。"
  );
}

main()
  .catch((e) => {
    console.error("引导失败：", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
