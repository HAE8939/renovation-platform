/**
 * 线索阶段纯常量与纯函数（不依赖 prisma，客户端可安全 import）。
 * 服务逻辑（server/leads.ts）与客户端 UI 共用同一份定义，避免重复。
 */

/** Lead 阶段有序序列：推进按钮据此决定“下一阶段”。 */
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

/**
 * 该阶段能否用“通用推进”（点“→ 下一阶段”/拖到下一列）前进一格。
 *
 * §4-14 收紧（M9-e）：**quoted→signed 不走通用推进**——通用推进只改 Lead.stage，
 * 不会建项目、不会按手机号归并 Client；若允许它直达 signed，就会出现“线索已签约但无项目”
 * 的悬空态（与签约建项 `signLead` 双路径语义重叠）。故 quoted 之后只能经“签约建项”入口
 * 落 signed（那条路径同时建项目 + 回写 Lead.projectId）。看板/表格据此隐藏通用推进按钮，
 * 服务端 advanceStage 亦硬拒 signed 目标（口径单点，UI 藏不住就靠服务端兜底）。
 */
export function canGenericAdvance(stage: LeadStage): boolean {
  const next = nextStage(stage);
  return next !== null && next !== "signed";
}

/** 意向等级标签（看板卡片展示用）。 */
export const LEAD_INTENT_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};
