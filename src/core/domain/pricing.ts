/**
 * 报价计算口径 —— 单一真源（core/domain）。
 * M4-a 技术债清理：从 modules/budget/lib/quote.ts 上收至此，使 budget 与 projects
 * 共用同一算法而不产生跨模块 import（AGENTS §2）。budget/lib/quote.ts 现 re-export 本文件。
 *
 * 服务端渲染初始值、客户端改数量即时重算、projects 列表汇总，都调这里，保证数字一致。
 * 全部金额两位小数（AGENTS §5）。本文件自包含、不 import 任何模块（可被 plain node / verify 脚本直接加载）。
 */

/** 一条报价明细（快照自科目模板）。 */
export interface QuoteItemRow {
  id: string;
  categoryName: string;
  code: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  materials: string;
  sop: string;
  order: number;
}

/** 按科目分组后的报价结构。 */
export interface QuoteCategoryGroup {
  categoryName: string;
  order: number;
  items: QuoteItemRow[];
  subtotal: number;
}

/** 报价汇总口径（AGENTS §5）。 */
export interface QuoteTotals {
  /** 直接费 = Σ(unitPrice × quantity) */
  directSubtotal: number;
  /** 税金 = 直接费 × 税率 */
  tax: number;
  /** 总价 = 直接费 + 税金 */
  grand: number;
  /** 单方造价 = 总价 ÷ 建筑面积㎡；面积 ≤ 0 时为 null */
  unitCost: number | null;
  taxRate: number;
  itemCount: number;
  categoryCount: number;
}

/** 两位小数；先加 EPSILON 消除浮点尾差（如 0.1+0.2 型误差）。 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 行小计 = 单价 × 数量。 */
export function lineTotal(unitPrice: number, quantity: number): number {
  return round2(unitPrice * quantity);
}

/** 按科目分组（保持稳定顺序：按科目首现顺序 + order），并算组内小计。 */
export function groupByCategory(items: QuoteItemRow[]): QuoteCategoryGroup[] {
  const map = new Map<string, QuoteCategoryGroup>();
  for (const item of items) {
    let group = map.get(item.categoryName);
    if (!group) {
      group = { categoryName: item.categoryName, order: item.order, items: [], subtotal: 0 };
      map.set(item.categoryName, group);
    }
    group.items.push(item);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    g.subtotal = round2(g.items.reduce((sum, it) => sum + lineTotal(it.unitPrice, it.quantity), 0));
  }
  groups.sort((a, b) => a.order - b.order || a.categoryName.localeCompare(b.categoryName, "zh"));
  return groups;
}

/** 汇总：直接费 / 税金 / 总价 / 单方造价。area ≤ 0 时单方造价为 null。 */
export function computeTotals(
  items: QuoteItemRow[],
  taxRate: number,
  area: number
): QuoteTotals {
  const directSubtotal = round2(
    items.reduce((sum, it) => sum + lineTotal(it.unitPrice, it.quantity), 0)
  );
  const tax = round2(directSubtotal * taxRate);
  const grand = round2(directSubtotal + tax);
  const categoryCount = new Set(items.map((i) => i.categoryName)).size;
  return {
    directSubtotal,
    tax,
    grand,
    unitCost: area > 0 ? round2(grand / area) : null,
    taxRate,
    itemCount: items.length,
    categoryCount,
  };
}

/** 金额展示：¥ + 千分位 + 两位小数。 */
export function formatCny(n: number | null): string {
  if (n === null) return "—";
  return `¥${n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 数字展示：千分位 + 两位小数（面积/数量用）。 */
export function formatQty(n: number): string {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/** 百分比：0.03 → 3%（最多一位小数）。 */
export function formatPercent(n: number): string {
  return `${(n * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
