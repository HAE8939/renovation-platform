"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { advanceStageAction, type AdvanceStageState } from "@/modules/crm/actions";
import { LEAD_STAGE_LABEL, type LeadStage } from "@/modules/crm/stages";

/**
 * 线索推进表单（M8.5）：useFormState 失败回显 + pending 态。
 * variant="card"＝看板卡片（整宽按钮 + 顶部边框分区）；variant="table"＝表格行内小按钮。
 */
export function AdvanceStageForm({
  leadId,
  stage,
  variant = "table",
  onError,
}: {
  leadId: string;
  stage: LeadStage;
  variant?: "card" | "table";
  onError?: (msg: string) => void;
}) {
  const [state, formAction] = useFormState<AdvanceStageState, FormData>(
    advanceStageAction.bind(null, leadId, stage),
    {}
  );

  useEffect(() => {
    if (state.error && onError) onError(state.error);
  }, [state.error, onError]);

  const btnClass =
    "inline-flex h-8 items-center justify-center rounded-inner border border-line bg-surface px-3 text-[13px] font-medium text-accent-ink whitespace-nowrap transition-colors hover:bg-accent-tint disabled:opacity-50 disabled:pointer-events-none" +
    (variant === "card" ? " w-full" : "");

  return (
    <form
      action={formAction}
      onClick={(e) => e.stopPropagation()}
      className={variant === "card" ? "mt-3 border-t border-line pt-3" : undefined}
    >
      <SubmitBtn className={btnClass}>
        {variant === "card"
          ? `→ 下一阶段“${LEAD_STAGE_LABEL[stage]}”`
          : `推进到“${LEAD_STAGE_LABEL[stage]}”`}
      </SubmitBtn>
      {state.error && <p className="mt-1 text-[12px] text-danger">{state.error}</p>}
    </form>
  );
}

function SubmitBtn({ className, children }: { className: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "推进中…" : children}
    </button>
  );
}
