import prisma from "@/core/db";
import { AREA_TIERS, AREA_TIER_LABEL } from "../plan";
import type { AreaTier } from "../types";

/**
 * 工序模板库服务（M6-d，只读聚合 + 单行更新）。
 * 跨模块读走 core/db 的 prisma 直读，不 import 其他模块 server 内部。
 * 模板＝11 工序 × 3 面积档的标准工期；改天数不回溯已生成排程（排程生成即快照）。
 */

/** 模板编辑业务错误：中文文案直达 UI（仿 ScheduleGenerateError / ScheduleUpdateError）。 */
export class ScheduleTemplateError extends Error {}

/** 单档格：id 供 update 用；缺行时 id=null、days=null（不造假数）。 */
export interface TemplateCell {
  id: string | null;
  days: number | null;
}

/** 工序行：name + order + 三档格。 */
export interface TemplateRow {
  name: string;
  order: number;
  days: Record<AreaTier, TemplateCell>;
}

/** 模板矩阵（11 工序 × 3 档），含缺失标记与档标签。 */
export interface TemplateMatrix {
  rows: TemplateRow[];
  tierLabels: Record<AreaTier, string>;
  hasMissing: boolean;
}

/**
 * 读全部 ProcessTemplate（order asc），按工序聚合为 11 行 × 3 档。
 * 三档缺行时如实标缺失（id=null, days=null），不造假数。
 */
export async function listTemplateMatrix(): Promise<TemplateMatrix> {
  const all = await prisma.processTemplate.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true, tier: true, days: true },
  });

  const tierSet = new Set<string>(AREA_TIERS);
  const byOrder = new Map<number, TemplateRow>();

  for (const r of all) {
    let row = byOrder.get(r.order);
    if (!row) {
      row = {
        name: r.name,
        order: r.order,
        days: {
          lt90: { id: null, days: null },
          b90_130: { id: null, days: null },
          gt130: { id: null, days: null },
        },
      };
      byOrder.set(r.order, row);
    }
    if (tierSet.has(r.tier)) {
      row.days[r.tier as AreaTier] = { id: r.id, days: r.days };
    }
  }

  const rows = [...byOrder.values()].sort((a, b) => a.order - b.order);
  let hasMissing = false;
  for (const row of rows) {
    for (const tier of AREA_TIERS) {
      if (row.days[tier].id === null) hasMissing = true;
    }
  }

  return { rows, tierLabels: AREA_TIER_LABEL, hasMissing };
}

/**
 * 更新单个模板行天数（M6-d）。
 * 守卫：天数须为 1–999 的整数；行须存在。单条 update。
 */
export async function updateTemplateDays(id: string, days: number): Promise<void> {
  if (!Number.isInteger(days) || days < 1 || days > 999) {
    throw new ScheduleTemplateError("天数须为 1–999 的整数");
  }
  const row = await prisma.processTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!row) throw new ScheduleTemplateError("模板行不存在");
  await prisma.processTemplate.update({
    where: { id },
    data: { days },
  });
}
