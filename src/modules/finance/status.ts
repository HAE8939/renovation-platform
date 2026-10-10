/**
 * 财务管控 label 与 tone 映射（M8-a，仿 quality/status.ts + design/status.ts）。
 * 不依赖 prisma，客户端可安全 import；服务与 UI 共用同一份定义。
 * 禁 emoji、禁彩色图标；tone 用语义 token（accent / warning / danger / neutral）。
 * 守单点 accent：只有 income（正向收款）用 accent 蓝，其余按语义。
 */

import type { FinanceCategory, FinanceType, TriggerKind } from "./types";

// ── 收支类型 ──────────────────────────────────────────────────

/** 收支类型中文标签（非 emoji）。 */
export const RECORD_TYPE_LABEL: Record<FinanceType, string> = {
  income: "收入",
  expense: "支出",
};

/** 收支类型徽章语义色（非 emoji）：income=accent（单点蓝）/ expense=warning。 */
export type RecordTypeTone = "accent" | "warning";

export function recordTypeTone(type: string): RecordTypeTone {
  return type === "income" ? "accent" : "warning";
}

// ── 收支科目 ──────────────────────────────────────────────────

/** 科目中文标签（非 emoji）。 */
export const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  contract: "合同款",
  change: "变更款",
  refund: "退款",
  material: "材料费",
  labor: "人工费",
  other: "其他支出",
};

/**
 * 科目徽章语义色（非 emoji）：收入三类归 accent（守单点蓝，与 income tone 一致），
 * 退款归 warning（与正常收入区分），支出三类归 warning（支出色调），
 * other 归 neutral（兜底，不抢 accent）。
 */
export type CategoryTone = "accent" | "warning" | "neutral";

export const CATEGORY_TONE: Record<FinanceCategory, CategoryTone> = {
  contract: "accent",
  change: "accent",
  refund: "warning",
  material: "warning",
  labor: "warning",
  other: "neutral",
};

// ── 付款段触发条件 ────────────────────────────────────────────

/** 付款段触发条件人读标签（非 emoji），供计划页展示。 */
export const PAYMENT_TRIGGER_LABEL: Record<TriggerKind, string> = {
  none: "签约即可收",
  stages: "工序验收通过",
  all: "全部验收通过",
};
