"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, Input } from "@/core/ui";
import { formatCny } from "@/modules/budget/lib/quote";
import type {
  CatalogPickerCategory,
  CatalogSnapshot,
} from "@/modules/budget/server/catalog";

/**
 * 「从科目库选入」面板。
 * 数据来自 listCatalogForPicker()，只带快照需要的字段。选中即把模板当前值
 * 整行复制成报价明细 —— 复制完成即与科目库脱钩，改模板不回溯历史报价。
 * 面板本身不写库，只在本地多一行草稿，等点「保存」才落库。
 */
export function CatalogPicker({
  catalog,
  onPick,
}: {
  catalog: CatalogPickerCategory[];
  onPick: (categoryName: string, item: CatalogSnapshot) => void;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  /** 前端即时过滤：科目名命中则整组保留，否则只留命中的科目项。 */
  const visible = useMemo(() => {
    if (!q) return catalog;
    return catalog
      .map((c) => {
        const hit = c.name.toLowerCase().includes(q);
        const items = hit
          ? c.items
          : c.items.filter((i) =>
              [i.code, i.name, i.unit, i.materials, i.sop].some((v) =>
                v.toLowerCase().includes(q)
              )
            );
        return hit || items.length > 0 ? { ...c, items: hit ? c.items : items } : null;
      })
      .filter((c): c is CatalogPickerCategory => c !== null);
  }, [catalog, q]);

  return (
    <Card padded={false} className="mt-3">
      <header className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Field label="搜索科目项">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="按编号、名称、材料、施工要求筛选"
            />
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-secondary sm:pb-2">
          选中即按模板当前值复制成明细行；复制后与科目库脱钩，改模板不回溯历史报价。
        </p>
      </header>

      <div className="max-h-80 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-secondary">
            没有与「{query.trim()}」匹配的科目项。
          </p>
        ) : (
          visible.map((category) => (
            <section key={category.id}>
              <h3 className="border-b border-line bg-sunken px-4 py-2 text-xs font-medium uppercase tracking-[0.08em] text-secondary">
                {category.name}
              </h3>
              <div className="p-2">
                {category.items.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onPick(category.name, item)}
                    className="mt-1 w-full text-left"
                  >
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span className="num text-xs text-secondary">{item.code}</span>
                        <span className="ml-2">{item.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-secondary">
                        <span>{item.unit}</span>
                        <span className="num">{formatCny(item.unitPrice)}</span>
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Card>
  );
}
