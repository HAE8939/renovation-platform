/**
 * verify-finance-flow.mts —— 财务台账写入的【端到端集成门禁】（隔离库，不碰 dev.db）。
 *
 * 为什么存在：verify-finance.mjs 只断言纯函数；createRecord / updateRecord / deleteRecord
 * 的事务、守卫、联动路径必须真跑生产服务层才能覆盖——承 M3-d2 教训（跨函数事务不共享
 * 连接，只有端到端集成能抓）。本脚本覆盖：
 * - M8-b 台账部分：建/改/删后 receivedTotal/expenseTotal/grossProfit/marginRate 在同请求内
 *   即时复算正确；非法类别拒绝 / 负数·零·NaN 金额拒绝 / 不存在项目拒绝 / 科目与类型不匹配拒绝。
 * - M8-c 付款部分：生成逐段一致 / 重复生成拒 / 清空守卫 / 标记已付+撤销（不建 FinanceRecord）/
 *   未解锁拒标记 / M7 验收 passed → 付款段派生解锁回环 / 改合同额不回溯快照。
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
  PaymentPlanError,
  generatePlan,
  clearPlan,
  markPaid,
  unmarkPaid,
  getPlanView,
} from "@/modules/finance/server/payments";
import {
  ChangeOrderError,
  createChange,
  updateChange,
  deleteChange,
  setChangeStatus,
  revokeChangeConfirm,
} from "@/modules/budget/server/changes";
import { getProjectHub } from "@/modules/projects/server/projectDetail";
import { buildPaymentPlan, PAYMENT_STAGE_DEFS } from "@/modules/finance/payment";
import {
  changeTotal,
  expenseTotal,
  grossProfit,
  marginRate,
  receivedTotal,
  type ChangeRow,
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
  // fresh seed = paymentNode 15 · financeRecord 13（11 笔 M8-a + 2 笔 M9-b-2b 变更款）
  //   · changeOrder 2（M9-a seed：001 +3200 / 002 +2800）。
  // 不符即视为上次运行残留 → 明确提示先重置，避免一串误导性级联失败。
  const [baselineNodes, baselineRecords, baselineChanges] = await Promise.all([
    prisma.paymentNode.count(),
    prisma.financeRecord.count(),
    prisma.changeOrder.count(),
  ]);
  if (baselineNodes !== 15 || baselineRecords !== 13 || baselineChanges !== 2) {
    console.error(
      `✗ 库非初始态（付款段 ${baselineNodes}/15 · 收支记录 ${baselineRecords}/13 · 变更单 ${baselineChanges}/2，疑为上次运行残留）。\n` +
        `  请先重置临时库再跑：\n` +
        `  DATABASE_URL="file:../_scratch/finance-flow.db" npx prisma migrate reset --force --skip-generate`
    );
    process.exit(1);
  }
  chk(
    "初态守卫：付款段 15 · 收支记录 13 · 变更单 2",
    baselineNodes === 15 && baselineRecords === 13 && baselineChanges === 2
  );

  // 护栏（M8.5）：付款模板 triggerStages 必须都能在工序模板库找到对应工序——
  // 防「按名字匹配」链路在改名后静默失配。工序名是三处同字面契约：
  // ProcessTemplate.name → ScheduleTask.name → AcceptanceNode.name。
  const tplNames = new Set(
    (await prisma.processTemplate.findMany({ select: { name: true } })).map((t) => t.name)
  );
  const stageNames = PAYMENT_STAGE_DEFS.flatMap((d) => d.triggerStages);
  const unmatched = stageNames.filter((n) => !tplNames.has(n));
  chk(
    `付款模板 triggerStages 全部命中工序模板（${stageNames.length} 项）`,
    unmatched.length === 0,
    unmatched.length > 0 ? `未命中：${unmatched.join("、")}` : ""
  );

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

  /**
   * 变更额独立预言机：直接从 DB 读 change_orders（按 quote→project 聚合），
   * 再经 ledger.changeTotal 复算。供 baseline 与联动断言交叉比对（不抄被测算式）。
   */
  async function dbChangeTotal(projectId: string): Promise<number> {
    // 与读侧同源口径：只有客户已确认的变更进金额（M13 四段确认流 / AGENTS §5）。
    const rows = await prisma.changeOrder.findMany({
      where: { quote: { projectId }, status: "client_confirmed" },
      select: { amount: true },
    });
    const changeRows: ChangeRow[] = rows.map((r) => ({ amount: r.amount }));
    return changeTotal(changeRows);
  }

  /** 全量口径（含草稿/待确认/已驳回）——只用于证明"草稿确实写进库了、只是不进金额"。 */
  async function dbChangeTotalAll(projectId: string): Promise<number> {
    const rows = await prisma.changeOrder.findMany({
      where: { quote: { projectId } },
      select: { amount: true },
    });
    const changeRows: ChangeRow[] = rows.map((r) => ({ amount: r.amount }));
    return changeTotal(changeRows);
  }

  // ── 1) 基线汇总（p1 = RP-2026-001）──────────────────────────
  // seed: income 18600 · expense 40300 · contract 62000 · change +3200（M9-a）
  // 期望：received 18600 · expense 40300 · change 3200
  //       · grossProfit 24900 · margin 0.3819（24900/65200）
  const baseline = await dbSums(p1.id);
  const baselineContract = p1.contractAmount ?? 0;
  const baselineChange = await dbChangeTotal(p1.id);
  const baselineRecords1 = await prisma.financeRecord.findMany({
    where: { projectId: p1.id },
    select: { type: true, amount: true },
  });
  const baselineLedger = {
    received: receivedTotal(baselineRecords1),
    expense: expenseTotal(baselineRecords1),
    change: baselineChange,
    grossProfit: grossProfit({
      contractAmount: baselineContract,
      changeTotal: baselineChange,
      expenseTotal: expenseTotal(baselineRecords1),
    }),
    margin: marginRate({
      contractAmount: baselineContract,
      changeTotal: baselineChange,
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
    "基线：changeTotal === DB 聚合（+3200）",
    centEq(baselineLedger.change, 3200),
    `${baselineLedger.change}`
  );
  chk(
    "基线：grossProfit = 合同额 + 变更 − 支出",
    centEq(baselineLedger.grossProfit, baselineContract + baselineChange - baseline.expense),
    `${baselineLedger.grossProfit} vs ${baselineContract + baselineChange - baseline.expense}`
  );
  chk(
    "基线：grossProfit = 24900（62000+3200−40300）",
    centEq(baselineLedger.grossProfit, 24900),
    `${baselineLedger.grossProfit}`
  );
  chk(
    "基线：marginRate = 0.3819（24900/65200）",
    baselineLedger.margin !== null && centEq(baselineLedger.margin!, 0.3819),
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
    changeTotal: baselineChange,
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

  // ── 变更单部分（M9-a）──────────────────────────────────────────
  // 覆盖：create/update/delete 真跑 + 六类拒绝 + getProjectHub 联动
  //   （changeTotal/changeWarn 在增删后即时重算）。
  // 001 seed 基线：合同额 62000 · 变更 +3200（warn=true，3200>3100）。

  // 基线：getProjectHub(p1).finance.changeTotal/changeWarn === seed 值
  const hubBaseline = await getProjectHub(p1.id);
  chk(
    "变更基线：getProjectHub(p1).finance.changeTotal === 3200",
    hubBaseline !== null && centEq(hubBaseline.finance.changeTotal, 3200),
    `${hubBaseline?.finance.changeTotal}`
  );
  chk(
    "变更基线：getProjectHub(p1).finance.changeWarn === true（3200>3100）",
    hubBaseline !== null && hubBaseline.finance.changeWarn === true,
    `${hubBaseline?.finance.changeWarn}`
  );

  // ── 7) createChange → 落 draft，草稿不进金额口径（M13 四段确认流）──
  // 口径：变更单须【客户已确认】才计入累计变更/毛利/应收分母（AGENTS §5）。
  // 两头都得钉住——既锁"草稿不算钱"，也锁"确认后即刻算钱"。
  // 001 seed 基线：合同额 62000 · 已确认变更 +3200（warn=true，3200>3100）。
  const changeAdd = 1000;
  const { id: changeId } = await createChange(p1.id, {
    kind: "add",
    title: "测试增项",
    amount: changeAdd,
    dateIso: "2026-10-15",
    note: "  flow 测试增项  ",
  });
  const rowAfterCreate = await prisma.changeOrder.findUnique({
    where: { id: changeId },
    select: { note: true, status: true },
  });
  chk(
    "createChange → 新单落 draft（未确认）",
    rowAfterCreate?.status === "draft",
    rowAfterCreate?.status ?? "空"
  );
  const allAfterCreate = await dbChangeTotalAll(p1.id);
  const okAfterCreate = await dbChangeTotal(p1.id);
  chk(
    "createChange → 全量口径 +1000（3200→4200，证明行确实写进库了）",
    centEq(allAfterCreate, 4200),
    `${allAfterCreate}`
  );
  chk(
    "createChange → 已确认口径不变（仍 3200）",
    centEq(okAfterCreate, 3200),
    `${okAfterCreate}`
  );
  const hubDraft = await getProjectHub(p1.id);
  chk(
    "联动：draft 不进 getProjectHub.finance.changeTotal（仍 3200）",
    hubDraft !== null && centEq(hubDraft.finance.changeTotal, 3200),
    `${hubDraft?.finance.changeTotal}`
  );
  chk(
    "联动：draft 期 changeWarn 按 3200>3100 仍 true",
    hubDraft !== null && hubDraft.finance.changeWarn === true,
    `${hubDraft?.finance.changeWarn}`
  );
  chk(
    "createChange → note 去空白",
    rowAfterCreate?.note === "flow 测试增项",
    rowAfterCreate?.note ?? "空"
  );

  // ── 8) draft 下 updateChange 可改金额，但仍不进口径 ─────────────
  await updateChange(changeId, p1.id, {
    kind: "add",
    title: "测试增项改后",
    amount: 2000,
    dateIso: "2026-10-15",
    note: "改后",
  });
  const allAfterUpdate = await dbChangeTotalAll(p1.id);
  const okAfterUpdateDraft = await dbChangeTotal(p1.id);
  chk(
    "updateChange（draft）1000→2000 → 全量口径 5200",
    centEq(allAfterUpdate, 5200),
    `${allAfterUpdate}`
  );
  chk(
    "updateChange（draft）→ 已确认口径仍 3200（改草稿不动钱）",
    centEq(okAfterUpdateDraft, 3200),
    `${okAfterUpdateDraft}`
  );

  // ── 9) 状态守卫：不可跳级确认，必须先提交 ──────────────────────
  try {
    await setChangeStatus(changeId, "client_confirmed");
    chk("守卫：draft 直接确认 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "守卫：draft 直接确认 → 「只有待确认的变更才能确认」",
      e instanceof ChangeOrderError &&
        e.message === "只有待确认的变更才能确认",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // ── 10) draft → pending → client_confirmed：确认瞬间金额进口径 ───
  await setChangeStatus(changeId, "pending");
  const okAfterPending = await dbChangeTotal(p1.id);
  chk(
    "提交 pending → 已确认口径仍 3200（待确认不算钱）",
    centEq(okAfterPending, 3200),
    `${okAfterPending}`
  );
  await setChangeStatus(changeId, "client_confirmed", "  客户口头确认  ");
  const okAfterConfirm = await dbChangeTotal(p1.id);
  chk(
    "客户确认 → 已确认口径 3200→5200",
    centEq(okAfterConfirm, 5200),
    `${okAfterConfirm}`
  );
  const hubConfirmed = await getProjectHub(p1.id);
  chk(
    "联动：确认后 getProjectHub.finance.changeTotal === 5200",
    hubConfirmed !== null && centEq(hubConfirmed.finance.changeTotal, 5200),
    `${hubConfirmed?.finance.changeTotal}`
  );
  chk(
    "联动：确认后 changeWarn 仍 true（5200>3100）",
    hubConfirmed !== null && hubConfirmed.finance.changeWarn === true,
    `${hubConfirmed?.finance.changeWarn}`
  );
  const confirmedRow = await prisma.changeOrder.findUnique({
    where: { id: changeId },
    select: { confirmedAt: true, confirmNote: true },
  });
  chk(
    "客户确认 → confirmedAt 落时间戳",
    confirmedRow?.confirmedAt instanceof Date,
    String(confirmedRow?.confirmedAt)
  );
  chk(
    "客户确认 → confirmNote 去空白",
    confirmedRow?.confirmNote === "客户口头确认",
    confirmedRow?.confirmNote ?? "空"
  );

  // ── 11) 已确认后禁止直接编辑（金额不得绕过确认流被改）───────────
  try {
    await updateChange(changeId, p1.id, {
      kind: "add",
      title: "偷改",
      amount: 9999,
      dateIso: "2026-10-15",
      note: "",
    });
    chk("守卫：已确认后编辑 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "守卫：已确认后编辑 → 「客户已确认的变更不能直接编辑」",
      e instanceof ChangeOrderError &&
        e.message === "客户已确认的变更不能直接编辑",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // ── 12) 驳回路径：rejected 不进口径，但行保留可追溯 ─────────────
  const { id: rejectedId } = await createChange(p1.id, {
    kind: "add",
    title: "测试驳回",
    amount: 1500,
    dateIso: "2026-10-15",
    note: "",
  });
  await setChangeStatus(rejectedId, "pending");
  await setChangeStatus(rejectedId, "rejected", "客户未认可该增项");
  const okAfterReject = await dbChangeTotal(p1.id);
  const allAfterReject = await dbChangeTotalAll(p1.id);
  chk(
    "驳回 → 已确认口径仍 5200（rejected 不算钱）",
    centEq(okAfterReject, 5200),
    `${okAfterReject}`
  );
  chk(
    "驳回 → 全量口径 6700（行仍在、可追溯）",
    centEq(allAfterReject, 6700),
    `${allAfterReject}`
  );

  // ── 13) 删除守卫：已确认的变更不能删（钱按事实，金额不得被无痕抹掉）──
  try {
    await deleteChange(changeId);
    chk("守卫：已确认后删除 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "守卫：已确认后删除 → 「客户已确认的变更不能删除」",
      e instanceof ChangeOrderError &&
        e.message === "客户已确认的变更不能删除",
      e instanceof Error ? e.message : "非 Error"
    );
  }
  // 驳回行从未进过口径，删掉不留痕——与上面构成有意的不对称
  await deleteChange(rejectedId);
  const allAfterRejectDelete = await dbChangeTotalAll(p1.id);
  chk(
    "deleteChange（rejected）→ 全量口径回到 5200",
    centEq(allAfterRejectDelete, 5200),
    `${allAfterRejectDelete}`
  );

  // 测试收尾：已确认行经服务层不可删（正是上面那条守卫），故直接清库回到 seed 基线，
  // 让"金额口径能回落"这一联动断言仍然测得到。
  await prisma.changeOrder.delete({ where: { id: changeId } });
  const afterDeleteChange = await dbChangeTotal(p1.id);
  const allAfterDelete = await dbChangeTotalAll(p1.id);
  chk(
    "收尾清库 → 已确认口径回到 3200（基线）",
    centEq(afterDeleteChange, 3200),
    `${afterDeleteChange}`
  );
  chk(
    "收尾清库 → 全量口径同回到 3200（测试数据不留残）",
    centEq(allAfterDelete, 3200),
    `${allAfterDelete}`
  );
  const hubAfterDelete = await getProjectHub(p1.id);
  chk(
    "联动：回到基线后 getProjectHub.finance.changeTotal === 3200",
    hubAfterDelete !== null && centEq(hubAfterDelete.finance.changeTotal, 3200),
    `${hubAfterDelete?.finance.changeTotal}`
  );
  chk(
    "联动：回到基线后 changeWarn 为 true（3200>3100）",
    hubAfterDelete !== null && hubAfterDelete.finance.changeWarn === true,
    `${hubAfterDelete?.finance.changeWarn}`
  );

  // ── 13b) 撤销确认闭环：退回 pending → 即时从口径摘出 → 改 → 再确认（§4.6 补口）──
  const { id: revId } = await createChange(p1.id, {
    kind: "add",
    title: "撤销闭环",
    amount: 2000,
    dateIso: "2026-10-15",
  });
  await setChangeStatus(revId, "pending");
  // 守卫：未确认（pending）的行不能撤销——避免把「提交前」的行撤销成 pending 的无意义写入
  try {
    await revokeChangeConfirm(revId);
    chk("守卫：pending 撤销 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "守卫：pending 撤销 → 「只有客户已确认的变更才能撤销确认」",
      e instanceof ChangeOrderError &&
        e.message === "只有客户已确认的变更才能撤销确认",
      e instanceof Error ? e.message : "非 Error"
    );
  }
  await setChangeStatus(revId, "client_confirmed", "先确认");
  const okPreRevoke = await dbChangeTotal(p1.id);
  chk(
    "撤销前：已确认口径 3200→5200（确认瞬间进账）",
    centEq(okPreRevoke, 5200),
    `${okPreRevoke}`
  );
  await revokeChangeConfirm(revId);
  const okPostRevoke = await dbChangeTotal(p1.id);
  chk(
    "撤销确认 → 已确认口径即时回到 3200（退回 pending 不算钱）",
    centEq(okPostRevoke, 3200),
    `${okPostRevoke}`
  );
  const allPostRevoke = await dbChangeTotalAll(p1.id);
  chk(
    "撤销确认 → 全量口径仍 5200（行保留可追溯，撤销≠删除）",
    centEq(allPostRevoke, 5200),
    `${allPostRevoke}`
  );
  const revRow = await prisma.changeOrder.findUnique({
    where: { id: revId },
    select: { status: true, confirmedAt: true, confirmNote: true },
  });
  chk(
    "撤销确认 → status 回 pending",
    revRow?.status === "pending",
    `${revRow?.status}`
  );
  chk(
    "撤销确认 → confirmedAt 清空（不留已确认时间戳于待确认行）",
    revRow?.confirmedAt === null,
    String(revRow?.confirmedAt)
  );
  chk(
    "撤销确认 → confirmNote 清空",
    revRow?.confirmNote === "",
    revRow?.confirmNote ?? "空"
  );
  // 纠错闭环：撤销 → 改金额 → 再确认（已确认行不能改，退回 pending 后改得动）
  await updateChange(revId, p1.id, {
    kind: "add",
    title: "撤销后纠错",
    amount: 1500,
    dateIso: "2026-10-15",
    note: "纠正金额",
  });
  await setChangeStatus(revId, "client_confirmed", "纠错后再确认");
  const okReconfirm = await dbChangeTotal(p1.id);
  chk(
    "纠错闭环：撤销→改→再确认 → 已确认口径 3200+1500=4700",
    centEq(okReconfirm, 4700),
    `${okReconfirm}`
  );
  // 收尾：已确认行经服务层不可删（正是 §4.6 守卫），直连清库回 3200 基线，不污染后续 section 14
  await prisma.changeOrder.delete({ where: { id: revId } });
  const okRevokeCleanup = await dbChangeTotal(p1.id);
  chk(
    "收尾：撤销测试行清库 → 已确认口径回 3200（基线）",
    centEq(okRevokeCleanup, 3200),
    `${okRevokeCleanup}`
  );

  // ── 14) 六类拒绝（title 空 / kind 未知 / amount 0 /
  //            deduct 正数 / add 负数 / 日期非法）──────────────
  // title 空
  try {
    await createChange(p1.id, {
      kind: "add",
      title: "   ",
      amount: 100,
      dateIso: "2026-10-15",
    });
    chk("拒绝：变更 title 空 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：变更 title 空 → 「变更描述不能为空」",
      e instanceof ChangeOrderError && e.message === "变更描述不能为空",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // kind 未知
  try {
    await createChange(p1.id, {
      kind: "refund",
      title: "测试",
      amount: 100,
      dateIso: "2026-10-15",
    });
    chk("拒绝：变更 kind 未知 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：变更 kind 未知 → 「未知变更类型：refund」",
      e instanceof ChangeOrderError && e.message === "未知变更类型：refund",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // amount 0
  try {
    await createChange(p1.id, {
      kind: "add",
      title: "测试零金额",
      amount: 0,
      dateIso: "2026-10-15",
    });
    chk("拒绝：变更 amount 0 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：变更 amount 0 → 「变更金额不能为 0」",
      e instanceof ChangeOrderError && e.message === "变更金额不能为 0",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // deduct 正数（方向错误）
  try {
    await createChange(p1.id, {
      kind: "deduct",
      title: "测试减项方向",
      amount: 500,
      dateIso: "2026-10-15",
    });
    chk("拒绝：deduct 正数 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：deduct 正数 → 「减项金额应为负数」",
      e instanceof ChangeOrderError && e.message === "减项金额应为负数",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // add 负数（方向错误）
  try {
    await createChange(p1.id, {
      kind: "add",
      title: "测试增项方向",
      amount: -500,
      dateIso: "2026-10-15",
    });
    chk("拒绝：add 负数 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：add 负数 → 「增项金额应为正数」",
      e instanceof ChangeOrderError && e.message === "增项金额应为正数",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 日期非法
  try {
    await createChange(p1.id, {
      kind: "add",
      title: "测试日期",
      amount: 100,
      dateIso: "不是日期",
    });
    chk("拒绝：变更日期非法 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：变更日期非法 → 「日期格式非法」",
      e instanceof ChangeOrderError && e.message === "日期格式非法",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // updateChange 不存在
  try {
    await updateChange("nonexistent-id", p1.id, {
      kind: "add",
      title: "测试",
      amount: 100,
      dateIso: "2026-10-15",
    });
    chk("拒绝：updateChange 不存在 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：updateChange 不存在 → 「变更单不存在」",
      e instanceof ChangeOrderError && e.message === "变更单不存在",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // deleteChange 不存在
  try {
    await deleteChange("nonexistent-id");
    chk("拒绝：deleteChange 不存在 → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "拒绝：deleteChange 不存在 → 「变更单不存在」",
      e instanceof ChangeOrderError && e.message === "变更单不存在",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // ── 付款部分（M8-c）──────────────────────────────────────────
  // 覆盖：生成逐段一致 / 重复生成拒 / 清空守卫 / 标记已付+撤销 /
  //       未解锁拒标记 / M7→段解锁派生回环 / 改合同额不回溯快照。

  /** UTC 月算术（照 seed / payments.ts 写法，别引 dayjs）。 */
  const addMonthsUTC = (base: Date, months: number) =>
    new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, base.getUTCDate())
    );

  // 前置：取演示项目 002/003/004
  const [p2, p3, p4] = await Promise.all([
    prisma.project.findUnique({
      where: { code: "RP-2026-002" },
      select: { id: true, contractAmount: true, endDate: true, actualEndDate: true },
    }),
    prisma.project.findUnique({
      where: { code: "RP-2026-003" },
      select: { id: true },
    }),
    prisma.project.findUnique({
      where: { code: "RP-2026-004" },
      select: { id: true, contractAmount: true, endDate: true, actualEndDate: true },
    }),
  ]);
  if (!p2 || !p3 || !p4)
    throw new Error("前置失败：未找到演示项目 002/003/004，请先跑 prisma db seed");

  // ── 7) 生成逐段一致 ──────────────────────────────────────────
  // 004 contractAmount=0 → generatePlan 拒绝
  try {
    await generatePlan(p4.id);
    chk("付款：004 contractAmount=0 generatePlan → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "付款：004 contractAmount=0 → 「先在项目设置录入合同额」",
      e instanceof PaymentPlanError && e.message === "先在项目设置录入合同额",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 给 004 设 contractAmount=100000 后 generatePlan
  await prisma.project.update({
    where: { id: p4.id },
    data: { contractAmount: 100000 },
  });
  await generatePlan(p4.id);
  const p4Nodes = await prisma.paymentNode.findMany({
    where: { projectId: p4.id },
    orderBy: { order: "asc" },
  });
  chk("付款：004 generatePlan → 5 段", p4Nodes.length === 5, `${p4Nodes.length}`);

  // 逐段 amountDue/percent/trigger 与 buildPaymentPlan(100000) 一致
  const expectedPlan = buildPaymentPlan(100000);
  for (let i = 0; i < 5; i++) {
    const exp = expectedPlan[i];
    const act = p4Nodes[i];
    chk(
      `付款：004 段${i + 1}（${exp.name}）amountDue/percent/trigger 一致`,
      centEq(act.amountDue, exp.amountDue) &&
        act.percent === exp.percent &&
        act.trigger === exp.trigger,
      `amountDue ${act.amountDue} vs ${exp.amountDue}, percent ${act.percent} vs ${exp.percent}, trigger ${act.trigger} vs ${exp.trigger}`
    );
  }

  // Σ 恰等 100000（cent 硬精确）
  const p4Sum = p4Nodes.reduce((s, n) => s + n.amountDue, 0);
  chk("付款：004 五段之和 = 100000", centEq(p4Sum, 100000), `${p4Sum}`);

  // 保修金段 unlocksAt 非空且 = 竣工+12月
  const warrantyNode = p4Nodes.find((n) => n.order === 5);
  const p4WarrantyBase = p4.actualEndDate ?? p4.endDate ?? new Date();
  const p4ExpectedUnlock = addMonthsUTC(p4WarrantyBase, 12);
  chk(
    "付款：004 保修金段 unlocksAt 非空",
    !!warrantyNode?.unlocksAt,
    warrantyNode?.unlocksAt?.toISOString() ?? "null"
  );
  chk(
    "付款：004 保修金段 unlocksAt = 竣工+12月",
    warrantyNode?.unlocksAt?.getTime() === p4ExpectedUnlock.getTime(),
    `${warrantyNode?.unlocksAt?.toISOString()} vs ${p4ExpectedUnlock.toISOString()}`
  );

  // ── 8) 重复生成拒 ────────────────────────────────────────────
  try {
    await generatePlan(p4.id);
    chk("付款：004 重复 generatePlan → 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "付款：004 重复 generatePlan → 「已存在付款计划，请先清空再生成」",
      e instanceof PaymentPlanError &&
        e.message === "已存在付款计划，请先清空再生成",
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // ── 9) 清空守卫 ──────────────────────────────────────────────
  // 003 有 paid 段 → clearPlan 拒绝
  try {
    await clearPlan(p3.id);
    chk("付款：003 clearPlan（有 paid 段）→ 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "付款：003 clearPlan → 「已标记已付的段不可清空…」",
      e instanceof PaymentPlanError &&
        e.message.includes("已标记已付的段不可清空"),
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // 004 无 paid 段 → clearPlan 成功、段数归 0
  await clearPlan(p4.id);
  const p4CountAfterClear = await prisma.paymentNode.count({
    where: { projectId: p4.id },
  });
  chk("付款：004 clearPlan → 段数归 0", p4CountAfterClear === 0, `${p4CountAfterClear}`);

  // ── 10) 标记已付 + 撤销 ───────────────────────────────────────
  // 重新生成 004 计划
  await generatePlan(p4.id);
  const p4o1 = await prisma.paymentNode.findFirst({
    where: { projectId: p4.id, order: 1 },
    select: { id: true },
  });
  if (!p4o1) throw new Error("前置失败：004 重新生成后未找到 order1");

  // markPaid → paid=true 且 paidBy=占位用户
  const frCountBeforeMark = await prisma.financeRecord.count();
  await markPaid(p4o1.id);
  const p4o1AfterMark = await prisma.paymentNode.findUnique({
    where: { id: p4o1.id },
    select: { paid: true, paidBy: true },
  });
  chk("付款：004 order1 markPaid → paid=true", p4o1AfterMark?.paid === true);
  chk(
    "付款：004 order1 markPaid → paidBy=占位用户",
    p4o1AfterMark?.paidBy === me?.id,
    `${p4o1AfterMark?.paidBy} vs ${me?.id}`
  );

  // 断言未新增任何 FinanceRecord（决策②：markPaid 不建台账记录）
  const frCountAfterMark = await prisma.financeRecord.count();
  chk(
    "付款：markPaid 不建 FinanceRecord（决策②）",
    frCountAfterMark === frCountBeforeMark,
    `${frCountBeforeMark} → ${frCountAfterMark}`
  );

  // unmarkPaid → paid=false / paidAt=null / paidBy=null
  await unmarkPaid(p4o1.id);
  const p4o1AfterUnmark = await prisma.paymentNode.findUnique({
    where: { id: p4o1.id },
    select: { paid: true, paidAt: true, paidBy: true },
  });
  chk("付款：004 order1 unmarkPaid → paid=false", p4o1AfterUnmark?.paid === false);
  chk("付款：004 order1 unmarkPaid → paidAt=null", p4o1AfterUnmark?.paidAt === null);
  chk("付款：004 order1 unmarkPaid → paidBy=null", p4o1AfterUnmark?.paidBy === null);

  // ── 11) 未解锁拒标记 ─────────────────────────────────────────
  // 002 order3（主体完工款，trigger stages 泥工/防水/地面/天花，seed 未全 passed）
  const p2o3 = await prisma.paymentNode.findFirst({
    where: { projectId: p2.id, order: 3 },
    select: { id: true },
  });
  if (!p2o3) throw new Error("前置失败：002 未找到 order3");
  try {
    await markPaid(p2o3.id);
    chk("付款：002 order3 markPaid（未解锁）→ 抛错", false, "未抛错");
  } catch (e) {
    chk(
      "付款：002 order3 markPaid → 「未解锁不可标记已付：…」",
      e instanceof PaymentPlanError &&
        e.message.startsWith("未解锁不可标记已付："),
      e instanceof Error ? e.message : "非 Error"
    );
  }

  // ── 12) ★ M7→段解锁派生回环 ──────────────────────────────────
  // 002 order2（水电完成款，triggerStages="水电工程"）
  const p2o2 = await prisma.paymentNode.findFirst({
    where: { projectId: p2.id, order: 2 },
    select: { id: true, paid: true, amountDue: true },
  });
  if (!p2o2) throw new Error("前置失败：002 未找到 order2");

  // 确保 002「水电工程」AcceptanceNode.status 非 passed（若 seed 已 passed 则先置 submitted）
  const sdNode = await prisma.acceptanceNode.findFirst({
    where: { projectId: p2.id, name: "水电工程" },
    select: { id: true, status: true },
  });
  if (!sdNode)
    throw new Error("前置失败：002 未找到「水电工程」验收节点，请先跑 M7 seed");
  if (sdNode.status === "passed") {
    await prisma.acceptanceNode.update({
      where: { id: sdNode.id },
      data: { status: "submitted" },
    });
  }

  // getPlanView → order2 state.unlocked=false, missing 含「水电工程」
  const viewBefore = await getPlanView(p2.id);
  const segBefore = viewBefore.segments.find((s) => s.order === 2);
  chk(
    "付款：002 order2 解锁前 → 未解锁",
    segBefore?.state.unlocked === false
  );
  chk(
    "付款：002 order2 解锁前 → missing 含「水电工程」",
    segBefore?.state.missing.includes("水电工程") === true,
    segBefore?.state.missing.join(",") ?? ""
  );

  // 记录 paid/amountDue 快照（证明解锁是派生非落库）
  const paidBefore = p2o2.paid;
  const amountDueBefore = p2o2.amountDue;

  // 仅用 prisma 把该 AcceptanceNode.status 改成 "passed"（不写任何 finance 表）
  const frCountBeforeUnlock = await prisma.financeRecord.count();
  const pnCountBeforeUnlock = await prisma.paymentNode.count();
  await prisma.acceptanceNode.update({
    where: { id: sdNode.id },
    data: { status: "passed" },
  });

  // 断言 finance 表行数未变（解锁是派生，不落库）
  const frCountAfterUnlock = await prisma.financeRecord.count();
  const pnCountAfterUnlock = await prisma.paymentNode.count();
  chk(
    "付款：改验收节点状态 → FinanceRecord 行数不变",
    frCountAfterUnlock === frCountBeforeUnlock,
    `${frCountBeforeUnlock} → ${frCountAfterUnlock}`
  );
  chk(
    "付款：改验收节点状态 → PaymentNode 行数不变",
    pnCountAfterUnlock === pnCountBeforeUnlock,
    `${pnCountBeforeUnlock} → ${pnCountAfterUnlock}`
  );

  // 重读 getPlanView → order2 state.unlocked=true（派生解锁）
  const viewAfter = await getPlanView(p2.id);
  const segAfter = viewAfter.segments.find((s) => s.order === 2);
  chk(
    "付款：002 order2 验收通过后 → 解锁（派生）",
    segAfter?.state.unlocked === true
  );

  // 断言 PaymentNode 行本身 paid/amountDue 未因这次改状态而变化
  const p2o2After = await prisma.paymentNode.findUnique({
    where: { id: p2o2.id },
    select: { paid: true, amountDue: true },
  });
  chk(
    "付款：002 order2 paid 未因改验收状态而变",
    p2o2After?.paid === paidBefore
  );
  chk(
    "付款：002 order2 amountDue 未因改验收状态而变",
    centEq(p2o2After?.amountDue ?? 0, amountDueBefore),
    `${amountDueBefore} vs ${p2o2After?.amountDue}`
  );

  // ── 13) 改合同额不回溯快照 ────────────────────────────────────
  const p2ContractOriginal = p2.contractAmount ?? 0;
  await prisma.project.update({
    where: { id: p2.id },
    data: { contractAmount: p2ContractOriginal * 2 },
  });
  const p2o2AfterContractChange = await prisma.paymentNode.findUnique({
    where: { id: p2o2.id },
    select: { amountDue: true },
  });
  chk(
    "付款：改合同额 → amountDue 不变（快照 §1-4）",
    centEq(p2o2AfterContractChange?.amountDue ?? 0, amountDueBefore),
    `${amountDueBefore} vs ${p2o2AfterContractChange?.amountDue}`
  );

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
