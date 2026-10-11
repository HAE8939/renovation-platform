/**
 * verify-finance-flow.mts —— 财务台账写入的【端到端集成门禁】（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-finance.mjs 只断言纯函数；createRecord / updateRecord / deleteRecord
 * 的事务、守卫、联动路径必须真跑生产服务层才能覆盖——承 M3-d2 教训（跨函数事务不共享
 * 连接，只有端到端集成能抓）。本脚本覆盖 M8-b 台账部分：建/改/删后
 * receivedTotal/expenseTotal/grossProfit/marginRate 在同请求内即时复算正确；
 * 非法类别拒绝 / 负数·零·NaN 金额拒绝 / 不存在项目拒绝 / 科目与类型不匹配拒绝。
 *
 * 运行配方（三步，指向一个临时库；在仓库根跑）：
 *   ① DATABASE_URL="file:../_scratch/finance-flow.db" npx prisma migrate reset --force --skip-generate
 *      （reset 自动重跑 seed；本脚本会改库不可重跑，每次跑前先 reset——承 M7 教训）
 *   ② 若不走 reset 则：DATABASE_URL="file:../_scratch/finance-flow.db" npx prisma migrate deploy
 *      + DATABASE_URL="file:../_scratch/finance-flow.db" npx prisma db seed
 *   ③ DATABASE_URL="file:../_scratch/finance-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-finance-flow.mts
 * 退出码 0=全过，1=有 FAIL。临时库在 _scratch 下，不入库。
 */
import { prisma } from "@/core/db";
import {
  FinanceRecordError,
  createRecord,
  updateRecord,
  deleteRecord,
} from "@/modules/finance/server/records";
import {
  expenseTotal,
  grossProfit,
  marginRate,
  receivedTotal,
} from "@/core/domain/ledger";
import { getFinanceUser } from "@/modules/finance/currentUser";

const results: { name: string; ok: boolean }[] = [];
const chk = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

/** 整数分（cent）预言机：避免浮点尾差，禁"抄一遍被测算法当测试"。 */
const cent = (n: number): number => Math.round(n * 100);
const centEq = (a: number, b: number): boolean => cent(a) === cent(b);

