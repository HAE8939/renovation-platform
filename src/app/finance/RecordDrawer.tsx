"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge, Button, Drawer, Field, Input, Select, Textarea } from "@/core/ui";
import { formatCny } from "@/core/domain/pricing";
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  RECORD_TYPE_LABEL,
  recordTypeTone,
} from "@/modules/finance/status";
import { categoriesFor } from "@/modules/finance/types";
import type { FinanceRecordRow } from "@/modules/finance/server/records";
import {
  deleteRecordAction,
  updateRecordAction,
  type FinanceFormState,
} from "@/app/finance/actions";

/** 仅日期（展示用）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** yyyy-MM-dd（date input defaultValue 用）。 */
function toDateInput(d: Date): string {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 基础信息单行：标签 + 值。 */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">{label}</span>
      <span className="text-right text-[15px] text-primary break-words">
        {value ?? "—"}
      </span>
    </div>
  );
}

/** 区块标题。 */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
      {children}
    </h4>
  );
}

// ── 编辑表单 ──────────────────────────────────────────────────

function EditForm({
  record,
  onDone,
}: {
  record: FinanceRecordRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<FinanceFormState, FormData>(
    updateRecordAction,
    {}
  );

  // 类型↔科目联动（与 Modal 同款）：切换类型时重置科目为该侧第一项
  const [type, setType] = useState<"income" | "expense">(
    record.type as "income" | "expense"
  );
  const categoryOptions = categoriesFor(type);
  const initialCategory = categoryOptions.includes(
    record.category as (typeof categoryOptions)[number]
  )
    ? record.category
    : (categoryOptions[0] as string);
  const [category, setCategory] = useState<string>(initialCategory);

  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state.ok, onDone, router]);

  if (state.ok) {
    return (
      <p className="text-[13px] text-success">已更新，页面正在刷新…</p>
    );
  }

  const onTypeChange = (next: "income" | "expense") => {
    setType(next);
    const first = categoriesFor(next)[0];
    if (first) setCategory(first as string);
  };

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={record.id} />

      {/* 归属项目不可改（集成者裁断 M8-b）：记录是已入账的现金事实，
          updateRecord 不写 projectId；如需更正归属，删除后在目标项目下重建。 */}
      <p className="text-[13px] leading-relaxed text-secondary">
        归属项目：<span className="text-primary">{record.projectName}</span>
        （不可改；如需更正请删除后重建）
      </p>

      <div className="flex items-start gap-4">
        <Field label="收支类型" required>
          <div className="w-[10rem]">
            <Select
              name="type"
              value={type}
              onChange={(e) =>
                onTypeChange(e.target.value as "income" | "expense")
              }
            >
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </Select>
          </div>
        </Field>
        <Field label="科目" required>
          <div className="w-[12rem]">
            <Select
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </div>

      <div className="flex items-start gap-4">
        <Field label="金额" required hint="恒为正数，方向由收支类型决定">
          <div className="w-[12rem]">
            <Input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={String(record.amount)}
            />
          </div>
        </Field>
        <Field label="发生日期" required>
          <div className="w-[12rem]">
            <Input
              name="date"
              type="date"
              required
              defaultValue={toDateInput(record.date)}
            />
          </div>
        </Field>
      </div>

      <Field label="摘要" hint="选填">
        <Textarea
          name="description"
          rows={2}
          defaultValue={record.description}
          placeholder="如：泥工班组第二期人工"
        />
      </Field>

      {state.error && (
        <p className="text-[13px] text-danger">{state.error}</p>
      )}

      <EditSubmitButton />
    </form>
  );
}

function EditSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "保存修改"}
    </Button>
  );
}

// ── 删除表单（两步确认）──────────────────────────────────────────

function DeleteForm({
  recordId,
  onDone,
}: {
  recordId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirm">("idle");
  const [state, formAction] = useFormState<FinanceFormState, FormData>(
    deleteRecordAction,
    {}
  );

  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state.ok, onDone, router]);

  if (state.ok) {
    return (
      <p className="text-[13px] text-success">已删除，页面正在刷新…</p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={recordId} />

      {mode === "idle" ? (
        // 删除按钮：danger 描边、不铺红底（Button variant=danger 默认即描边：
        // bg-surface + border-danger + text-danger，hover 才铺红底）
        <Button
          variant="danger"
          size="sm"
          onClick={() => setMode("confirm")}
        >
          删除此记录
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-primary">
            确认删除？此操作不可撤销。
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <DeleteConfirmButton />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setMode("idle")}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {state.error && (
        <p className="text-[13px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

function DeleteConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "删除中…" : "确认删除"}
    </Button>
  );
}

// ── 主抽屉 ─────────────────────────────────────────────────────

/**
 * 收支记录抽屉（M8-b，复用 core/ui/Drawer）。
 *
 * 展示区（只读信息行：类型徽章 recordTypeTone、科目徽章 CATEGORY_TONE、项目、
 * 金额右对齐 num、日期、摘要、录入人）→ 编辑区（与 Modal 同款字段、defaultValue
 * 填当前值、同样“类型↔科目联动”，提交 updateRecordAction）→ 删除区（两步确认：
 * 先“删除此记录”danger 描边不铺红底；点开后显“确认删除？此操作不可撤销”+
 * 红色“确认删除”提交 deleteRecordAction）。
 * 编辑/删除成功都 onClose() + router.refresh()（汇总即时重算＝派生收益）。
 */
export function RecordDrawer({
  record,
  open,
  onClose,
}: {
  record: FinanceRecordRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!record) return null;

  const typeLabel =
    RECORD_TYPE_LABEL[record.type as keyof typeof RECORD_TYPE_LABEL] ??
    record.type;
  const categoryLabel =
    CATEGORY_LABEL[record.category as keyof typeof CATEGORY_LABEL] ??
    record.category;

  return (
    <Drawer open={open} onClose={onClose} title="记录详情">
      <div className="space-y-6">
        {/* 类型 / 科目徽章 */}
        <div className="flex items-center gap-2">
          <Badge variant={recordTypeTone(record.type)}>{typeLabel}</Badge>
          <Badge variant={CATEGORY_TONE[record.category as keyof typeof CATEGORY_TONE] ?? "neutral"}>
            {categoryLabel}
          </Badge>
        </div>

        {/* 基础信息 */}
        <section>
          <SectionTitle>基础信息</SectionTitle>
          <div className="mt-2 divide-y divide-line">
            <InfoRow label="项目" value={record.projectName} />
            <InfoRow
              label="金额"
              value={
                <span className="num whitespace-nowrap font-medium">
                  {formatCny(record.amount)}
                </span>
              }
            />
            <InfoRow label="发生日期" value={formatDate(record.date)} />
            <InfoRow label="摘要" value={record.description || "—"} />
            <InfoRow label="录入人" value={record.recordedByName} />
          </div>
        </section>

        {/* 编辑区 */}
        <section className="border-t border-line pt-4">
          <SectionTitle>编辑</SectionTitle>
          <div className="mt-3">
            <EditForm record={record} onDone={onClose} />
          </div>
        </section>

        {/* 删除区 */}
        <section className="border-t border-line pt-4">
          <SectionTitle>删除</SectionTitle>
          <div className="mt-3">
            <DeleteForm recordId={record.id} onDone={onClose} />
          </div>
        </section>
      </div>
    </Drawer>
  );
}
