"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  Table,
  Td,
  Textarea,
  Th,
} from "@/core/ui";
import {
  computeTotals,
  formatCny,
  formatPercent,
  formatQty,
  groupByCategory,
  lineTotal,
} from "@/modules/budget/lib/quote";
import type { QuoteItemRow } from "@/modules/budget/types";
import type {
  CatalogPickerCategory,
  CatalogSnapshot,
} from "@/modules/budget/server/catalog";
import {
  saveQuoteItemsAction,
  setQuoteStatusAction,
  updateQuoteTaxRateAction,
} from "../actions";
import { CatalogPicker } from "./CatalogPicker";

/** 服务端序列化后的报价数据（含展示用的中文标签）。 */
export interface QuoteBoardData {
  project: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    area: number;
    statusLabel: string;
    designer: string | null;
    pm: string | null;
    clientName: string;
    clientPhone: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  taxRate: number;
  quoteStatus: string;
  quoteStatusLabel: string;
  quoteLockedAt: string | null;
  items: QuoteItemRow[];
  picker: CatalogPickerCategory[];
}

/**
 * 本地草稿行。
 * 单价 / 数量存输入原文（字符串），只在算钱与提交前转数字 ——
 * 这样用户在框里打 "1." 、"0." 不会被受控值截断。
 * id 仅作 React key：保存后由数据库重新分配，整表替换时旧 id 一并丢弃。
 */
interface DraftRow {
  id: string;
  categoryName: string;
  code: string;
  name: string;
  unit: string;
  unitPrice: string;
  quantity: string;
  materials: string;
  sop: string;
}

/** 数据库行 → 本地草稿。 */
function toDraft(row: QuoteItemRow): DraftRow {
  return {
    id: row.id,
    categoryName: row.categoryName,
    code: row.code,
    name: row.name,
    unit: row.unit,
    unitPrice: String(row.unitPrice),
    quantity: String(row.quantity),
    materials: row.materials,
    sop: row.sop,
  };
}

/** 输入原文 → 参与算钱的数字：空 / 非数字 / 负数一律按 0 处理，负数留给服务端报错。 */
function toNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 草稿行 → 计算口径需要的行（金额仍走 lib/quote.ts，这里只补齐数字与 order）。 */
function toItems(drafts: DraftRow[]): QuoteItemRow[] {
  return drafts.map((row, i) => ({
    id: row.id,
    categoryName: row.categoryName,
    code: row.code,
    name: row.name,
    unit: row.unit.trim() || "项",
    unitPrice: toNumber(row.unitPrice),
    quantity: toNumber(row.quantity),
    materials: row.materials,
    sop: row.sop,
    order: i + 1,
  }));
}

/** 内容指纹：比内容不比 id / order，用来判断有没有未保存改动。 */
function fingerprint(rows: QuoteItemRow[]): string {
  return JSON.stringify(
    rows.map((r) => [
      r.categoryName,
      r.code,
      r.name,
      r.unit,
      r.unitPrice,
      r.quantity,
      r.materials,
      r.sop,
    ])
  );
}

/**
 * 报价明细编辑器 + 实时预算看板。
 *
 * 数据流：科目库选入 / 新增空行 / 行内编辑 / 删除 / 上下排序都只改本地草稿 →
 * 草稿派生成 QuoteItemRow[] → lib/quote.ts 算分组与汇总 → 点“保存”整表提交 →
 * 用数据库返回的行整体替换本地草稿（id 与 order 重分配）。
 */
