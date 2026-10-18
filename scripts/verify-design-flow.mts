/**
 * verify-design-flow.mts —— 设计任务【新建与指派】的端到端集成门禁（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-design.mjs 只断言纯函数；createDesignTask / assignDesignTask 的
 * 事务、关联实体存在性校验、状态推进与编号生成必须真跑生产服务层才能覆盖
 * （承 STATUS §8“改服务层写入 → 集成门禁零回退”）。M5-e 是全站第一次有设计任务写入口，
 * 断链风险最高，必须有独立集成门禁兜住。
 *
 * 隔离库：_scratch/design-flow.db（run-gates 会 prisma migrate reset 自动建表 + seed）。
 *
 * 运行配方（三步，指向临时库；在仓库根跑）：
 *   DATABASE_URL="file:../_scratch/design-flow.db" npx prisma migrate reset --force --skip-generate
 *   （reset 会按 package.json prisma.seed 自动灌 seed：组织/用户/项目/演示任务齐全）
 *   DATABASE_URL="file:../_scratch/design-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-design-flow.mts
 * 退出码 0=全过，1=有 FAIL。临时库在 _scratch 下，不入库。
 */
import { prisma } from "@/core/db";
import {
  assignDesignTask,
  createDesignTask,
  DesignTaskError,
  listDesignFormOptions,
  suggestDesignTaskCode,
} from "@/modules/design/server/create";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function expectError(fn: () => Promise<unknown>, includes: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof DesignTaskError && (e as Error).message.includes(includes);
  }
}

async function main() {
  // 前置：seed 已建非归档项目 + 用户
  const project = await prisma.project.findFirst({ where: { status: { not: "archived" } } });
  if (!project) throw new Error("库中无非归档项目（先跑 prisma db seed）");
  const anyUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!anyUser) throw new Error("库中无用户（先跑 prisma db seed）");

  const startCount = await prisma.designTask.count();
  const startCode = await suggestDesignTaskCode();
  chk("前置：code 预测以 DES- 年份前缀", /^DES-\d{4}-\d{3}$/.test(startCode), startCode);

  // ── 1) 新建：不带负责人 → 待分配 ────────────────────────────
  const t1 = await createDesignTask({
    projectId: project.id,
    title: "门禁任务A",
    type: "scheme",
    requirement: "验房方案",
  });
  const t1row = await prisma.designTask.findUnique({ where: { id: t1.id } });
  chk("新建无负责人 → status=pending", t1row?.status === "pending", t1row?.status);
  chk("新建无负责人 → assigneeId=null", t1row?.assigneeId === null);
  chk("新建 code 匹配 DES 规范", /^DES-\d{4}-\d{3}$/.test(t1row?.code ?? ""), t1row?.code);
  chk("新建总数 +1", (await prisma.designTask.count()) === startCount + 1);

  // ── 2) 新建：带负责人 → 进行中 ──────────────────────────────
  const t2 = await createDesignTask({
    projectId: project.id,
    title: "门禁任务B",
    type: "rendering",
    priority: "high",
    deadlineIso: "2026-12-31",
    assigneeId: anyUser.id,
  });
  const t2row = await prisma.designTask.findUnique({ where: { id: t2.id } });
  chk("新建带负责人 → status=assigned", t2row?.status === "assigned", t2row?.status);
  chk("新建带负责人 → assigneeId 写入", t2row?.assigneeId === anyUser.id);
  chk("新建带截止日期 → deadline 已存", !!t2row?.deadline);
  chk("新建 code 递增（≠ 上一张）", t2row?.code !== t1row?.code, `${t1row?.code} vs ${t2row?.code}`);

  // ── 3) 建单校验守卫（事务前抛错，不写库）────────────────────
  chk("空标题被拒", await expectError(() => createDesignTask({ projectId: project.id, title: "  ", type: "scheme" }), "标题"));
  chk("非法类型被拒", await expectError(() => createDesignTask({ projectId: project.id, title: "X", type: "nope" }), "类型"));
  chk("非法优先级被拒", await expectError(() => createDesignTask({ projectId: project.id, title: "X", type: "scheme", priority: "urgent" }), "优先级"));
  chk("非法截止日期被拒", await expectError(() => createDesignTask({ projectId: project.id, title: "X", type: "scheme", deadlineIso: "乱码" }), "截止日期"));
  chk("幽灵项目被拒", await expectError(() => createDesignTask({ projectId: "no-such-project", title: "X", type: "scheme" }), "项目不存在"));
  chk("幽灵负责人被拒", await expectError(() => createDesignTask({ projectId: project.id, title: "X", type: "scheme", assigneeId: "no-such-user" }), "负责人不存在"));
  chk(
    "守卫拒绝未污染计数（仍 = 起点 +2）",
    (await prisma.designTask.count()) === startCount + 2,
    `实际 ${await prisma.designTask.count()}`
  );

  // ── 4) 指派：待分配 → 进行中 ────────────────────────────────
  const asg = await assignDesignTask(t1.id, anyUser.id);
  const t1after = await prisma.designTask.findUnique({ where: { id: t1.id } });
  chk("指派 pending 返回 before=pending", asg.before === "pending");
  chk("指派 pending 返回 after=assigned", asg.after === "assigned");
  chk("指派后 assigneeId 落库", t1after?.assigneeId === anyUser.id && t1after?.status === "assigned");

  // 改派（已 assigned 再指派保持原态）
  const reassigned = await assignDesignTask(t1.id, anyUser.id);
  chk("改派 assigned 保持 assigned（不重置态）", reassigned.before === "assigned" && reassigned.after === "assigned");

  // ── 5) 指派门控：submitted / approved 不可指派 ──────────────
  await prisma.designTask.update({ where: { id: t2.id }, data: { status: "submitted" } });
  chk(
    "指派 submitted 任务被拒",
    await expectError(() => assignDesignTask(t2.id, anyUser.id), "不可指派")
  );
  await prisma.designTask.update({ where: { id: t2.id }, data: { status: "approved" } });
  chk(
    "指派 approved 任务被拒",
    await expectError(() => assignDesignTask(t2.id, anyUser.id), "不可指派")
  );
  chk("指派空负责人被拒", await expectError(() => assignDesignTask(t1.id, "  "), "请选择负责人"));
  chk("指派幽灵任务被拒", await expectError(() => assignDesignTask("no-such-task", anyUser.id), "不存在"));

  // ── 6) 表单选项：项目 + 用户可读，且排掉归档项目 ────────────
  const opts = await listDesignFormOptions();
  chk("选项含项目", opts.projects.length >= 1, `${opts.projects.length} 个`);
  chk("选项含用户", opts.users.length >= 1, `${opts.users.length} 个`);
  const archived = await prisma.project.findFirst({ where: { status: "archived" }, select: { id: true } });
  const archivedInOpts = archived
    ? !opts.projects.some((p) => p.id === archived.id)
    : true;
  chk("选项不含归档项目（若无归档则恒真）", archivedInOpts);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
