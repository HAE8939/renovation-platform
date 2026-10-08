"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, Input, SectionTitle, Table, Td, Th } from "@/core/ui";
import type { QuoteCategoryGroup, QuoteItemRow } from "@/modules/budget/types";
import {
  computeTotals,
  formatCny,
  formatPercent,
  formatQty,
  groupByCategory,
  lineTotal,
} from "@/modules/budget/lib/quote";

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
  quoteStatusLabel: string;
  items: QuoteItemRow[];
}

/**
 * 报价明细表 + 实时预算看板。
 * 数量可直接改并即时重算（M1a 约束：明细增删 / 保存 / 科目库管理留 M1b）。
 * 计算口径来自 modules/budget/lib/quote.ts，服务端渲染值与本页重算同源。
 */
export function QuoteBoard({ data }: { data: QuoteBoardData }) {
  const { project, taxRate, quoteStatusLabel, items: initialItems } = data;
  const [items, setItems] = useState<QuoteItemRow[]>(initialItems);

  // 数量受控：本地临时值，不落库
  const changeQuantity = (id: string, raw: string) => {
    const value = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, quantity: value } : it)));
  };

  const groups = useMemo(() => groupByCategory(items), [items]);
  const totals = useMemo(
    () => computeTotals(items, taxRate, project.area),
    [items, taxRate, project.area]
  );

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-5">
        <Link
          href="/budget"
          className="text-xs text-secondary underline-offset-4 hover:text-accent-ink hover:underline"
        >
          ← 返回项目列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[22px] font-semibold leading-tight">
            {project.name}
          </h1>
          <span className="num text-sm text-secondary">{project.code}</span>
          <Badge variant="accent">{project.statusLabel}</Badge>
          <Badge variant="outline">{quoteStatusLabel}</Badge>
        </div>
        {project.address && <p className="mt-1.5 text-sm text-secondary">{project.address}</p>}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* 明细表 */}
        <section className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">报价明细</h2>
            <span className="text-xs text-secondary">
              {totals.categoryCount} 个科目 · {totals.itemCount} 条
            </span>
          </div>

          {items.length === 0 ? (
            <Card className="mt-3 py-10 text-center text-sm leading-relaxed text-secondary">
              该项目还没有报价明细。
              <br />
              科目库选入与明细编辑在 M1b 提供。
            </Card>
          ) : (
            <Card padded={false} className="mt-3">
              <Table>
                <thead>
                  <tr>
                    <Th>编号</Th>
                    <Th>项目名称</Th>
                    <Th>单位</Th>
                    <Th align="right">单价</Th>
                    <Th align="right">数量</Th>
                    <Th align="right">小计</Th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <CategoryBlock key={g.categoryName} group={g} onChangeQuantity={changeQuantity} />
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </section>

        {/* 实时看板 */}
        <aside className="min-w-0">
          <div className="space-y-4 xl:sticky xl:top-6">
            <Card>
              <SectionTitle>预算汇总</SectionTitle>
              <dl className="mt-4 space-y-2.5">
                <TotalRow label="直接费" value={formatCny(totals.directSubtotal)} />
                <TotalRow
                  label={`税金（${formatPercent(taxRate)}）`}
                  value={formatCny(totals.tax)}
                />
              </dl>
              <div className="mt-4 border-t border-line pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">总价</span>
                  <span className="num text-xl font-semibold text-accent-ink">
                    {formatCny(totals.grand)}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <span className="text-xs text-secondary">单方造价</span>
                <span className="num text-sm text-secondary">
                  {totals.unitCost === null ? (
                    "面积缺失"
                  ) : (
                    <>
                      {formatCny(totals.unitCost)}
                      <span className="text-xs"> /㎡</span>
                    </>
                  )}
                </span>
              </div>
            </Card>

            <Card>
              <SectionTitle>项目信息</SectionTitle>
              <dl className="mt-4 space-y-2 text-sm">
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
            </Card>

            <p className="px-1 text-xs leading-relaxed text-muted">
              数量为临时修改，仅在本页实时重算，不会写回数据库；保存、增删与科目库管理留 M1b。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** 科目分组：一行分组头（含组小计）+ 组内明细行。 */
function CategoryBlock({
  group,
  onChangeQuantity,
}: {
  group: QuoteCategoryGroup;
  onChangeQuantity: (id: string, raw: string) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={5}
          className="border-b border-line bg-sunken px-3 py-1.5 text-xs font-medium uppercase tracking-[0.08em] text-secondary"
        >
          {group.categoryName}
        </td>
        <td className="num border-b border-line bg-sunken px-3 py-1.5 text-right text-xs font-medium text-secondary">
          {formatCny(group.subtotal)}
        </td>
      </tr>
      {group.items.map((item) => (
        <ItemRow key={item.id} item={item} onChangeQuantity={onChangeQuantity} />
      ))}
    </>
  );
}

function ItemRow({
  item,
  onChangeQuantity,
}: {
  item: QuoteItemRow;
  onChangeQuantity: (id: string, raw: string) => void;
}) {
  return (
    <tr>
      <Td className="num text-xs text-secondary">{item.code}</Td>
      <Td className="min-w-[220px]">
        <span className="block font-medium leading-snug">{item.name}</span>
        {item.materials && (
          <span className="mt-0.5 block text-xs leading-relaxed text-secondary">
            {item.materials}
          </span>
        )}
        {item.sop && (
          <details className="mt-1">
            <summary className="cursor-pointer list-none text-xs text-accent-ink underline-offset-4 hover:underline">
              施工要求
            </summary>
            <ul className="mt-1 space-y-0.5 pl-1 text-xs leading-relaxed text-secondary">
              {item.sop.split("\n").map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          </details>
        )}
      </Td>
      <Td className="text-xs text-secondary">{item.unit}</Td>
      <Td align="right" className="num text-secondary">
        {formatCny(item.unitPrice)}
      </Td>
      <Td align="right" className="w-24">
          <Input
            type="number"
            min="0"
            step="0.1"
            compact
            value={item.quantity}
            onChange={(e) => onChangeQuantity(item.id, e.target.value)}
            aria-label={`${item.name} 数量`}
            className="num w-20 text-right"
          />
      </Td>
      <Td align="right" className="num font-medium">
        {formatCny(lineTotal(item.unitPrice, item.quantity))}
      </Td>
    </tr>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="num text-sm">{value}</dd>
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
