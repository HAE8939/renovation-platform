"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Badge, Card } from "@/core/ui";
import { advanceStageAction } from "@/modules/crm/actions";
import {
  LEAD_STAGE_ORDER,
  LEAD_STAGE_LABEL,
  LEAD_INTENT_LABEL,
  nextStage,
  type LeadStage,
} from "@/modules/crm/stages";
import type { LeadListItem } from "@/modules/crm/server/leads";
import { LeadDrawer, isStale, STAGE_BADGE } from "./LeadDrawer";

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
  const draggable = next !== null;

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

      {next && (
        <form
          action={advanceStageAction.bind(null, lead.id, next)}
          onClick={(e) => e.stopPropagation()}
          className="mt-3 border-t border-line pt-3"
        >
          <button
            type="submit"
            className="inline-flex h-8 w-full items-center justify-center rounded-inner border border-line bg-surface px-3 text-[13px] font-medium text-accent-ink whitespace-nowrap transition-colors hover:bg-accent-tint"
          >
            → 下一阶段「{LEAD_STAGE_LABEL[next]}」
          </button>
        </form>
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

  const onDragStart = useCallback((id: string, stage: LeadStage) => {
    setDragId(id);
    setDragFrom(stage);
  }, []);
  const onDragEnd = useCallback(() => {
    setDragId(null);
    setDragFrom(null);
    setDropStage(null);
  }, []);

  // 仅允许拖到「下一列」（相邻且 idx+1）；回退列不处理（避免错误后退）。
  function handleDrop(target: LeadStage) {
    const id = dragId;
    const from = dragFrom;
    onDragEnd();
    if (!id || !from) return;
    const fromIdx = LEAD_STAGE_ORDER.indexOf(from);
    const toIdx = LEAD_STAGE_ORDER.indexOf(target);
    if (toIdx !== fromIdx + 1) return; // 仅向前推进到相邻列
    setAdvance({ leadId: id, stage: target });
  }

  const [advance, setAdvance] = useState<{ leadId: string; stage: LeadStage } | null>(null);

  // 渲染一个隐藏的推进表单（拖拽落点触发），挂载后自动提交一次。
  const advanceForm = advance ? (
    <DragAdvanceForm key={`${advance.leadId}-${advance.stage}`} leadId={advance.leadId} stage={advance.stage} />
  ) : null;

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex min-w-max gap-4">
          {LEAD_STAGE_ORDER.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const isDropTarget = dropStage === stage && dragFrom !== null;
            const allowDrop = dragFrom !== null && LEAD_STAGE_ORDER.indexOf(stage) === LEAD_STAGE_ORDER.indexOf(dragFrom) + 1;
            return (
              <div
                key={stage}
                className="flex w-[280px] shrink-0 flex-col"
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

/** 拖拽落点后挂载的隐藏推进表单，自动提交一次后即卸载（由父级 setAdvance(null) 清理）。 */
function DragAdvanceForm({ leadId, stage }: { leadId: string; stage: LeadStage }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.requestSubmit();
  }, []);
  return (
    <form ref={ref} action={advanceStageAction.bind(null, leadId, stage)} className="hidden">
      <button type="submit" />
    </form>
  );
}
