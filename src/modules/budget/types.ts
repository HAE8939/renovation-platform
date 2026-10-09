/**
 * 预算模块的传输/展示类型。
 * 计算相关类型已上收 core/domain/pricing.ts（单一口径真源，供 budget 与 projects 共用）。
 * 此处 re-export 保持既有 "@/modules/budget/types" 与相对 import 路径不破。
 */
export type {
  QuoteItemRow,
  QuoteCategoryGroup,
  QuoteTotals,
} from "../../core/domain/pricing";
