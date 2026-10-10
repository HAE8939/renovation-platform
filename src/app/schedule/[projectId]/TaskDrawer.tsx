"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Badge, Button, Drawer, Field, Input, Select } from "@/core/ui";
import {
  SCHEDULE_TASK_STATUS_LABEL,
  statusBadgeTone,
} from "@/modules/schedule/status";
import type { ScheduleTaskStatus } from "@/modules/schedule/types";
import type {
  ProjectScheduleData,
  ScheduleTaskRow,
} from "@/modules/schedule/server/tasks";
import {
  updateTaskInfoAction,
  updateTaskProgressAction,
  type ScheduleActionState,
} from "@/modules/schedule/actions";

/**
 * 任务抽屉（M6-c）：基本信息编辑（日期 + 负责人）+ 进度更新 + 前置只读。
 * 复用 core/ui/Drawer；两表单各自独立 useFormState，成功即关闭抽屉。
 * 日期约定：入参出参全 ISO 字符串；<input type="date"> 值取 ISO 的 UTC 日期段
 * YYYY-MM-DD，提交时拼 T00:00:00.000Z。
 */

/** ISO → <input type="date"> 值（取 UTC 日期段）。 */
function isoToDateValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

/** <input type="date"> 值 → 提交用 ISO（拼 T00:00:00.000Z，UTC 0 点归一）。 */
function dateValueToIso(dateValue: string): string {
  if (!dateValue) return "";
  return `${dateValue}T00:00:00.000Z`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">{label}</span>
      <span className="text-right text-[13px] text-primary break-words">
        {value ?? "—"}
      </span>
    </div>
  );
}

function SaveInfoButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "保存中…" : "保存基本信息"}
    </Button>
  );
}

function SaveProgressButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="sm">
      {pending ? "更新中…" : "更新进度"}
    </Button>
  );
}

function TaskDrawerInner({
  task,
  projectId,
  users,
  onClose,
}: {
  task: ScheduleTaskRow;
  projectId: string;
  users: ProjectScheduleData["users"];
  onClose: () => void;
}) {
  const statusLabel =
    SCHEDULE_TASK_STATUS_LABEL[task.status as ScheduleTaskStatus] ??
    task.status;
  const tone = statusBadgeTone(task.status);

  // 日期受控值（YYYY-MM-DD），提交时拼 T00:00:00.000Z 走隐藏字段
  const [startDateValue, setStartDateValue] = useState(() =>
    isoToDateValue(task.startDate)
  );
  const [endDateValue, setEndDateValue] = useState(() =>
    isoToDateValue(task.endDate)
  );

  // ── 基本信息表单 ──
  const [infoState, infoAction] = useFormState<ScheduleActionState, FormData>(
    updateTaskInfoAction,
    {}
  );
  useEffect(() => {
    if (infoState.ok) onClose();
  }, [infoState.ok, onClose]);

  // ── 进度表单 ──
  const [progState, progAction] = useFormState<ScheduleActionState, FormData>(
    updateTaskProgressAction,
    {}
  );
  useEffect(() => {
    if (progState.ok) onClose();
  }, [progState.ok, onClose]);

  return (
    <div className="space-y-6">
      {/* 头部：序号. 工序名 + 状态徽章 */}
      <div className="flex items-center gap-2">
        <h4 className="text-[15px] font-semibold text-primary">
          {task.order}. {task.name}
        </h4>
        <Badge variant={tone}>{statusLabel}</Badge>
      </div>

      {/* 基本信息表单 */}
      <section className="border-t border-line pt-4">
        <h5 className="text-[13px] font-medium text-secondary">基本信息</h5>
        <form action={infoAction} className="mt-3 space-y-4">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <input
            type="hidden"
            name="startDateIso"
            value={dateValueToIso(startDateValue)}
          />
          <input
            type="hidden"
            name="endDateIso"
            value={dateValueToIso(endDateValue)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="计划开始" required>
              <Input
                type="date"
                value={startDateValue}
                onChange={(e) => setStartDateValue(e.target.value)}
                required
              />
            </Field>
            <Field label="计划结束" required>
              <Input
                type="date"
                value={endDateValue}
                onChange={(e) => setEndDateValue(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="负责人" hint="未指派则留空">
            <Select name="ownerId" defaultValue={task.ownerId ?? ""}>
              <option value="">未指派</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}（{u.roleLabel}）
                </option>
              ))}
            </Select>
          </Field>
          {infoState.error && (
            <p className="text-[13px] text-danger">{infoState.error}</p>
          )}
          <SaveInfoButton />
        </form>
      </section>

      {/* 进度表单 */}
      <section className="border-t border-line pt-4">
        <h5 className="text-[13px] font-medium text-secondary">进度</h5>
        <form action={progAction} className="mt-3 space-y-3">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="进度（0–100）" required>
            <Input
              name="progress"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={task.progress}
              required
            />
          </Field>
          <p className="text-[12px] leading-relaxed text-muted">
            联动规则：0 = 重置为未开始（清实际起止）/ 1–99 = 进行中 / 100 = 已完成
          </p>
          {progState.error && (
            <p className="text-[13px] text-danger">{progState.error}</p>
          )}
          <SaveProgressButton />
        </form>
      </section>

      {/* 只读区 */}
      <section className="border-t border-line pt-4">
        <h5 className="text-[13px] font-medium text-secondary">实际记录</h5>
        <div className="mt-2 divide-y divide-line">
          <InfoRow label="实际开始" value={fmtDate(task.actualStart)} />
          <InfoRow label="实际完成" value={fmtDate(task.actualEnd)} />
          <InfoRow
            label="前置任务"
            value={
              task.dependsOnTaskNames.length > 0
                ? task.dependsOnTaskNames.join("、")
                : "无"
            }
          />
        </div>
      </section>
    </div>
  );
}

/**
 * 任务抽屉：task 为 null 时不渲染；open 控制可见性。
 * key={task.id} 保证切换任务时表单状态重置（useFormState 不跨任务串态）。
 */
export function TaskDrawer({
  task,
  projectId,
  users,
  open,
  onClose,
}: {
  task: ScheduleTaskRow | null;
  projectId: string;
  users: ProjectScheduleData["users"];
  open: boolean;
  onClose: () => void;
}) {
  if (!task) return null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`工序 · ${task.name}`}
    >
      <TaskDrawerInner
        key={task.id}
        task={task}
        projectId={projectId}
        users={users}
        onClose={onClose}
      />
    </Drawer>
  );
}
