"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/core/ui";
import {
  isTaskOverdue,
  SCHEDULE_TASK_STATUS_LABEL,
} from "@/modules/schedule/status";
import type { ScheduleTaskStatus } from "@/modules/schedule/types";
import type {
  ProjectScheduleData,
  ScheduleTaskRow,
} from "@/modules/schedule/server/tasks";
import {
  generateScheduleAction,
  shiftTaskDatesAction,
  type ScheduleActionState,
} from "@/modules/schedule/actions";
import { TaskDrawer } from "./TaskDrawer";

/**
 * 工程甘特图主体（M6-b，客户端）。
 * 不碰 prisma；日期一律 ISO 字符串；纯函数 isTaskOverdue / 状态标签直 import 真源。
 * 本单元不做：行点击抽屉、拖拽、任何编辑入口（M6-c 交付）。
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ROW_H = 32;
const HEADER_H = 28;
const LEFT_W = 208;
const PLAN_BAR_H = 12;
const PROGRESS_BAR_H = 8;
const HOVER_CARD_H = 132; // 浮层预估高度，用于上下贴边翻转

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmtMD(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${dd}`;
}

function daysBetween(aIso: string, bIso: string): number {
  return (
    Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / MS_PER_DAY) +
    1
  );
}

// ── 空态：可生成预览 ──────────────────────────────────────────

function GenerateSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "生成中…" : "一键生成排程"}
    </Button>
  );
}

function GeneratePreview({ data }: { data: ProjectScheduleData }) {
  const [state, formAction] = useFormState<ScheduleActionState, FormData>(
    generateScheduleAction,
    {}
  );
  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <h2 className="text-[17px] font-semibold text-primary">一键生成排程</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-secondary">
        面积 <span className="num text-primary">{data.project.area} ㎡</span>
        {" → "}判定为「{data.tierLabel}」档
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 font-medium text-secondary whitespace-nowrap">
                序号
              </th>
              <th className="py-2 pr-4 font-medium text-secondary whitespace-nowrap">
                工序
              </th>
              <th className="py-2 pr-4 font-medium text-secondary whitespace-nowrap">
                天数
              </th>
              <th className="py-2 pr-4 font-medium text-secondary whitespace-nowrap">
                计划开始
              </th>
              <th className="py-2 pr-4 font-medium text-secondary whitespace-nowrap">
                计划结束
              </th>
            </tr>
          </thead>
          <tbody>
            {data.previewRows.map((r) => (
              <tr key={r.order} className="border-b border-line">
                <td className="py-2 pr-4 num text-secondary whitespace-nowrap">
                  {r.order}
                </td>
                <td className="py-2 pr-4 text-primary whitespace-nowrap">
                  {r.name}
                </td>
                <td className="py-2 pr-4 num text-primary whitespace-nowrap">
                  {r.days} 天
                </td>
                <td className="py-2 pr-4 num text-primary whitespace-nowrap">
                  {fmtDate(r.startDate)}
                </td>
                <td className="py-2 pr-4 num text-primary whitespace-nowrap">
                  {fmtDate(r.endDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <p className="text-[13px] text-secondary">
          合计 <span className="num text-primary font-medium">{data.previewTotalDays}</span> 天
          <span className="mx-2" aria-hidden>·</span>
          计划区间
          <span className="num text-primary"> {fmtDate(data.previewPlannedStart)} </span>
          至
          <span className="num text-primary"> {fmtDate(data.previewPlannedEnd)} </span>
        </p>
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="projectId" value={data.project.id} />
          {state.error && (
            <p className="text-[13px] text-danger">{state.error}</p>
          )}
          <GenerateSubmitButton />
        </form>
      </div>
    </div>
  );
}

// ── 空态：不可生成 ────────────────────────────────────────────

function CannotGenerate({ data }: { data: ProjectScheduleData }) {
  return (
    <div className="rounded-card border border-line bg-surface px-8 py-12 text-center">
      <p className="text-[15px] font-medium text-primary">暂无法生成排程</p>
      <p className="mt-2 text-[13px] leading-relaxed text-secondary">
        {data.cannotGenerateReason ?? "缺少必要条件"}。
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-secondary">
        开工日期与建筑面积在「项目设置」维护。
      </p>
      <Link
        href={`/budget/${data.project.id}/settings`}
        className="mt-4 inline-flex h-8 items-center rounded-inner bg-accent px-3 text-[13px] font-medium text-white whitespace-nowrap transition-colors hover:opacity-90"
      >
        前往项目设置
      </Link>
    </div>
  );
}

// ── 图例 ───────────────────────────────────────────────────────

function Legend() {
  const items: { label: string; swatch: string }[] = [
    { label: "计划条", swatch: "bg-sunken border border-line" },
    { label: "进行中", swatch: "bg-accent" },
    { label: "已完成", swatch: "bg-success" },
    { label: "逾期", swatch: "bg-danger" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <span
          key={it.label}
          className="inline-flex items-center gap-2"
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-inner ${it.swatch}`}
          />
          <span className="text-[12px] text-secondary whitespace-nowrap">
            {it.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── 悬停浮层 ───────────────────────────────────────────────────

function HoverCard({
  task,
  top,
  svgHeight,
}: {
  task: ScheduleTaskRow;
  top: number;
  svgHeight: number;
}) {
  const statusLabel =
    SCHEDULE_TASK_STATUS_LABEL[task.status as ScheduleTaskStatus] ??
    task.status;
  // 上下贴边翻转：默认贴行下方，超出图底则翻到行上方。
  const belowTop = top + ROW_H + 2;
  const placeAbove = belowTop + HOVER_CARD_H > svgHeight;
  const cardTop = placeAbove ? Math.max(0, top - HOVER_CARD_H - 2) : belowTop;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-inner border border-line bg-surface px-3 py-2"
      style={{ top: cardTop, left: 8, maxWidth: 260 }}
    >
      <div className="text-[13px] font-medium text-primary">{task.name}</div>
      <div className="mt-1 space-y-1 text-[12px] text-secondary">
        <div>
          计划区间
          <span className="num text-primary"> {fmtDate(task.startDate)} </span>
          至
          <span className="num text-primary"> {fmtDate(task.endDate)} </span>
        </div>
        <div>
          天数 <span className="num text-primary">{daysBetween(task.startDate, task.endDate)}</span> 天
        </div>
        <div>
          进度 <span className="num text-primary">{task.progress}%</span>
        </div>
        <div>
          状态 <span className="text-primary">{statusLabel}</span>
        </div>
        <div>
          负责人 <span className="text-primary">{task.ownerName ?? "未指派"}</span>
        </div>
        {task.dependsOnTaskNames.length > 0 && (
          <div>
            前置 <span className="text-primary">{task.dependsOnTaskNames.join("、")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 图体 ───────────────────────────────────────────────────────

function GanttBody({ data }: { data: ProjectScheduleData }) {
  const [zoom, setZoom] = useState<"week" | "day">("week");
  const [hovered, setHovered] = useState<number | null>(null);
  const [drawerIndex, setDrawerIndex] = useState<number | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    taskIndex: number;
    dayDelta: number;
  } | null>(null);
  const dragStartRef = useRef<{
    taskIndex: number;
    startX: number;
  } | null>(null);
  const dayW = zoom === "week" ? 12 : 28;
  const today = useMemo(() => new Date(data.todayIso), [data.todayIso]);

  const { svgWidth, svgHeight, dayIndex, todayX, scaleMarks } = useMemo(() => {
    const todayMs = today.getTime();
    const taskMinStart = data.tasks.reduce(
      (m, t) => Math.min(m, new Date(t.startDate).getTime()),
      Infinity
    );
    const taskMaxEnd = data.tasks.reduce(
      (m, t) => Math.max(m, new Date(t.endDate).getTime()),
      -Infinity
    );
    const chartMin = Math.min(taskMinStart, todayMs);
    const chartMax = Math.max(taskMaxEnd, todayMs);
    const totalDays = Math.floor((chartMax - chartMin) / MS_PER_DAY) + 1;

    const idx = (iso: string) =>
      Math.floor((new Date(iso).getTime() - chartMin) / MS_PER_DAY);

    const w = totalDays * dayW;
    const h = HEADER_H + data.tasks.length * ROW_H;

    const marks: { x: number; label: string }[] = [];
    for (let i = 0; i < totalDays; i += 7) {
      const dIso = new Date(chartMin + i * MS_PER_DAY).toISOString();
      marks.push({ x: i * dayW, label: fmtMD(dIso) });
    }

    return {
      svgWidth: w,
      svgHeight: h,
      dayIndex: idx,
      todayX: idx(data.todayIso) * dayW,
      scaleMarks: marks,
    };
  }, [data, dayW, today]);

  const rowIndexById = new Map(data.tasks.map((t, i) => [t.id, i]));

  // 「今天」小标布局：贴图右缘时向左翻转（防越界裁切）；并让相邻刻度标签避让。
  const TODAY_LABEL_W = 28;
  const todayLabelFlipped = todayX + 8 + TODAY_LABEL_W > svgWidth;
  const todayLabelLeft = todayLabelFlipped
    ? todayX - 8 - TODAY_LABEL_W
    : todayX + 8;

  // Esc 取消拖动
  useEffect(() => {
    if (!dragPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragStartRef.current = null;
        setDragPreview(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dragPreview]);

  // 拖拽指针处理器（仅计划条）
  const onBarPointerDown = (
    e: React.PointerEvent<SVGRectElement>,
    taskIndex: number
  ) => {
    if (e.button !== 0) return;
    dragStartRef.current = { taskIndex, startX: e.clientX };
    setDragPreview({ taskIndex, dayDelta: 0 });
    setDragError(null);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onBarPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.startX;
    const dayDelta = Math.round(dx / dayW);
    setDragPreview({ taskIndex: start.taskIndex, dayDelta });
  };

  const onBarPointerUp = async (
    e: React.PointerEvent<SVGRectElement>,
    taskIndex: number
  ) => {
    const start = dragStartRef.current;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    dragStartRef.current = null;
    setDragPreview(null);
    if (!start) return;
    const dx = e.clientX - start.startX;
    const moved = Math.abs(dx);
    const dayDelta = Math.round(dx / dayW);
    if (moved < 3) {
      setDrawerIndex(taskIndex);
    } else if (dayDelta !== 0) {
      const task = data.tasks[taskIndex];
      const formData = new FormData();
      formData.set("taskId", task.id);
      formData.set("projectId", data.project.id);
      formData.set("dayDelta", String(dayDelta));
      try {
        const result = await shiftTaskDatesAction({}, formData);
        if (result.error) setDragError(result.error);
      } catch {
        setDragError("调期失败，请稍后重试");
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* 工具区：缩放 + 图例 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-inner border border-line">
          <button
            type="button"
            onClick={() => setZoom("week")}
            className={`inline-flex h-8 items-center rounded-inner px-3 text-[13px] whitespace-nowrap transition-colors ${
              zoom === "week"
                ? "bg-accent text-white"
                : "text-secondary hover:bg-sunken hover:text-primary"
            }`}
          >
            周
          </button>
          <button
            type="button"
            onClick={() => setZoom("day")}
            className={`inline-flex h-8 items-center rounded-inner px-3 text-[13px] whitespace-nowrap transition-colors ${
              zoom === "day"
                ? "bg-accent text-white"
                : "text-secondary hover:bg-sunken hover:text-primary"
            }`}
          >
            日
          </button>
        </div>
        <Legend />
      </div>

      {/* 拖拽错误提示 */}
      {dragError && (
        <div className="flex items-center gap-3 rounded-inner border border-line bg-surface px-3 py-2">
          <span className="text-[13px] text-danger">{dragError}</span>
          <button
            type="button"
            onClick={() => setDragError(null)}
            className="ml-auto text-[12px] text-secondary whitespace-nowrap transition-colors hover:text-primary"
          >
            关闭
          </button>
        </div>
      )}

      {/* 图体：左固定列 + 右滚动时间轴 */}
      <div className="rounded-card border border-line bg-surface overflow-hidden">
        <div className="flex">
          {/* 左侧固定列：序号 + 工序名 + 逾期红点 + 进度小字 */}
          <div
            className="shrink-0 border-r border-line"
            style={{ width: LEFT_W }}
          >
            <div style={{ height: HEADER_H }} className="border-b border-line" />
            {data.tasks.map((t, i) => {
              const overdue = isTaskOverdue(
                { endDate: t.endDate, progress: t.progress },
                today
              );
              return (
                <div
                  key={t.id}
                  style={{ height: ROW_H, cursor: "pointer" }}
                  className="border-b border-line px-3 flex items-center gap-2 transition-colors hover:bg-canvas"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setDrawerIndex(i)}
                >
                  <span className="text-[13px] num text-secondary shrink-0">
                    {t.order}.
                  </span>
                  <span className="text-[13px] text-primary truncate">
                    {t.name}
                  </span>
                  {overdue && (
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 shrink-0 rounded-full bg-danger"
                    />
                  )}
                  <span className="ml-auto text-[12px] num text-secondary shrink-0">
                    {t.progress}%
                  </span>
                </div>
              );
            })}
            {/* 末行撑高占位，确保与右侧 svg 等高（svg 末行行底已有线） */}
          </div>

          {/* 右侧时间轴容器（relative 承载浮层；不随横向滚动漂移） */}
          <div className="relative flex-1">
            <div className="overflow-x-auto">
              <svg width={svgWidth} height={svgHeight} className="block">
                {/* 周刻度 + 竖网格线（每 7 天）；与「今天」小标重叠的刻度文字不画（网格线保留） */}
                {scaleMarks.map((m, i) => {
                  const labelLeft = m.x + 4;
                  const overlapsToday =
                    labelLeft + 30 > todayLabelLeft - 4 &&
                    labelLeft < todayLabelLeft + TODAY_LABEL_W + 4;
                  return (
                    <g key={i}>
                      <line
                        x1={m.x}
                        y1={0}
                        x2={m.x}
                        y2={svgHeight}
                        stroke="var(--border)"
                        strokeWidth={1}
                      />
                      {!overlapsToday && (
                        <text
                          x={m.x + 4}
                          y={20}
                          className="num"
                          fontSize={12}
                          fill="var(--text-secondary)"
                        >
                          {m.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* 日视图：每天极淡竖网格线 */}
                {zoom === "day" &&
                  Array.from({ length: Math.ceil(svgWidth / dayW) }, (_, i) => (
                    <line
                      key={i}
                      x1={i * dayW}
                      y1={HEADER_H}
                      x2={i * dayW}
                      y2={svgHeight}
                      stroke="var(--border)"
                      strokeWidth={1}
                      opacity={0.4}
                    />
                  ))}
                {/* 行底横线（与左列对齐） */}
                {data.tasks.map((_, i) => (
                  <line
                    key={i}
                    x1={0}
                    y1={HEADER_H + (i + 1) * ROW_H}
                    x2={svgWidth}
                    y2={HEADER_H + (i + 1) * ROW_H}
                    stroke="var(--border)"
                    strokeWidth={1}
                    opacity={0.6}
                  />
                ))}
                {/* 依赖连线（肘线：横→竖→横，置于条下层） */}
                {data.dependencies.map((d, k) => {
                  const fromIdx = rowIndexById.get(d.dependsOnId);
                  const toIdx = rowIndexById.get(d.taskId);
                  if (fromIdx == null || toIdx == null) return null;
                  const fromTask = data.tasks[fromIdx];
                  const toTask = data.tasks[toIdx];
                  const fromEndX = (dayIndex(fromTask.endDate) + 1) * dayW;
                  const fromY = HEADER_H + fromIdx * ROW_H + ROW_H / 2;
                  const toStartX = dayIndex(toTask.startDate) * dayW;
                  const toY = HEADER_H + toIdx * ROW_H + ROW_H / 2;
                  const midX = (fromEndX + toStartX) / 2;
                  const path = `M ${fromEndX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toStartX} ${toY}`;
                  return (
                    <path
                      key={k}
                      d={path}
                      fill="none"
                      stroke="var(--text-disabled)"
                      strokeWidth={1}
                    />
                  );
                })}
                {/* 双轨条：先画行命中区（透明，承空白点击 + 悬停），后画条（条在上层接收指针事件） */}
                {data.tasks.map((t, i) => {
                  const startDay = dayIndex(t.startDate);
                  const endDay = dayIndex(t.endDate);
                  const isDragging =
                    dragPreview?.taskIndex === i && dragPreview.dayDelta !== 0;
                  const dragOffset = isDragging
                    ? dragPreview!.dayDelta * dayW
                    : 0;
                  const x = startDay * dayW + dragOffset;
                  const w = (endDay - startDay + 1) * dayW;
                  const rowTop = HEADER_H + i * ROW_H;
                  const planY = rowTop + 4;
                  const progY = planY + PLAN_BAR_H + 2;
                  const progW = (w * t.progress) / 100;
                  const overdue = isTaskOverdue(
                    { endDate: t.endDate, progress: t.progress },
                    today
                  );
                  const progColor =
                    t.status === "completed"
                      ? "var(--success)"
                      : t.status === "in_progress"
                        ? overdue
                          ? "var(--danger)"
                          : "var(--accent)"
                        : overdue
                          ? "var(--danger)"
                          : null;
                  return (
                    <g key={t.id}>
                      {/* 行命中区（透明，先画于条下层）：空白区悬停 + 点击开抽屉 */}
                      <rect
                        x={0}
                        y={rowTop}
                        width={svgWidth}
                        height={ROW_H}
                        fill="transparent"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setDrawerIndex(i)}
                      />
                      {/* 计划条：底 surface-sunken + 1px 描边；可拖拽调期 */}
                      <rect
                        x={x}
                        y={planY}
                        width={Math.max(w, 0)}
                        height={PLAN_BAR_H}
                        fill="var(--surface-sunken)"
                        stroke="var(--border)"
                        strokeWidth={1}
                        style={{
                          cursor:
                            dragPreview?.taskIndex === i
                              ? "grabbing"
                              : "grab",
                          touchAction: "none",
                        }}
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(null)}
                        onPointerDown={(e) => onBarPointerDown(e, i)}
                        onPointerMove={onBarPointerMove}
                        onPointerUp={(e) => onBarPointerUp(e, i)}
                      />
                      {/* 进度条：长度 = progress% × 计划条长；pending 不渲染；点击开抽屉 */}
                      {progColor && progW > 0 && (
                        <rect
                          x={x}
                          y={progY}
                          width={progW}
                          height={PROGRESS_BAR_H}
                          fill={progColor}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={() => setHovered(i)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setDrawerIndex(i)}
                        />
                      )}
                      {/* 拖拽预览标签「±N 天」 */}
                      {isDragging && (
                        <text
                          x={x + w + 8}
                          y={planY + PLAN_BAR_H}
                          fontSize={12}
                          fill="var(--accent-ink)"
                          className="font-medium"
                        >
                          {dragPreview!.dayDelta > 0
                            ? `+${dragPreview!.dayDelta} 天`
                            : `${dragPreview!.dayDelta} 天`}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* 今日竖线（全页唯一强 accent）+ 「今天」小标（贴右缘时向左翻转，防越界裁切） */}
                <line
                  x1={todayX}
                  y1={0}
                  x2={todayX}
                  y2={svgHeight}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                />
                <rect
                  x={todayLabelLeft - 3}
                  y={2}
                  width={TODAY_LABEL_W + 6}
                  height={16}
                  fill="var(--surface)"
                />
                <text
                  x={todayLabelFlipped ? todayX - 8 : todayX + 8}
                  y={14}
                  fontSize={12}
                  fill="var(--accent-ink)"
                  className="font-medium"
                  textAnchor={todayLabelFlipped ? "end" : "start"}
                >
                  今天
                </text>
              </svg>
            </div>
            {/* 悬停浮层（贴当前行；超出图底翻到上方；不随横向滚动漂移） */}
            {hovered != null && (
              <HoverCard
                task={data.tasks[hovered]}
                top={HEADER_H + hovered * ROW_H}
                svgHeight={svgHeight}
              />
            )}
          </div>
        </div>
      </div>

      {/* 任务抽屉 */}
      <TaskDrawer
        task={drawerIndex != null ? data.tasks[drawerIndex] : null}
        projectId={data.project.id}
        users={data.users}
        open={drawerIndex !== null}
        onClose={() => setDrawerIndex(null)}
      />
    </div>
  );
}

// ── 入口 ───────────────────────────────────────────────────────

export function GanttChart({ data }: { data: ProjectScheduleData }) {
  if (data.tasks.length === 0) {
    if (data.canGenerate) return <GeneratePreview data={data} />;
    return <CannotGenerate data={data} />;
  }
  return <GanttBody data={data} />;
}
