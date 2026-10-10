/**
 * 排程计划纯函数（M6-a）。不依赖 prisma，客户端可安全 import。
 * 面积定档 + 模板链式排期 + 相邻依赖边 + 拓扑无环。
 * 生成口径＝线性链（§1-3）：面积定档 → 该档模板按 order 排序 →
 * 日期从开工日起链（start=前序.end+1；end=start+days-1，含当天）。
 */

import type { AreaTier, ScheduleRow, ScheduleRowInput } from "./types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** 面积档有序序列。 */
export const AREA_TIERS = ["lt90", "b90_130", "gt130"] as const;

/** 面积档中文标签。 */
export const AREA_TIER_LABEL: Record<AreaTier, string> = {
  lt90: "90㎡以下",
  b90_130: "90-130㎡",
  gt130: "130㎡以上",
};

/**
 * 面积 → 档：
 * - <90 → lt90
 * - 90–130（含端点）→ b90_130
 * - >130 → gt130
 * area ≤ 0 或非有限数 → null（无法判档，引导用户补面积）。
 */
export function areaTier(area: number): AreaTier | null {
  if (!Number.isFinite(area) || area <= 0) return null;
  if (area < 90) return "lt90";
  if (area <= 130) return "b90_130";
  return "gt130";
}

/**
 * 模板行 + 开工日 → 工序链式排期。
 * rows 先按 order 升序排序再链式排：task.start = 前序.end + 1 天；end = start + days - 1（含当天）。
 * 相邻工序无缝无叠（次序 start == 前序 end + 1 天）。
 * 用纯毫秒数学（不改写时区），调用方应传归零到 0 点的日期（seed 与生成服务均传 UTC 0 点）。
 * days 非正整数 → throw（防御性，模板不应有 0/负天数）。
 * 返回 {name, order, start, end}[]，长度与 rows 一致；rows 为空返回空数组。
 */
export function buildSchedule(
  rows: ScheduleRowInput[],
  start: Date
): ScheduleRow[] {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const result: ScheduleRow[] = [];
  let cursor = new Date(start.getTime());
  for (const r of sorted) {
    if (!Number.isInteger(r.days) || r.days <= 0) {
      throw new Error(`工序天数非法：${r.name}=${r.days}（须为正整数）`);
    }
    const s = new Date(cursor);
    const e = new Date(s.getTime() + (r.days - 1) * MS_PER_DAY);
    result.push({ name: r.name, order: r.order, start: s, end: e });
    cursor = new Date(e.getTime() + MS_PER_DAY);
  }
  return result;
}

/**
 * 相邻工序依赖索引对：返回 [i, i-1] 共 n-1 条（i 从 1 到 n-1）。
 * 含义：第 i 个工序依赖第 i-1 个（前置）。n<=1 返回空数组。
 */
export function chainEdges(n: number): [number, number][] {
  if (!Number.isInteger(n) || n < 0) return [];
  const edges: [number, number][] = [];
  for (let i = 1; i < n; i++) edges.push([i, i - 1]);
  return edges;
}

/**
 * 拓扑无环检测（含自环）：给定节点 id 列表与有向边 [from, to]（from 依赖 to），
 * 若存在环或自环返回 true，否则 false。节点不在 nodeIds 中的边被忽略。
 * 用 DFS 三色标记：白=未访问 / 灰=在栈中（遇灰即环）/ 黑=已完成。
 */
export function hasCycle(
  nodeIds: string[],
  edges: [string, string][]
): boolean {
  const nodes = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  for (const id of nodes) adj.set(id, []);
  for (const [from, to] of edges) {
    if (!nodes.has(from) || !nodes.has(to)) continue;
    adj.get(from)!.push(to);
  }
  const color = new Map<string, number>(); // 0=白 1=灰 2=黑
  for (const id of nodes) color.set(id, 0);

  const dfs = (v: string): boolean => {
    color.set(v, 1);
    for (const u of adj.get(v) ?? []) {
      const c = color.get(u);
      if (c === 1) return true; // 灰→灰：遇到在栈中的祖先，成环
      if (c === 0 && dfs(u)) return true;
    }
    color.set(v, 2);
    return false;
  };

  for (const id of nodes) {
    if (color.get(id) === 0) {
      if (dfs(id)) return true;
    }
  }
  return false;
}
