/**
 * 预算模块的传输/展示类型。
 * 计算相关的纯类型与 lib/quote.ts 共用，保证服务端与客户端口径一致（AGENTS §5）。
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