async function main() {
  // ── 库初态守卫 ──────────────────────────────────────────────
  // fresh seed = paymentNode 15 · financeRecord 11（M8-a seed 自检基线）。
  // 不符即视为上次运行残留 → 明确提示先重置，避免一串误导性级联失败。
  const [baselineNodes, baselineRecords] = await Promise.all([
    prisma.paymentNode.count(),
    prisma.financeRecord.count(),
  ]);
  if (baselineNodes !== 15 || baselineRecords !== 11) {
    console.error(
      `✗ 库非初始态（付款段 ${baselineNodes}/15 · 收支记录 ${baselineRecords}/11，疑为上次运行残留）。\n` +
        `  请先重置临时库再跑：\n` +
        `  DATABASE_URL="file:../_scratch/finance-flow.db" npx prisma migrate reset --force --skip-generate`
    );
    process.exit(1);
  }
  chk("初态守卫：付款段 15 · 收支记录 11", baselineNodes === 15 && baselineRecords === 11);

  // ── 前置：占位录入人 + 演示项目 ──────────────────────────────
  const me = await getFinanceUser();
  chk("前置：占位录入人存在（boss）", !!me, me?.name ?? "无");

  const p1 = await prisma.project.findUnique({
    where: { code: "RP-2026-001" },
    select: { id: true, contractAmount: true },
  });
  if (!p1) throw new Error("前置失败：未找到 RP-2026-001，请先跑 prisma db seed");

  /**
   * 独立预言机：直接从 DB 聚合算期望值（不调被测的 listRecords / ledger 算式），
   * 再与 ledger 纯函数 + listRecords 汇总交叉比对。cent 整数比对。
   */
  async function dbSums(projectId: string) {
    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.financeRecord.aggregate({
        where: { projectId, type: "income" },
        _sum: { amount: true },
      }),
      prisma.financeRecord.aggregate({
        where: { projectId, type: "expense" },
        _sum: { amount: true },
      }),
    ]);
    return {
      received: incomeAgg._sum.amount ?? 0,
      expense: expenseAgg._sum.amount ?? 0,
    };
  }

  // ── 1) 基线汇总（p1 = RP-2026-001）──────────────────────────
  // seed: income 18600 · expense 40300 · contract 62000
  // 期望：received 18600 · expense 40300 · grossProfit 21700 · margin 0.35
  const baseline = await dbSums(p1.id);
  const baselineContract = p1.contractAmount ?? 0;
  const baselineRecords1 = await prisma.financeRecord.findMany({
    where: { projectId: p1.id },
    select: { type: true, amount: true },
  });
  const baselineLedger = {
    received: receivedTotal(baselineRecords1),
    expense: expenseTotal(baselineRecords1),
    grossProfit: grossProfit({
      contractAmount: baselineContract,
      changeTotal: 0,
      expenseTotal: expenseTotal(baselineRecords1),
    }),
    margin: marginRate({
      contractAmount: baselineContract,
      changeTotal: 0,
      expenseTotal: expenseTotal(baselineRecords1),
    }),
  };
  chk(
    "基线：ledger.received === DB 聚合",
    centEq(baselineLedger.received, baseline.received),
    `${baselineLedger.received} vs ${baseline.received}`
  );
  chk(
    "基线：ledger.expense === DB 聚合",
    centEq(baselineLedger.expense, baseline.expense),
    `${baselineLedger.expense} vs ${baseline.expense}`
  );
  chk(
    "基线：grossProfit = 合同额 − 支出",
    centEq(baselineLedger.grossProfit, baselineContract - baseline.expense),
    `${baselineLedger.grossProfit} vs ${baselineContract - baseline.expense}`
  );
  chk(
    "基线：marginRate = 0.35（21700/62000）",
    baselineLedger.margin !== null && centEq(baselineLedger.margin!, 0.35),
    `${baselineLedger.margin}`
  );

  // ── 2) createRecord expense → 支出与毛利即时变化 ─────────────
  const expenseAdd = 1000;
  const { id: expId } = await createRecord({
    projectId: p1.id,
    type: "expense",
    category: "other",
    amount: expenseAdd,
    dateIso: "2026-06-15",
    description: "  测试支出  ",
  });
  const afterExp = await dbSums(p1.id);
  const afterExpRecords = await prisma.financeRecord.findMany({
    where: { projectId: p1.id },
    select: { type: true, amount: true },
  });
  const afterExpGross = grossProfit({
    contractAmount: baselineContract,
    changeTotal: 0,
    expenseTotal: expenseTotal(afterExpRecords),
  });
  chk(
    "createRecord expense → expenseTotal +1000",
    centEq(expenseTotal(afterExpRecords), baseline.expense + expenseAdd),
    `${expenseTotal(afterExpRecords)} vs ${baseline.expense + expenseAdd}`
  );
  chk(
    "createRecord expense → grossProfit −1000",
    centEq(afterExpGross, baselineLedger.grossProfit - expenseAdd),
    `${afterExpGross} vs ${baselineLedger.grossProfit - expenseAdd}`
  );
  // recordedBy = 占位用户 id
  const expRow = await prisma.financeRecord.findUnique({
    where: { id: expId },
    select: { recordedBy: true, description: true },
  });
  chk(
    "createRecord → recordedBy = 占位用户 id",
    expRow?.recordedBy === me?.id,
    `${expRow?.recordedBy} vs ${me?.id}`
  );
  chk(
    "createRecord → description 去空白",
    expRow?.description === "测试支出",
    expRow?.description ?? "空"
  );

  // ── 3) createRecord income → 已收增加 / 待收减少 ─────────────
  const incomeAdd = 5000;
  const { id: incId } = await createRecord({
    projectId: p1.id,
    type: "income",
    category: "contract",
    amount: incomeAdd,
    dateIso: "2026-06-20",
    description: "",
  });
  const afterIncRecords = await prisma.financeRecord.findMany({
    where: { projectId: p1.id },
    select: { type: true, amount: true },
  });
  const afterIncReceived = receivedTotal(afterIncRecords);
  chk(
    "createRecord income → receivedTotal +5000",
    centEq(afterIncReceived, baseline.received + incomeAdd),
    `${afterIncReceived}`
  );
  // 待收 = max(0, 合同额 − 已收)
  const afterIncPending = Math.max(0, baselineContract - afterIncReceived);
  const expectedPending = Math.max(
    0,
    baselineContract - (baseline.received + incomeAdd)
  );
  chk(
    "createRecord income → 待收款减少 5000",
    centEq(afterIncPending, expectedPending),
    `${afterIncPending}`
  );
  // description 空时存 ""
  const incRow = await prisma.financeRecord.findUnique({
    where: { id: incId },
    select: { description: true },
  });
  chk(
    "createRecord → description 空时存空串",
    incRow?.description === "",
    incRow?.description ?? "非空"
  );

  // ── 4) updateRecord 改金额 → 汇总按新值复算 ─────────────────
  const newAmount = 2000;
  await updateRecord(expId, {
    projectId: p1.id,
    type: "expense",
    category: "other",
    amount: newAmount,
    dateIso: "2026-06-15",
    description: "测试支出改后",
  });
  const afterUpdRecords = await prisma.financeRecord.findMany({
    where: { projectId: p1.id },
    select: { type: true, amount: true },
  });
  const afterUpdExpense = expenseTotal(afterUpdRecords);
  chk(
    "updateRecord → 支出按新值复算（基线 + 2000，原 1000 改成 2000）",
    centEq(afterUpdExpense, baseline.expense + newAmount),
    `${afterUpdExpense} vs ${baseline.expense + newAmount}`
  );
  // recordedBy 不改（保留原录入人）
  const updRow = await prisma.financeRecord.findUnique({
    where: { id: expId },
    select: { recordedBy: true },
  });
  chk(
    "updateRecord → recordedBy 不改（保留创建者）",
    updRow?.recordedBy === me?.id,
    updRow?.recordedBy ?? "空"
  );

  // ── 5) deleteRecord → 汇总回到增该笔前 ──────────────────────
  // 删掉 income 那笔 → 已收回到 baseline.received（支出不影响 received）
  await deleteRecord(incId);
  const afterDelRecords = await prisma.financeRecord.findMany({
    where: { projectId: p1.id },
    select: { type: true, amount: true },
  });
  const afterDelReceived = receivedTotal(afterDelRecords);
  chk(
    "deleteRecord income → receivedTotal 回到删前",
    centEq(afterDelReceived, baseline.received + 0), // income 那笔删了，只剩 baseline
    `${afterDelReceived}`
  );

  // ── 6) 拒绝用例逐一断言抛 FinanceRecordError 且中文文案 ────────
  // 不存在项目
  try {
    await createRecord({
      projectId: "nonexistent-id",
      type: "expense",
      category: "other",
      amount: 100,
      dateIso: "2026-06-15",
    });
    chk("拒绝：不存在项目 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：不存在项目 → FinanceRecordError「项目不存在」",
      e instanceof FinanceRecordError && e.message === "项目不存在",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 负数金额
  try {
    await createRecord({
      projectId: p1.id,
      type: "expense",
      category: "other",
      amount: -100,
      dateIso: "2026-06-15",
    });
    chk("拒绝：负数金额 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：负数金额 → 「金额需为大于 0 的数字」",
      e instanceof FinanceRecordError && e.message === "金额需为大于 0 的数字",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 零金额
  try {
    await createRecord({
      projectId: p1.id,
      type: "expense",
      category: "other",
      amount: 0,
      dateIso: "2026-06-15",
    });
    chk("拒绝：零金额 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：零金额 → 「金额需为大于 0 的数字」",
      e instanceof FinanceRecordError && e.message === "金额需为大于 0 的数字",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // NaN（非数字）
  try {
    await createRecord({
      projectId: p1.id,
      type: "expense",
      category: "other",
      amount: Number("abc"),
      dateIso: "2026-06-15",
    });
    chk("拒绝：NaN 金额 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：NaN 金额 → 「金额需为大于 0 的数字」",
      e instanceof FinanceRecordError && e.message === "金额需为大于 0 的数字",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 非法 type
  try {
    await createRecord({
      projectId: p1.id,
      type: "cost",
      category: "other",
      amount: 100,
      dateIso: "2026-06-15",
    });
    chk("拒绝：非法 type → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：非法 type → 「收支类型非法」",
      e instanceof FinanceRecordError && e.message === "收支类型非法",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 科目与类型不匹配：income + material
  try {
    await createRecord({
      projectId: p1.id,
      type: "income",
      category: "material",
      amount: 100,
      dateIso: "2026-06-15",
    });
    chk("拒绝：income+material → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：income+material → 「科目与收支类型不匹配」",
      e instanceof FinanceRecordError && e.message === "科目与收支类型不匹配",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 科目与类型不匹配：expense + contract
  try {
    await createRecord({
      projectId: p1.id,
      type: "expense",
      category: "contract",
      amount: 100,
      dateIso: "2026-06-15",
    });
    chk("拒绝：expense+contract → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：expense+contract → 「科目与收支类型不匹配」",
      e instanceof FinanceRecordError && e.message === "科目与收支类型不匹配",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 非法日期
  try {
    await createRecord({
      projectId: p1.id,
      type: "expense",
      category: "other",
      amount: 100,
      dateIso: "不是日期",
    });
    chk("拒绝：非法日期 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：非法日期 → 「日期格式非法」",
      e instanceof FinanceRecordError && e.message === "日期格式非法",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // updateRecord 不存在记录
  try {
    await updateRecord("nonexistent-id", {
      projectId: p1.id,
      type: "expense",
      category: "other",
      amount: 100,
      dateIso: "2026-06-15",
    });
    chk("拒绝：updateRecord 不存在 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：updateRecord 不存在 → 「记录不存在」",
      e instanceof FinanceRecordError && e.message === "记录不存在",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // deleteRecord 不存在记录
  try {
    await deleteRecord("nonexistent-id");
    chk("拒绝：deleteRecord 不存在 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：deleteRecord 不存在 → 「记录不存在」",
      e instanceof FinanceRecordError && e.message === "记录不存在",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${failed === 0 ? "全部通过" : `失败 ${failed} 项`} · 共 ${results.length} 项检查\n`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
