/**
 * 报价计算口径 re-export shim。
 * 真实现在 core/domain/pricing.ts（单一口径真源，budget 与 projects 共用，避免跨模块 import）。
 * 保留本文件 + 相对 re-export，使既有 "@/modules/budget/lib/quote" 与 verify-quote 的绝对路径 import 不破。
 */
export * from "../../../core/domain/pricing";
