"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea } from "@/core/ui";
import { formatCny, formatSignedCny } from "@/core/domain/pricing";
import {
  CHANGE_KIND_LABEL,
  CHANGE_KIND_ORDER,
} from "@/modules/budget/changes";
import type { ChangeOrderRow } from "@/modules/budget/server/changes";
import {
  createChangeAction,
  deleteChangeAction,
  updateChangeAction,
  type ChangeFormState,
} from "@/app/budget/actions";
import { changeStatusFormAction } from "@/app/budget/actions";
import { revokeChangeFormAction } from "@/app/budget/actions";

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

/** 今日 yyyy-MM-dd（新建默认值）。 */
function todayIso(): string {
  return toDateInput(new Date());
}

export interface ChangesBoardProps {
  projectId: string;
  rows: ChangeOrderRow[];
  contractAmount: number;
  changeTotal: number;
  changeWarn: boolean;
}

/**
 * 变更单看板（M9-a，client）。
 * - 列表：日期 / 类型 label / 描述 / 金额（带符号、num 右对齐）/ 原因截断 / 操作。
 * - 新建/编辑用 Modal（描述* / 类型 select* / 金额* 数字可负 + hint / 日期* 默认今天 / 原因说明）。
 * - 删除=行内两步确认（首点变「确认删除」danger 描边，再点执行；2 秒复位）。
 * - 空态「暂无变更单」+ 引导。
 *
 * 口径：金额展示只用 formatSignedCny；累计变更/预警判定只用服务端传入的 changeTotal/changeWarn
 * （page.tsx 已调 ledger.changeTotal/changeWatch），客户端不再各写算式。
 */