export function QuoteBoard({ data }: { data: QuoteBoardData }) {
  const { project, quoteStatus, quoteStatusLabel, quoteLockedAt, picker } = data;
  // draft 才可编辑明细与税率；confirmed/locked 只读（服务层同样硬门控，界面只是不显示入口）。
  const editable = quoteStatus === "draft";

  const router = useRouter();
  const draftSeq = useRef(0);
  const [drafts, setDrafts] = useState<DraftRow[]>(() => data.items.map(toDraft));
  const [baseline, setBaseline] = useState<QuoteItemRow[]>(data.items);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // 税率本地值：以服务端为真源初始化，编辑期本地实时参与汇总；“保存税率”落库后 refresh 回读。
  const [tax, setTax] = useState<string>(() => String(data.taxRate));
  const [statusBusy, startStatus] = useTransition();

  const items = useMemo(() => toItems(drafts), [drafts]);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const taxNum = useMemo(() => {
    const n = Number(tax);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : data.taxRate;
  }, [tax, data.taxRate]);
  const totals = useMemo(
    () => computeTotals(items, taxNum, project.area),
    [items, taxNum, project.area]
  );
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    drafts.forEach((row, i) => map.set(row.id, i));
    return map;
  }, [drafts]);

  const dirty = fingerprint(items) !== fingerprint(baseline);

  /* ── 本地草稿操作（都不落库） ─────────────────────────────── */

  function nextId(): string {
    draftSeq.current += 1;
    return `draft-${draftSeq.current}`;
  }

  function patch(id: string, changes: Partial<Omit<DraftRow, "id">>) {
    setNotice(null);
    setDrafts((prev) => prev.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  /** 从科目库选入：按模板当前值整行复制成快照。 */
  function pick(categoryName: string, item: CatalogSnapshot) {
    setNotice(null);
    setDrafts((prev) => [
      ...prev,
      {
        id: nextId(),
        categoryName,
        code: item.code,
        name: item.name,
        unit: item.unit,
        unitPrice: String(item.unitPrice),
        quantity: String(item.quantity),
        materials: item.materials,
        sop: item.sop,
      },
    ]);
  }

  function addBlankRow() {
    setNotice(null);
    setDrafts((prev) => [
      ...prev,
      {
        id: nextId(),
        categoryName: "未分类",
        code: "",
        name: "",
        unit: "项",
        unitPrice: "0",
        quantity: "1",
        materials: "",
        sop: "",
      },
    ]);
  }

  function moveRow(id: string, dir: -1 | 1) {
    setNotice(null);
    setDrafts((prev) => {
      const from = prev.findIndex((row) => row.id === id);
      const to = from + dir;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function deleteRow(id: string) {
    setNotice(null);
    setDrafts((prev) => prev.filter((row) => row.id !== id));
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleDetail(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /* ── 保存：整表替换，返回行整体替换本地草稿 ────────────────── */

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveQuoteItemsAction(
        project.id,
        drafts.map((row) => ({
          id: row.id,
          categoryName: row.categoryName,
          code: row.code,
          name: row.name,
          unit: row.unit,
          unitPrice: toNumber(row.unitPrice),
          quantity: toNumber(row.quantity),
          materials: row.materials,
          sop: row.sop,
        }))
      );
      if (!result.ok || !result.items) {
        setError(result.error ?? "保存失败");
        return;
      }
      setDrafts(result.items.map(toDraft));
      setBaseline(result.items);
      setExpanded(new Set());
      setNotice(`已保存 ${result.items.length} 行`);
    });
  }

  const statusText = saving
    ? "保存中…"
    : error
      ? "上次保存失败，请查看错误后重试"
      : dirty
        ? "有未保存改动"
        : notice ?? "全部已保存";

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-4">
        <Link
          href="/budget"
          className="text-xs text-secondary underline-offset-4 hover:text-accent-ink hover:underline"
        >
          ← 返回项目列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold leading-tight">{project.name}</h1>
          <span className="num text-xs text-secondary">{project.code}</span>
          <Badge variant="outline">{project.statusLabel}</Badge>
          <Badge variant="outline">{quoteStatusLabel}</Badge>
        </div>
        {project.address && (
          <p className="mt-1 text-[13px] text-secondary">{project.address}</p>
        )}
      </header>

      {/* 实时预算看板：表格上方一条紧凑汇总条，整体右对齐，窄屏折行 */}
      <div className="grid grid-cols-2 items-end gap-x-6 gap-y-3 rounded-inner border border-line bg-surface px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <SummaryItem label="直接费" value={formatCny(totals.directSubtotal)} />
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-xs text-secondary whitespace-nowrap">
            税率{editable ? "（可编辑，小数如 0.03）" : `（${formatPercent(taxNum)}）`}
          </span>
          {editable ? (
            <span className="flex items-center gap-2">
              <span className="w-24">
                <Input
                  compact
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  aria-label="税率"
                  className="num w-24 text-right"
                />
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={statusBusy}
                onClick={() =>
                  startStatus(async () => {
                    setError(null);
                    const r = await updateQuoteTaxRateAction(project.id, taxNum);
                    if (!r.ok) setError(r.error ?? "税率保存失败");
                    else {
                      setNotice("税率已保存");
                      router.refresh();
                    }
                  })
                }
              >
                存税率
              </Button>
            </span>
          ) : (
            <dd className="num text-[15px]">{formatCny(totals.tax)}</dd>
          )}
        </div>
        <SummaryItem
          label="单方造价"
          value={
            totals.unitCost === null
              ? "面积缺失"
              : `${formatCny(totals.unitCost)} /㎡`
          }
        />
        <SummaryItem
          label="总价"
          value={formatCny(totals.grand)}
          accent
          className="col-span-2 border-t border-line pt-3 sm:col-span-1 sm:order-4 sm:border-t-0 sm:pt-0"
        />
      </div>

      {/* 报价状态控制区（M15 断点③：确认 / 退回 / 锁定的写入入口）*/}
      <QuoteStatusControls
        projectId={project.id}
        quoteStatus={quoteStatus}
        quoteStatusLabel={quoteStatusLabel}
        quoteLockedAt={quoteLockedAt}
        busy={statusBusy}
        onDone={() => router.refresh()}
        onError={setError}
      />

      {/* 明细编辑器：占满内容区宽度，不再与侧栏并排 */}
      <section className="min-w-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">报价明细</h2>
              <span className="text-xs text-secondary">
                {totals.categoryCount} 个科目 · {totals.itemCount} 条
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {editable && (
                <>
                  <Button
                    variant="secondary"
                    disabled={saving || picker.length === 0}
                    onClick={() => setPickerOpen((v) => !v)}
                    aria-expanded={pickerOpen}
                  >
                    {pickerOpen ? "收起选入面板" : "从科目库选入"}
                  </Button>
                  <Button variant="secondary" disabled={saving} onClick={addBlankRow}>
                    新增空行
                  </Button>
                </>
              )}
              {/* 项目级页面的入口只能放在这里 —— 全局导航是静态清单，拿不到 projectId。 */}
              <Link
                href={`/budget/${project.id}/settings`}
                className="text-xs text-accent-ink underline-offset-4 hover:underline"
              >
                项目设置
              </Link>
              <Link
                href={`/budget/${project.id}/stats`}
                className="text-xs text-accent-ink underline-offset-4 hover:underline"
              >
                科目分布
              </Link>
              <Link
                href={`/budget/${project.id}/changes`}
                className="text-xs text-accent-ink underline-offset-4 hover:underline"
              >
                变更单
              </Link>
              <Link
                href={`/budget/${project.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-ink underline-offset-4 hover:underline"
              >
                打印视图
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <span className="text-xs text-secondary">
              {editable ? statusText : "报价非草稿态，明细只读；如需修改请先退回草稿"}
            </span>
            {editable && (
              <Button disabled={saving || !dirty} onClick={save}>
                {saving ? "保存中…" : "保存"}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-inner border border-danger bg-surface px-3 py-2 text-[13px] text-danger"
          >
            {error}
          </p>
        )}

        {pickerOpen && picker.length > 0 && (
          <CatalogPicker catalog={picker} onPick={pick} />
        )}

        {items.length === 0 ? (
          <Card className="mt-3 py-6 text-center text-[13px] leading-relaxed text-secondary">
            该项目还没有报价明细。从科目库选入，或新增空行后填编号与项目名称。
          </Card>
        ) : (
          <Card padded={false} className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>顺序</Th>
                  <Th>编号 / 项目名称</Th>
                  <Th>单位</Th>
                  <Th align="right">单价</Th>
                  <Th align="right">数量</Th>
                  <Th align="right">小计</Th>
                  <Th align="right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <GroupRows
                    key={group.categoryName}
                    group={group}
                    drafts={drafts}
                    indexById={indexById}
                    expanded={expanded}
                    editable={editable}
                    onPatch={patch}
                    onMove={moveRow}
                    onDelete={deleteRow}
                    onToggle={toggleDetail}
                  />
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>

      {/* 项目信息：明细表下方紧凑定义列表，不抢表格横向空间 */}
      <section className="mt-8">
        <SectionTitle>项目信息</SectionTitle>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3">
          <Meta
            label="客户"
            value={`${project.clientName}${project.clientPhone ? ` · ${project.clientPhone}` : ""}`}
          />
          <Meta
            label="面积"
            value={project.area > 0 ? `${formatQty(project.area)} ㎡` : "未填"}
          />
          <Meta
            label="工期"
            value={
              project.startDate && project.endDate
                ? `${project.startDate} — ${project.endDate}`
                : "未排期"
            }
          />
          <Meta label="设计" value={project.designer ?? "—"} />
          <Meta label="项目经理" value={project.pm ?? "—"} />
        </dl>
      </section>
    </div>
  );
}

/** 一个科目分组：分组头（含组小计）+ 组内可编辑明细行。 */
function GroupRows({
  group,
  drafts,
  indexById,
  expanded,
  editable,
  onPatch,
  onMove,
  onDelete,
  onToggle,
}: {
  group: { categoryName: string; subtotal: number; items: QuoteItemRow[] };
  drafts: DraftRow[];
  indexById: Map<string, number>;
  expanded: Set<string>;
  editable: boolean;
  onPatch: (id: string, changes: Partial<Omit<DraftRow, "id">>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <tr>
        <Td
          colSpan={5}
          className="bg-sunken text-xs font-medium uppercase tracking-[0.08em] text-secondary"
        >
          {group.categoryName}
        </Td>
        <Td
          align="right"
          className="num bg-sunken text-xs font-medium text-secondary"
        >
          {formatCny(group.subtotal)}
        </Td>
        <Td className="bg-sunken" />
      </tr>
      {group.items.map((item) => {
        const index = indexById.get(item.id) ?? 0;
        const row = drafts[index];
        if (!row) return null;
        return (
          <EditableRow
            key={row.id}
            row={row}
            first={index === 0}
            last={index === drafts.length - 1}
            open={expanded.has(row.id)}
            editable={editable}
            onPatch={(changes) => onPatch(row.id, changes)}
            onMove={(dir) => onMove(row.id, dir)}
            onDelete={() => onDelete(row.id)}
            onToggle={() => onToggle(row.id)}
          />
        );
      })}
    </>
  );
}

/** 单条明细：编号 / 名称 / 单位 / 单价 / 数量 行内编辑，材料 / 施工要求展开编辑。 */
function EditableRow({
  row,
  first,
  last,
  open,
  editable,
  onPatch,
  onMove,
  onDelete,
  onToggle,
}: {
  row: DraftRow;
  first: boolean;
  last: boolean;
  open: boolean;
  editable: boolean;
  onPatch: (changes: Partial<Omit<DraftRow, "id">>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-canvas">
        <Td className="w-28">
          {editable ? (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={first}
                onClick={() => onMove(-1)}
                aria-label="上移一行"
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={last}
                onClick={() => onMove(1)}
                aria-label="下移一行"
              >
                ↓
              </Button>
            </span>
          ) : null}
        </Td>
        <Td className="min-w-[220px]">
          <div className="flex items-center gap-2">
            {/* Input 基类硬写 w-full，单实例传 w-24 会被它静默压掉（Tailwind 里 full 排在数字档之后）。
                所以定宽交给外层容器，Input 只负责填满容器 —— 别改 Input，那会波及全站。 */}
            <span className="w-24 shrink-0">
              <Input
                compact
                disabled={!editable}
                value={row.code}
                onChange={(e) => onPatch({ code: e.target.value })}
                placeholder="编号"
                aria-label="编号"
                className="num"
              />
            </span>
            <Input
              compact
              disabled={!editable}
              value={row.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              placeholder="项目名称"
              aria-label="项目名称"
              className="min-w-[100px] flex-1"
            />
          </div>
        </Td>
        <Td className="w-20">
          <Input
            compact
            disabled={!editable}
            value={row.unit}
            onChange={(e) => onPatch({ unit: e.target.value })}
            placeholder="项"
            aria-label="单位"
            className="w-20"
          />
        </Td>
        <Td align="right" className="w-28">
          <Input
            compact
            type="number"
            min="0"
            step="0.01"
            disabled={!editable}
            value={row.unitPrice}
            onChange={(e) => onPatch({ unitPrice: e.target.value })}
            aria-label="单价"
            className="num w-28 text-right"
          />
        </Td>
        <Td align="right" className="w-24">
          <Input
            compact
            type="number"
            min="0"
            step="0.01"
            disabled={!editable}
            value={row.quantity}
            onChange={(e) => onPatch({ quantity: e.target.value })}
            aria-label="数量"
            className="num w-24 text-right"
          />
        </Td>
        <Td align="right" className="num">
          {formatCny(lineTotal(toNumber(row.unitPrice), toNumber(row.quantity)))}
        </Td>
        <Td align="right" className="w-32">
          <span className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggle}
              aria-expanded={open}
            >
              {open ? "收起" : "材料"}
            </Button>
            {editable && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                删除
              </Button>
            )}
          </span>
        </Td>
      </tr>
      {open && (
        <tr>
          <Td colSpan={7} className="bg-sunken">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="材料说明">
                <Textarea
                  rows={2}
                  disabled={!editable}
                  value={row.materials}
                  onChange={(e) => onPatch({ materials: e.target.value })}
                  placeholder="如：16A 开关 × 2，国标 BVR 2.5㎡ 线"
                />
              </Field>
              <Field label="施工要求" hint="多行按换行分隔">
                <Textarea
                  rows={3}
                  disabled={!editable}
                  value={row.sop}
                  onChange={(e) => onPatch({ sop: e.target.value })}
                  placeholder={"按图定位并标记\n开槽深度 ≤ 线管外径 1.5 倍\n隐蔽前拍照留档"}
                />
              </Field>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}

/**
 * 报价状态控制区（M15 断点③）。按钮按当前态只显合法下一步（与服务层 QUOTE_TRANSITIONS 对齐）：
 *  draft → [确认报价]；confirmed → [退回草稿] [锁定]；locked 为终态，仅显示锁定日提示。
 * 调 setQuoteStatusAction，成功 refresh，失败把中文错回传给上层 error 展示。
 */
function QuoteStatusControls({
  projectId,
  quoteStatus,
  quoteStatusLabel,
  quoteLockedAt,
  busy,
  onDone,
  onError,
}: {
  projectId: string;
  quoteStatus: string;
  quoteStatusLabel: string;
  quoteLockedAt: string | null;
  busy: boolean;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const run = (next: "draft" | "confirmed" | "locked") => {
    if (busy) return;
    void (async () => {
      const r = await setQuoteStatusAction(projectId, next);
      if (!r.ok) onError(r.error ?? "状态更新失败");
      else onDone();
    })();
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-inner border border-line bg-surface px-4 py-3">
      <span className="text-[13px] text-secondary whitespace-nowrap">
        报价状态：<span className="font-medium text-primary">{quoteStatusLabel}</span>
      </span>
      {quoteStatus === "locked" && quoteLockedAt && (
        <span className="text-[13px] num text-secondary whitespace-nowrap">
          锁定于 {quoteLockedAt}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2">
        {quoteStatus === "draft" && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("confirmed")}>
            确认报价
          </Button>
        )}
        {quoteStatus === "confirmed" && (
          <>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run("draft")}>
              退回草稿
            </Button>
            <Button size="sm" disabled={busy} onClick={() => run("locked")}>
              锁定（签约锁单）
            </Button>
          </>
        )}
        {quoteStatus === "locked" && (
          <span className="text-[13px] text-secondary">已锁定为终态，如需变更请走合同变更流程。</span>
        )}
      </span>
    </div>
  );
}

/** 汇总条单项：标签在上、数值在下，整体右对齐；总价用 accent 做全画面唯一强调点。 */
function SummaryItem({
  label,
  value,
  accent = false,
  className = "",
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-end gap-1 text-right ${className}`}>
      <dt className="text-xs text-secondary whitespace-nowrap">{label}</dt>
      <dd
        className={`num ${accent ? "text-[20px] font-semibold text-accent-ink" : "text-[15px]"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-xs text-secondary">{label}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed">{value}</dd>
    </div>
  );
}
