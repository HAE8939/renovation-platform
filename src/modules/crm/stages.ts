/**
 * 线索阶段纯常量与纯函数（不依赖 prisma，客户端可安全 import）。
 * 服务逻辑（server/leads.ts）与客户端 UI 共用同一份定义，避免重复。
 */

/** Lead 阶段有序序列：推进按钮据此决定「下一阶段」。 */
export const LEAD_STAGE_ORDER = [
  "leads",
  "contacted",
  "confirmed",
  "quoted",
  "signed",
] as const;
export type LeadStage = (typeof LEAD_STAGE_ORDER)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  leads: "线索",
  contacted: "已联系",
  confirmed: "已确认",
  quoted: "已报价",
  signed: "已签约",
};

/** 计算下一阶段；已是末态返回 null（按钮禁用）。 */
export function nextStage(stage: LeadStage): LeadStage | null {
  const idx = LEAD_STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= LEAD_STAGE_ORDER.length - 1) return null;
  return LEAD_STAGE_ORDER[idx + 1];
}