export function ChangesBoard({
  projectId,
  rows,
  contractAmount,
  changeTotal,
  changeWarn,
}: ChangesBoardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChangeOrderRow | null>(null);
  const router = useRouter();

  // 打开新建 Modal
  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  // 打开编辑 Modal
  function openEdit(row: ChangeOrderRow) {
    setEditing(row);
    setModalOpen(true);
  }
  // 关闭 Modal（成功或取消）
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      {/* 顶部操作条 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold">变更单</h2>
          <span className="text-xs text-secondary">{rows.length} 条</span>
        </div>
        <Button onClick={openNew}>+ 新建变更</Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-secondary">暂无变更单</p>
          <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
            施工过程中发生的增项、减项、材料升级或工艺变更，可在此录入；累计变更额超合同额 5% 时会在此页顶部提示。
          </p>
        </div>
      ) : (
        <div className="rounded-card border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <ChangeRow
                key={row.id}
                projectId={projectId}
                row={row}
                onEdit={() => openEdit(row)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* 合同额/累计变更小计脚注（与 page 顶部汇总卡呼应，便于滚动后查看） */}
      {rows.length > 0 && (
        <p className="text-xs text-secondary">
          合同额 {formatCny(contractAmount)} · 累计变更{" "}
          <span
            className={
              changeWarn
                ? "num font-medium text-warning"
                : "num font-medium text-primary"
            }
          >
            {formatSignedCny(changeTotal)}
          </span>
          {changeWarn && (
            <span className="ml-2 text-warning">已超合同额 5%</span>
          )}
        </p>
      )}

      {modalOpen && (
        <ChangeModal
          projectId={projectId}
          change={editing}
          onClose={closeModal}
          onDone={() => {
            closeModal();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** 一行变更单：日期 / 类型 / 描述 / 金额 / 原因 / 编辑+删除。 */
function ChangeRow({
  projectId,
  row,
  onEdit,
}: {
  projectId: string;
  row: ChangeOrderRow;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // 两步删除：首点进入确认态，2 秒后自动复位（spec §3-6：失焦/超时皆可）
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="num w-24 shrink-0 text-[13px] text-secondary whitespace-nowrap">
        {formatDate(row.date)}
      </span>
      <span className="w-20 shrink-0 text-[13px] text-primary whitespace-nowrap">
        {row.kindLabel}
      </span>
      <span className="w-20 shrink-0 text-[12px] text-secondary whitespace-nowrap">{row.status === "client_confirmed" ? "客户已确认" : row.status === "pending" ? "待客户确认" : row.status === "rejected" ? "已驳回" : "草稿"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-primary">{row.title}</p>
        {row.note && (
          <p className="mt-1 truncate text-[12px] text-secondary">{row.note}</p>
        )}
      </div>
      <span className="num w-28 shrink-0 text-right text-[15px] font-medium text-primary whitespace-nowrap">
        {formatSignedCny(row.amount)}
      </span>
      {row.attachments.length > 0 && <ul className="w-full text-[12px] text-secondary">{row.attachments.map((a) => <li key={a.id}><a href={`/${a.storageKey}`} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">附件：{a.originalName}</a></li>)}</ul>}
      <div className="flex shrink-0 items-center gap-2">
        {row.status === "draft" || row.status === "rejected" ? <form action={changeStatusFormAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="changeId" value={row.id} /><input type="hidden" name="status" value="pending" /><Button size="sm" variant="ghost" type="submit">提交确认</Button></form> : null}
        {row.status === "pending" ? <><form action={changeStatusFormAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="changeId" value={row.id} /><input type="hidden" name="status" value="client_confirmed" /><Button size="sm" type="submit">客户确认</Button></form><form action={changeStatusFormAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="changeId" value={row.id} /><input type="hidden" name="status" value="rejected" /><Button size="sm" variant="danger" type="submit">驳回</Button></form></> : null}
        {row.status === "client_confirmed" ? (
          <>
            {/* 已确认行不能直接编辑或删除（金额不得被无痕改写）；纠错走「撤销确认」：
                退回待确认 → 即时从经营口径摘出 → 改 → 再确认。留流水可追溯（§4.6）。 */}
            <span className="text-[12px] text-muted whitespace-nowrap">金额已计入</span>
            <form action={revokeChangeFormAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="changeId" value={row.id} />
              <Button size="sm" variant="ghost" type="submit">撤销确认</Button>
            </form>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              编辑
            </Button>
            <DeleteInlineButton
              projectId={projectId}
              changeId={row.id}
              confirming={confirming}
              onRequestConfirm={() => setConfirming(true)}
              onReset={() => setConfirming(false)}
            />
          </>
        )}
      </div>
    </li>
  );
}

/** 行内两步删除：首点「删除」→ 变「确认删除」danger 描边；再点执行；2 秒复位。 */
function DeleteInlineButton({
  projectId,
  changeId,
  confirming,
  onRequestConfirm,
  onReset,
}: {
  projectId: string;
  changeId: string;
  confirming: boolean;
  onRequestConfirm: () => void;
  onReset: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<ChangeFormState, FormData>(
    deleteChangeAction.bind(null, projectId, changeId),
    {}
  );

  useEffect(() => {
    if (state.ok) {
      onReset();
      router.refresh();
    }
  }, [state, onReset, router]);

  if (state.ok) {
    return <span className="text-[13px] text-success">已删除，刷新中…</span>;
  }

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="danger"
        type="button"
        onClick={onRequestConfirm}
      >
        删除
      </Button>
    );
  }

  // 确认态：提交按钮，danger 描边（Button variant=danger 默认即描边）
  return (
    <form action={formAction}>
      <DeleteConfirmButton />
      {state.error && (
        <p className="mt-1 text-[12px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

function DeleteConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "删除中…" : "确认删除"}
    </Button>
  );
}

// ── 新建/编辑 Modal ─────────────────────────────────────────────

function ChangeModal({
  projectId,
  change,
  onClose,
  onDone,
}: {
  projectId: string;
  change: ChangeOrderRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isEdit = change !== null;
  const router = useRouter();

  // 绑定 action（edit 多 bind 一个 changeId）
  const action = isEdit
    ? updateChangeAction.bind(null, projectId, change!.id)
    : createChangeAction.bind(null, projectId);

  const [state, formAction] = useFormState<ChangeFormState, FormData>(
    action,
    {}
  );

  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state, onDone, router]);

  // 类型联动：默认 add（增项），编辑态取当前 kind
  const [kind, setKind] = useState<string>(change?.kind ?? "add");

  if (state.ok) {
    return (
      <Modal open onClose={onClose} title={isEdit ? "编辑变更单" : "新建变更单"}>
        <p className="text-[13px] text-success">
          {isEdit ? "已更新" : "已创建"}，页面正在刷新…
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "编辑变更单" : "新建变更单"}
    >
      <form action={formAction} className="space-y-4" encType="multipart/form-data">
        <Field label="变更描述" required>
          <Input
            name="title"
            required
            maxLength={120}
            defaultValue={change?.title ?? ""}
            placeholder="如：主卧衣柜升级为定制柜体"
          />
        </Field>

        <div className="flex items-start gap-4">
          <Field label="变更类型" required>
            <div className="w-[12rem]">
              <Select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {CHANGE_KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {CHANGE_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <Field
            label="金额"
            required
            hint="正数=增加，负数=减少（减项须为负）"
          >
            <div className="w-[12rem]">
              <Input
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={
                  change ? String(change.amount) : ""
                }
                placeholder="如 3200 或 -1500"
                className="num"
              />
            </div>
          </Field>
        </div>

        <Field label="变更日期" required>
          <div className="w-[12rem]">
            <Input
              name="date"
              type="date"
              required
              defaultValue={
                change ? toDateInput(change.date) : todayIso()
              }
            />
          </div>
        </Field>

        <Field label="原因说明" hint="选填">
          <Textarea
            name="note"
            rows={2}
            defaultValue={change?.note ?? ""}
            placeholder="如：业主升级为全屋定制柜体，含五金与安装"
          />
        </Field>
        <Field label="附件" hint="最多 5 个文件，单个不超过 20 MB">
          <Input name="attachments" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.zip" />
        </Field>

        {state.error && (
          <p className="text-[13px] text-danger">{state.error}</p>
        )}

        <div className="flex items-center gap-4">
          <ChangeSubmitButton isEdit={isEdit} />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
          >
            取消
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangeSubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "提交中…"
        : isEdit
          ? "保存修改"
          : "确认新建"}
    </Button>
  );
}
