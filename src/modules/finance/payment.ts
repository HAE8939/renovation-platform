/**
 * 付款计划纯函数（M8-a，模块私有，不查 prisma）。
 *
 * 五段模板 + 生成 + 解锁派生 + 门控，全部纯函数，可被 scripts/verify-finance.mjs
 * 直接 import 测。解锁＝派生、不落库（决策①）；未解锁不可标记已付（决策②/§1-5）；
 * 尾差归末段，五段之和恰等合同额（§1-6）。
 *
 * 工序名与 AcceptanceNode.name 同字面（承 M7 跨模块按名字匹配策略，不建外键）。
 */

import type { TriggerKind } from "./types";

/** 验收节点投影（只取 name + status，避免把整行透传进纯函数）。 */
export interface AcceptanceNodeProjection {
  name: string;
  status: string; // pending | submitted | returned | passed
}

/** 付款段投影（paymentUnlockState / paymentTriggerLabel 的入参形状）。 */
export interface PaymentNodeProjection {
  order: number;
  name: string;
  percent: number;
  amountDue: number;
  trigger: string; // none | stages | all
  triggerStages: string; // 逗号分隔工序名（仅 trigger=="stages" 用）
  unlocksAt: Date | null;
  paid: boolean;
}

/** 五段模板定义（顺序即 order 1..5）。 */
export interface PaymentStageDef {
  order: number;
  name: string;
  percent: number;
  trigger: TriggerKind;
  triggerStages: string[]; // 仅 trigger=="stages" 用
  unlocksAtOffsetMonths?: number; // 保修金用（相对竣工日 +N 个月）
}

/**
 * 五段付款模板（TASK_M8 §3 映射表）。
 * 工序名与 ProcessTemplate.name / AcceptanceNode.name 同字面。
 * 拆除/墙面/乳胶漆/定制/水电安装/竣工清洁 不挂中间段，由 `all`（竣工款）兜住（§7-4）。
 */
export const PAYMENT_STAGE_DEFS: readonly PaymentStageDef[] = [
  { order: 1, name: "开工款", percent: 30, trigger: "none", triggerStages: [] },
  { order: 2, name: "水电完成款", percent: 20, trigger: "stages", triggerStages: ["水电工程"] },
  {
    order: 3,
    name: "主体完工款",
    percent: 30,
    trigger: "stages",
    triggerStages: ["泥工工程", "防水工程", "地面工程", "天花工程"],
  },
  { order: 4, name: "竣工验收款", percent: 15, trigger: "all", triggerStages: [] },
  { order: 5, name: "保修金", percent: 5, trigger: "none", triggerStages: [], unlocksAtOffsetMonths: 12 },
] as const;

/** 生成付款计划的行（与 PaymentNodeProjection 同构，供物化入 DB）。 */
export interface PaymentPlanRow {
  order: number;
  name: string;
  percent: number;
  amountDue: number;
  trigger: TriggerKind;
  triggerStages: string; // 逗号分隔（DB 字段）
  unlocksAtOffsetMonths?: number;
}

/** 两位小数；复用 pricing.round2 的口径（先加 EPSILON 消尾差）。 */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * 按合同额生成五段计划。
 * - contractAmount <= 0 或非有限 → 返回 []（调用方据此拒绝生成，§1-7）。
 * - 前四段 round2(contract × percent / 100)；末段 = round2(contract − Σ前四段)，
 *   保证五段之和恰等合同额（尾差归末段，§1-6）。
 */
export function buildPaymentPlan(contractAmount: number): PaymentPlanRow[] {
  if (!Number.isFinite(contractAmount) || contractAmount <= 0) return [];
  const rows: PaymentPlanRow[] = [];
  let frontSum = 0;
  const defs = PAYMENT_STAGE_DEFS;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const isLast = i === defs.length - 1;
    let amountDue: number;
    if (isLast) {
      amountDue = round2(contractAmount - frontSum);
    } else {
      amountDue = round2((contractAmount * d.percent) / 100);
      frontSum = round2(frontSum + amountDue);
    }
    rows.push({
      order: d.order,
      name: d.name,
      percent: d.percent,
      amountDue,
      trigger: d.trigger,
      triggerStages: d.triggerStages.join(","),
      ...(d.unlocksAtOffsetMonths !== undefined
        ? { unlocksAtOffsetMonths: d.unlocksAtOffsetMonths }
        : {}),
    });
  }
  return rows;
}

