/**
 * 设计任务返修率纯函数（M5-c）。不依赖 prisma，可被 scripts/verify-design.mjs 直接 import 断言。
 *
 * 口径（定死，勿两个口径混用）：
 *   - 有提交任务数 = submissions 非空的任务数
 *   - 有退回任务数 = 至少含一条 result==="rejected" 的任务数
 *   - reworkRate = 有退回任务数 / 有提交任务数（分母 0 → 0）  ← 主口径（发生过返修的任务占比）
 *   - avgReworkRounds = Σ(每任务 rejected 条数) / 有提交任务数（分母 0 → 0）  ← 参考口径
 *
 * 输出均为 0..1 之间的比率，不含 emoji；UI 自行格式化为百分比。
 */

/** 返修率计算所需的任务形状：只需 submissions[].result。 */
export interface ReworkTask {
  submissions: { result: string }[];
}

/**
 * 返修率（主口径）：发生过返修的任务占比 = 有退回任务数 / 有提交任务数。
 * 分母 0（没有任何提交）→ 返回 0，避免除零。
 */
export function reworkRate(tasks: ReworkTask[]): number {
  const withSub = tasks.filter((t) => t.submissions && t.submissions.length > 0);
  if (withSub.length === 0) return 0;
  const withReject = withSub.filter((t) =>
    t.submissions.some((s) => s.result === "rejected")
  );
  return withReject.length / withSub.length;
}

/**
 * 平均返修轮次（参考口径）：每任务被退回次数之和 / 有提交任务数。
 * 一个任务被退回多次计多次；分母 0 → 0。
 */
export function avgReworkRounds(tasks: ReworkTask[]): number {
  const withSub = tasks.filter((t) => t.submissions && t.submissions.length > 0);
  if (withSub.length === 0) return 0;
  const totalRejected = withSub.reduce(
    (sum, t) => sum + t.submissions.filter((s) => s.result === "rejected").length,
    0
  );
  return totalRejected / withSub.length;
}
