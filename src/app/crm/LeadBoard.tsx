"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useFormState } from "react-dom";
import { Badge, Card } from "@/core/ui";
import { advanceStageAction, type AdvanceStageState } from "@/modules/crm/actions";
import {
  LEAD_STAGE_ORDER,
  LEAD_STAGE_LABEL,
  LEAD_INTENT_LABEL,
  nextStage,
  canGenericAdvance,
  type LeadStage,
} from "@/modules/crm/stages";
import type { LeadListItem } from "@/modules/crm/server/leads";
import { LeadDrawer, isStale, STAGE_BADGE } from "./LeadDrawer";
import { AdvanceStageForm } from "./AdvanceStageForm";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function intentBadgeVariant(level: string): "neutral" | "accent" | "warning" {
  if (level === "high") return "accent";
  if (level === "low") return "warning";
  return "neutral";
}

/** 单张线索卡片。 */
function LeadCard({
  lead,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  lead: LeadListItem;
  onOpen: (id: string) => void;
  onDragStart: (id: string, stage: LeadStage) => void;
  onDragEnd: () => void;
}) {
  const next = nextStage(lead.stage);
  const stale = isStale(lead);
  // §4-14：quoted→signed 不走通用推进（须经抽屉里的“签约建项”），故 quoted 卡不可拖、不显推进按钮。
  const canAdvance = canGenericAdvance(lead.stage);
  const draggable = canAdvance;

  return (
    <Card
      padded
      className={`cursor-pointer transition-colors hover:border-accent ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead.id, lead.stage);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead.id)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium text-primary whitespace-nowrap truncate">
          {lead.name}
        </span>
        <Badge variant={intentBadgeVariant(lead.intentLevel)} className="shrink-0">
          意向 {LEAD_INTENT_LABEL[lead.intentLevel] ?? lead.intentLevel}
        </Badge>
      </div>

      <div className="mt-2 space-y-1 text-[13px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-secondary whitespace-nowrap">楼盘</span>
          <span className="text-right text-primary break-words">{lead.estate ?? "—"}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-secondary whitespace-nowrap">面积</span>
          <span className="text-right text-primary num">{lead.area ? lead.area.toFixed(1) : "—"} ㎡</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-secondary whitespace-nowrap">预算区间</span>
          <span className="text-right text-primary break-words">{lead.budgetRange ?? "—"}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-secondary whitespace-nowrap">负责人</span>
          <span className="text-right text-primary break-words">{lead.assignee ?? "—"}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-secondary whitespace-nowrap">最后跟进</span>
          <span className={`text-right num ${stale ? "text-danger font-medium" : "text-primary"}`}>
            {formatDate(lead.lastFollowAt)}
          </span>
        </div>
      </div>

      {canAdvance && next && <AdvanceStageForm leadId={lead.id} stage={next} variant="card" />}
      {lead.stage === "quoted" && (
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          已报价 · 点卡片打开抽屉，走“签约建项”落定签约
        </p>
      )}
    </Card>
  );
}

/** 看板：按 LEAD_STAGE_ORDER 五列，支持拖拽到下一列 + 下一阶段按钮兜底。 */
export function LeadBoard({ leads }: { leads: LeadListItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<LeadStage | null>(null);
  const [dropStage, setDropStage] = useState<LeadStage | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<LeadStage, LeadListItem[]>();
    for (const s of LEAD_STAGE_ORDER) map.set(s, []);
    for (const l of leads) {
      const list = map.get(l.stage);
      if (list) list.push(l);
    }
    return map;
  }, [leads]);

  const open = useCallback((id: string) => setOpenId(id), []);
  const openLead = openId ? leads.find((l) => l.id === openId) : null;

  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const onDragStart = useCallback((id: string, stage: LeadStage) => {
    setDragId(id);
    setDragFrom(stage);
    setAdvanceError(null);
  }, []);
  const onDragEnd = useCallback(() => {
    setDragId(null);
    setDragFrom(null);
    setDropStage(null);
  }, []);

  // 仅允许拖到“下一列”（相邻且 idx+1）；回退列不处理（避免错误后退）。
  function handleDrop(target: LeadStage) {
    const id = dragId;
    const from = dragFrom;
    onDragEnd();
    if (!id || !from) return;
    const fromIdx = LEAD_STAGE_ORDER.indexOf(from);
    const toIdx = LEAD_STAGE_ORDER.indexOf(target);
    if (toIdx !== fromIdx + 1) return; // 仅向前推进到相邻列
    setAdvanceError(null);
    setAdvance({ leadId: id, stage: target });
  }

  const [advance, setAdvance] = useState<{ leadId: string; stage: LeadStage } | null>(null);

  // 渲染一个隐藏的推进表单（拖拽落点触发），挂载后自动提交一次。
  const advanceForm = advance ? (
    <DragAdvanceForm key={`${advance.leadId}-${advance.stage}`} leadId={advance.leadId} stage={advance.stage} onError={setAdvanceError} />
  ) : null;

  return (
    <>
      {advanceError && <p className="mb-3 text-[13px] text-danger">推进失败：{advanceError}</p>}
      {/* M10-a UI-7：原为“横向滚动 + 每列固定 280px”，五列并排必然出底部滑块、
          看不全全部内容（HAE 意见 7）。改为响应式网格：窄屏两列换行、宽屏五列并排且列宽自适应。 */}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="contents">
          {LEAD_STAGE_ORDER.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const isDropTarget = dropStage === stage && dragFrom !== null;
            const allowDrop = dragFrom !== null && LEAD_STAGE_ORDER.indexOf(stage) === LEAD_STAGE_ORDER.indexOf(dragFrom) + 1;
            return (
              <div
                key={stage}
                className="flex min-w-0 flex-col"
                onDragOver={(e) => {
                  if (allowDrop) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropStage(stage);
                  }
                }}
                onDragLeave={() => setDropStage((s) => (s === stage ? null : s))}
                onDrop={() => handleDrop(stage)}
              >
                {/* 列头：阶段名 + 该阶段线索数 */}
                <div
                  className={`flex items-center justify-between border-b-2 px-1 pb-2 ${
                    isDropTarget ? "border-accent" : "border-line"
                  }`}
                >
                  <span className="text-[13px] font-semibold text-primary whitespace-nowrap">
                    {LEAD_STAGE_LABEL[stage]}
                  </span>
                  <Badge variant={STAGE_BADGE[stage] ?? "neutral"}>{items.length}</Badge>
                </div>

                {/* 列体：卡片堆 */}
                <div
                  className={`mt-3 flex min-h-[48px] flex-col gap-3 rounded-inner p-2 transition-colors ${
                    isDropTarget ? "bg-accent-tint" : "bg-transparent"
                  }`}
                >
                  {items.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[13px] text-secondary">
                      暂无线索
                    </p>
                  ) : (
                    items.map((l) => (
                      <LeadCard key={l.id} lead={l} onOpen={open} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {advanceForm}

      <LeadDrawer
        leadId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        name={openLead?.name}
      />
    </>
  );
}

/** 拖拽落点后挂载的隐藏推进表单，自动提交一次；失败经 onError 上报集成到看板顶部提示（M8.5）。 */
function DragAdvanceForm({
  leadId,
  stage,
  onError,
}: {
  leadId: string;
  stage: LeadStage;
  onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState<AdvanceStageState, FormData>(
    advanceStageAction.bind(null, leadId, stage),
    {}
  );
  useEffect(() => {
    ref.current?.requestSubmit();
  }, []);
  useEffect(() => {
    if (state.error) onError(state.error);
  }, [state.error, onError]);
  return (
    <form ref={ref} action={formAction} className="hidden">
      <button type="submit" />
    </form>
  );
}