/** 解锁派生结果。 */
export interface PaymentUnlockState {
  unlocked: boolean;
  reason: string;
  missing: string[];
}

/** yyyy-MM-dd（UTC，避免负时区把零点往前推一天）。 */
function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 付款段解锁派生（决策①：读取时算，不落库）。
 *
 * 优先级：
 * 1. unlocksAt 未到 → 未解锁（“保修期未至，{yyyy-MM-dd} 起可收”）← 日期优先
 * 2. trigger=="stages" 有工序未 passed 或无对应节点 → 未解锁
 * 3. trigger=="all" 存在非 passed 节点 → 未解锁
 * 4. 解锁
 *
 * missing[] 供 UI 列未过工序。文案中文、禁 emoji。
 */
export function paymentUnlockState(
  node: PaymentNodeProjection,
  nodes: AcceptanceNodeProjection[],
  today: Date
): PaymentUnlockState {
  // 1. 日期约束优先（保修金：unlocksAt 未到则锁，== today 视为已到可收）
  if (node.unlocksAt && today.getTime() < node.unlocksAt.getTime()) {
    return {
      unlocked: false,
      reason: `保修期未至，${fmtDate(node.unlocksAt)} 起可收`,
      missing: [],
    };
  }

  // 2. trigger=="stages"：所列工序节点须全部 passed
  if (node.trigger === "stages") {
    const stages = node.triggerStages
      ? node.triggerStages.split(",").filter((s) => s.length > 0)
      : [];
    if (stages.length === 0) {
      // 无工序要求（异常态）：视为解锁
      return { unlocked: true, reason: "触发条件已满足，可收款", missing: [] };
    }
    const missing: string[] = [];
    for (const s of stages) {
      const n = nodes.find((x) => x.name === s);
      if (!n || n.status !== "passed") missing.push(s);
    }
    if (missing.length > 0) {
      const first = missing[0];
      const hasNode = nodes.some((x) => x.name === first);
      const tag = hasNode ? "未通过" : "无对应节点";
      const prefix = nodes.length === 0 ? "（项目暂无验收节点）" : "";
      return {
        unlocked: false,
        reason: `待工序验收通过：${first}（${tag}）${prefix}`,
        missing,
      };
    }
    return { unlocked: true, reason: "触发条件已满足，可收款", missing: [] };
  }

  // 3. trigger=="all"：项目全部验收节点须 passed
  if (node.trigger === "all") {
    if (nodes.length === 0) {
      return {
        unlocked: false,
        reason: "待全部验收节点通过（暂无验收节点）",
        missing: [],
      };
    }
    const nonPassed = nodes.filter((n) => n.status !== "passed");
    if (nonPassed.length > 0) {
      return {
        unlocked: false,
        reason: `待全部验收节点通过（尚缺 ${nonPassed.length} 项）`,
        missing: nonPassed.map((n) => n.name),
      };
    }
    return { unlocked: true, reason: "触发条件已满足，可收款", missing: [] };
  }

  // 4. trigger=="none"（含已过日期的保修金）：解锁
  const reason = node.unlocksAt ? "保修期已至，可收款" : "无验收依赖，可收款";
  return { unlocked: true, reason, missing: [] };
}

/**
 * 人读触发条件（计划页展示用，非 emoji）。
 * - none 无日期 → “签约即可收”
 * - none 有日期 → “保修期满后收取”
 * - stages 单工序 → “{工序}验收通过”
 * - stages 多工序 → “主体四项工序验收通过”（§3 指定文案）
 * - all → “全部验收通过”
 */
export function paymentTriggerLabel(node: PaymentNodeProjection): string {
  switch (node.trigger) {
    case "none":
      return node.unlocksAt ? "保修期满后收取" : "签约即可收";
    case "stages": {
      const stages = node.triggerStages
        ? node.triggerStages.split(",").filter((s) => s.length > 0)
        : [];
      if (stages.length === 0) return "工序验收通过";
      if (stages.length === 1) return `${stages[0]}验收通过`;
      // 多工序（主体段）：§3 指定文案
      return "主体四项工序验收通过";
    }
    case "all":
      return "全部验收通过";
    default:
      return node.trigger;
  }
}

/**
 * 可标记已付门控（§1-5 硬门控）。
 * - 已付 → false（只能撤销，不能重复标记）
 * - 未解锁 → false（按钮 disabled，hint 给原因）
 * - 解锁且未付 → true
 */
export function canMarkPaid(state: PaymentUnlockState, paid: boolean): boolean {
  if (paid) return false;
  return state.unlocked;
}
