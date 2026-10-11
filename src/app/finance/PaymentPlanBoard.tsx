"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button } from "@/core/ui";
import { formatCny } from "@/core/domain/pricing";
import type { PlanSegment } from "@/modules/finance/server/payments";
import {
  clearPlanAction,
  generatePlanAction,
  markPaidAction,
  unmarkPaidAction,
  type PaymentActionState,
} from "@/app/finance/actions";

/** 仅日期（展示用，兼容 RSC 序列化后的 string）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ── 段级：状态徽章 ─────────────────────────────────────────────

function SegmentBadge({ segment }: { segment: PlanSegment }) {
  if (segment.paid) return <Badge variant="success">已付</Badge>;
  if (segment.state.unlocked) return <Badge variant="accent">可收款</Badge>;
  return <Badge variant="neutral">未解锁</Badge>;
}

/** 时间线圆点：已付=success / 可收=accent（单点钴蓝）/ 未解锁=muted。 */
function dotClass(segment: PlanSegment): string {
  if (segment.paid) return "bg-success";
  if (segment.state.unlocked) return "bg-accent";
  return "bg-muted";
}

// ── 段级：标记已付 ─────────────────────────────────────────────

function MarkPaidForm({ segment }: { segment: PlanSegment }) {
  const router = useRouter();
  const [state, formAction] = useFormState<PaymentActionState, FormData>(
    markPaidAction,
    {}
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (state.ok) {
    return <span className="text-[13px] text-success">已标记，刷新中…</span>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={segment.id} />
      <MarkPaidButton segment={segment} />
      {state.error && (
        <p className="mt-2 text-[13px] leading-relaxed text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

function MarkPaidButton({ segment }: { segment: PlanSegment }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending || !segment.canMark}
      title={!segment.canMark ? segment.state.reason : undefined}
    >
      {pending ? "处理中…" : "标记已付"}
    </Button>
  );
}

// ── 段级：撤销已付 ─────────────────────────────────────────────

function UnmarkPaidForm({ segment }: { segment: PlanSegment }) {
  const router = useRouter();
  const [state, formAction] = useFormState<PaymentActionState, FormData>(
    unmarkPaidAction,
    {}
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (state.ok) {
    return <span className="text-[13px] text-success">已撤销，刷新中…</span>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={segment.id} />
      <UnmarkPaidButton />
      {state.error && (
        <p className="mt-2 text-[13px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

function UnmarkPaidButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "处理中…" : "撤销已付"}
    </Button>
  );
}

// ── 计划级：清空（两步确认）────────────────────────────────────

function ClearPlanForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirm">("idle");
  const [state, formAction] = useFormState<PaymentActionState, FormData>(
    clearPlanAction,
    {}
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (state.ok) {
    return <span className="text-[13px] text-success">已清空，刷新中…</span>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      {mode === "idle" ? (
        <Button variant="danger" size="sm" onClick={() => setMode("confirm")}>
          清空计划
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-primary">确认清空？此操作不可撤销。</span>
          <ClearConfirmButton />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setMode("idle")}
          >
            取消
          </Button>
        </div>
      )}
      {state.error && (
        <p className="mt-2 text-[13px] leading-relaxed text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

function ClearConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "清空中…" : "确认清空"}
    </Button>
  );
}

// ── 计划级：生成（空态用）──────────────────────────────────────

/**
 * 生成付款计划表单（无计划空态用）。
 * canGenerate false 且 contractAmount<=0 时按钮禁用 + 提示录入合同额并链项目设置。
 */
export function GeneratePlanForm({
  projectId,
  canGenerate,
  contractAmount,
}: {
  projectId: string;
  canGenerate: boolean;
  contractAmount: number;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<PaymentActionState, FormData>(
    generatePlanAction,
    {}
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  if (state.ok) {
    return <span className="text-[13px] text-success">已生成，刷新中…</span>;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <GenerateButton canGenerate={canGenerate} />
      {state.error && (
        <p className="mt-2 text-[13px] text-danger">{state.error}</p>
      )}
      {!canGenerate && contractAmount <= 0 && (
        <p className="mt-2 text-[13px] text-secondary">
          先在
          <Link
            href={`/budget/${projectId}/settings`}
            className="mx-1 text-accent-ink underline-offset-4 hover:underline"
          >
            项目设置
          </Link>
          录入合同额后才能生成付款计划。
        </p>
      )}
    </form>
  );
}

function GenerateButton({ canGenerate }: { canGenerate: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !canGenerate}>
      {pending ? "生成中…" : "生成付款计划"}
    </Button>
  );
}

// ── 主看板：垂直时间线五段 ─────────────────────────────────────

/**
 * 付款计划看板（M8-c，客户端）。
 *
 * 垂直时间线五段（V0.3：无阴影、单点 accent 只给"当前可收段"=state.unlocked && !paid，
 * 其余中性）。每段：段名 + 比例 + 应收金额（右对齐 num formatCny）+ 触发条件文案
 * （triggerLabel）+ 状态徽章 + 未解锁时 state.reason 与 missing 工序清单 + 动作。
 *
 * 按钮走 useFormState+useFormStatus（仿 M8-b RecordDrawer）。
 * 派生全在 server 算（getPlanView），客户端只渲染，禁前端另算解锁态。
 */
export function PaymentPlanBoard({
  segments,
  projectId,
}: {
  segments: PlanSegment[];
  projectId: string;
}) {
  return (
    <div className="space-y-6">
      {/* 清空计划 */}
      <div className="flex justify-end">
        <ClearPlanForm projectId={projectId} />
      </div>

      {/* 垂直时间线 */}
      <div className="relative">
        <div
          className="absolute left-[5px] top-3 bottom-3 w-px bg-line"
          aria-hidden
        />
        <div className="space-y-4">
          {segments.map((s) => (
            <div key={s.id} className="relative pl-8">
              <span
                className={`absolute left-0 top-4 h-3 w-3 rounded-full ${dotClass(
                  s
                )}`}
                aria-hidden
              />
              <div className="rounded-card border border-line bg-surface p-4">
                {/* 段名 + 比例 | 应收金额 */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] font-medium text-primary">
                      {s.name}
                    </span>
                    <span className="text-[13px] text-secondary">
                      {s.percent}%
                    </span>
                  </div>
                  <span className="num text-[17px] font-semibold text-primary whitespace-nowrap">
                    {formatCny(s.amountDue)}
                  </span>
                </div>

                {/* 状态徽章 + 触发条件 */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <SegmentBadge segment={s} />
                  <span className="text-[13px] text-secondary">
                    {s.triggerLabel}
                  </span>
                </div>

                {/* 未解锁原因 */}
                {!s.state.unlocked && (
                  <p className="mt-2 text-[13px] leading-relaxed text-secondary">
                    {s.state.reason}
                  </p>
                )}

                {/* 多个 missing 工序时列全 */}
                {s.state.missing.length > 1 && (
                  <p className="mt-1 text-[12px] text-muted">
                    全部待验：{s.state.missing.join("、")}
                  </p>
                )}

                {/* 已付日期 */}
                {s.paid && s.paidAt && (
                  <p className="mt-1 text-[12px] text-secondary">
                    已付于 {formatDate(s.paidAt)}
                  </p>
                )}

                {/* 动作 */}
                <div className="mt-3">
                  {s.paid ? (
                    <UnmarkPaidForm segment={s} />
                  ) : (
                    <MarkPaidForm segment={s} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
