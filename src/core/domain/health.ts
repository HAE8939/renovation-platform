/**
 * 派生层：项目健康度纯函数（core/domain）。
 *
 * 单一口径真源。**不 import prisma、不查库、不造数**——
 * 无对应数据时优雅降级返回中性，可被脚本直接 import 测试（见 scripts/verify-health.mjs）。
 * schedule / quality / finance 的真实数据分别由 M6 / M7 / M8 接入，
 * 函数本身只接收调用方传入的快照值。
 *
 * 三色灯返回语义 token（非 emoji）：green | yellow | red，
 * UI 渲成 V0.3 的色点（PLAN §7.4）。
 */

export type Light = "green" | "yellow" | "red";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** 整体进度 = 工序 progress 均值；无工序 → 0。Math.round 取整。 */
export function overallProgress(tasks: { progress: number }[]): number {
  if (!tasks || tasks.length === 0) return 0;
  const sum = tasks.reduce((s, t) => s + (Number.isFinite(t?.progress) ? t.progress : 0), 0);
  return Math.round(sum / tasks.length);
}

/**
 * 工期灯：
 * - actualEndDate > endDate（实际超计划）→ red
 * - 否则，endDate 缺失 → green（降级）
 * - 否则，距计划完工 (endDate - today) <= 7 天 且 进度 < 80 → yellow
 * - 否则 → green
 */
export function scheduleLight(
  a: { endDate: Date | null; actualEndDate: Date | null; progress: number },
  today: Date
): Light {
  if (a.actualEndDate && a.endDate && a.actualEndDate.getTime() > a.endDate.getTime()) {
    return "red";
  }
  if (!a.endDate) {
    return "green"; // 计划完工缺失：降级为中性
  }
  const daysLeft = (a.endDate.getTime() - today.getTime()) / MS_PER_DAY;
  if (daysLeft <= 7 && a.progress < 80) {
    return "yellow";
  }
  return "green";
}

/** 质量灯：openIssues > 0 → red；否则 pendingNodes > 0 → yellow；否则 green。 */
export function qualityLight(a: { openIssues: number; pendingNodes: number }): Light {
  if (a.openIssues > 0) return "red";
  if (a.pendingNodes > 0) return "yellow";
  return "green";
}

/**
 * 预算灯（paidTotal 对 contractAmount + changeTotal 的占比）：
 * - total == 0（合同额未录入）→ green（哨兵降级，不误报红）
 * - paidTotal > total → red
 * - paidTotal > 0.85 * total → yellow
 * - 否则 → green
 */
export function budgetLight(a: {
  contractAmount: number;
  changeTotal: number;
  paidTotal: number;
}): Light {
  const total = (a.contractAmount ?? 0) + (a.changeTotal ?? 0);
  if (total <= 0) return "green"; // 哨兵降级
  if (a.paidTotal > total) return "red";
  if (a.paidTotal > 0.85 * total) return "yellow";
  return "green";
}
