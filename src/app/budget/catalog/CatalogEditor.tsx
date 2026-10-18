"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Table,
  Td,
  Textarea,
  Th,
} from "@/core/ui";
import { formatCny, formatQty } from "@/modules/budget/lib/quote";
import type { CatalogCategoryRow, CatalogItemRow } from "@/modules/budget/server/catalog";
import {
  createCategoryAction,
  createItemAction,
  deleteCategoryAction,
  deleteItemAction,
  reorderCategoriesAction,
  setItemOrderAction,
  updateCategoryAction,
  updateItemAction,
  type CatalogFormState,
} from "../actions";

const EMPTY_STATE: CatalogFormState = {};

type CatalogAction = (prev: CatalogFormState, fd: FormData) => Promise<CatalogFormState>;

type DrawerTarget = { categoryId: string; item: CatalogItemRow | null };

type PendingConfirm = { text: string; run: () => void };

/** 交换相邻两项；越界返回 null，调用方无需再判边界。 */
function swap(list: string[], index: number, dir: -1 | 1): string[] | null {
  const target = index + dir;
  if (index < 0 || target < 0 || target >= list.length) return null;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function CatalogEditor({ catalog }: { catalog: CatalogCategoryRow[] }) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  function run(action: CatalogAction, fd: FormData, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action(EMPTY_STATE, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      after?.();
    });
  }

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
      .filter((c): c is CatalogCategoryRow => c !== null);
  }, [catalog, q]);

  const totalItems = useMemo(
    () => catalog.reduce((sum, c) => sum + c.items.length, 0),
    [catalog]
  );

  /* ── 科目 ─────────────────────────────────────────────────── */

  function submitNewCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(createCategoryAction, fd, () => {
      setShowNewCategory(false);
      setQuery("");
    });
  }

  function submitRename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(updateCategoryAction, new FormData(e.currentTarget), () => setRenamingId(null));
  }

  function moveCategory(id: string, dir: -1 | 1) {
    const ids = catalog.map((c) => c.id);
    const next = swap(ids, ids.indexOf(id), dir);
    if (!next) return;
    const fd = new FormData();
    next.forEach((v) => fd.append("ids", v));
    run(reorderCategoriesAction, fd);
  }

  function askDeleteCategory(c: CatalogCategoryRow) {
    setConfirm({
      text: `删除科目“${c.name}”及其 ${c.items.length} 个科目项？已生成的报价不受影响。`,
      run: () => {
        const fd = new FormData();
        fd.set("id", c.id);
        run(deleteCategoryAction, fd, () => setRenamingId(null));
      },
    });
  }

  /* ── 科目项 ───────────────────────────────────────────────── */

  function moveItem(c: CatalogCategoryRow, itemId: string, dir: -1 | 1) {
    const ids = c.items.map((i) => i.id);
    const next = swap(ids, ids.indexOf(itemId), dir);
    if (!next) return;
    const fd = new FormData();
    fd.set("categoryId", c.id);
    next.forEach((v) => fd.append("ids", v));
    run(setItemOrderAction, fd);
  }

  function submitItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drawer) return;
    const { item } = drawer;
    const fd = new FormData(e.currentTarget);
    fd.set("categoryId", drawer.categoryId);
    const action = item ? updateItemAction : createItemAction;
    if (item) fd.set("id", item.id);
    run(action, fd, () => setDrawer(null));
  }

  function askDeleteItem(c: CatalogCategoryRow, item: CatalogItemRow) {
    setConfirm({
      text: `删除科目项“${item.name}”（${item.code}）？`,
      run: () => {
        const fd = new FormData();
        fd.set("id", item.id);
        run(deleteItemAction, fd);
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* 工具条 */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Field label="搜索">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="按科目、编号、名称、材料、施工要求筛选"
            />
          </Field>
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowNewCategory((v) => !v)}
          aria-expanded={showNewCategory}
          disabled={pending}
        >
          {showNewCategory ? "收起" : "新增科目"}
        </Button>
      </section>

      {error && (
        <p role="alert" className="rounded-inner border border-danger bg-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {showNewCategory && (
        <Card>
          <form onSubmit={submitNewCategory} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-sm">
              <Field label="科目名称" required>
                <Input name="name" placeholder="如：水电改造" required autoFocus />
              </Field>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "创建科目"}
            </Button>
          </form>
        </Card>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">科目与科目项</h2>
          <span className="text-xs text-secondary">
            共 {catalog.length} 个科目 · {totalItems} 个科目项
          </span>
        </div>

        {catalog.length === 0 ? (
          <Card className="mt-3 py-8 text-center text-sm text-secondary">
            还没有科目。先用上面的“新增科目”建一个工程科目，再往里加科目项。
          </Card>
        ) : visible.length === 0 ? (
          <Card className="mt-3 py-8 text-center text-sm text-secondary">
            没有与“{query.trim()}”匹配的科目或科目项。
          </Card>
        ) : (
          <div className="mt-3 space-y-4">
            {visible.map((c) => {
              const renaming = renamingId === c.id;
              return (
                <Card key={c.id} padded={false}>
                  <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                    {renaming ? (
                      <form
                        onSubmit={submitRename}
                        className="flex flex-1 flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <Input
                          name="name"
                          defaultValue={c.name}
                          required
                          autoFocus
                          className="min-w-0 flex-1 sm:max-w-xs"
                        />
                        <Button type="submit" size="sm" disabled={pending}>
                          {pending ? "保存中…" : "保存"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setRenamingId(null)}
                        >
                          取消
                        </Button>
                      </form>
                    ) : (
                      <>
                        <h3 className="text-sm font-semibold">{c.name}</h3>
                        <Badge variant="outline">{c.items.length} 项</Badge>
                        <div className="ml-auto flex flex-wrap items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending || q !== ""}
                            onClick={() => moveCategory(c.id, -1)}
                            aria-label={`上移科目 ${c.name}`}
                          >
                            ↑ 上移
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending || q !== ""}
                            onClick={() => moveCategory(c.id, 1)}
                            aria-label={`下移科目 ${c.name}`}
                          >
                            ↓ 下移
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setDrawer({ categoryId: c.id, item: null })}
                          >
                            新增科目项
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setRenamingId(c.id)}
                          >
                            重命名
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={pending}
                            onClick={() => askDeleteCategory(c)}
                          >
                            删除
                          </Button>
                        </div>
                      </>
                    )}
                  </header>

                  {c.items.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-secondary">该科目下还没有科目项。</p>
                  ) : (
                    <Table>
                      <thead>
                        <tr>
                          <Th>编号 / 名称</Th>
                          <Th>单位</Th>
                          <Th align="right">默认单价</Th>
                          <Th align="right">默认数量</Th>
                          <Th>材料说明</Th>
                          <Th>施工要求</Th>
                          <Th align="right">操作</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.items.map((item) => (
                          <tr key={item.id} className="hover:bg-canvas">
                            <Td>
                              <span className="num text-xs text-secondary">{item.code}</span>
                              <span className="ml-2 font-medium">{item.name}</span>
                            </Td>
                            <Td className="whitespace-nowrap text-secondary">{item.unit}</Td>
                            <Td align="right" className="num whitespace-nowrap">
                              {formatCny(item.defaultPrice)}
                            </Td>
                            <Td align="right" className="num whitespace-nowrap">
                              {formatQty(item.defaultQty)}
                            </Td>
                            <Td className="text-secondary">
                              <span className="block max-w-[12rem] truncate" title={item.materials}>
                                {item.materials || "—"}
                              </span>
                            </Td>
                            <Td className="text-secondary">
                              <span
                                className="block max-w-[14rem] truncate"
                                title={item.sop}
                              >
                                {item.sop || "—"}
                              </span>
                            </Td>
                            <Td align="right">
                              <span className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending || q !== ""}
                                  onClick={() => moveItem(c, item.id, -1)}
                                  aria-label={`上移 ${item.name}`}
                                >
                                  ↑
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending || q !== ""}
                                  onClick={() => moveItem(c, item.id, 1)}
                                  aria-label={`下移 ${item.name}`}
                                >
                                  ↓
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={pending}
                                  onClick={() => setDrawer({ categoryId: c.id, item })}
                                >
                                  编辑
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={pending}
                                  onClick={() => askDeleteItem(c, item)}
                                >
                                  删除
                                </Button>
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* 科目项抽屉 */}
      {drawer &&
        (() => {
          const category = catalog.find((c) => c.id === drawer.categoryId);
          const item = drawer.item;
          return (
            <div className="fixed inset-0 z-40 flex justify-end">
              <button
                type="button"
                aria-label="关闭编辑抽屉"
                onClick={() => setDrawer(null)}
                className="absolute inset-0 bg-canvas/70"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label={item ? "编辑科目项" : "新增科目项"}
                className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface"
              >
                <header className="flex items-baseline justify-between gap-3 border-b border-line px-6 py-4">
                  <div>
                    <h2 className="text-sm font-semibold">
                      {item ? "编辑科目项" : "新增科目项"}
                    </h2>
                    <p className="mt-1 text-xs text-secondary">
                      所属科目：{category?.name ?? "—"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDrawer(null)}
                    aria-label="关闭"
                  >
                    关闭
                  </Button>
                </header>

                <form
                  key={item ? item.id : "new"}
                  id="item-form"
                  onSubmit={submitItem}
                  className="flex-1 space-y-4 overflow-y-auto px-6 py-6"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="编号" required hint="全库唯一，如 SD-01">
                      <Input
                        name="code"
                        defaultValue={item?.code ?? ""}
                        placeholder="SD-01"
                        required
                      />
                    </Field>
                    <Field label="名称" required>
                      <Input
                        name="name"
                        defaultValue={item?.name ?? ""}
                        placeholder="如：开关插座安装"
                        required
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="单位" hint="留空默认“项”">
                      <Input
                        name="unit"
                        defaultValue={item?.unit ?? ""}
                        placeholder="项 / ㎡ / m"
                      />
                    </Field>
                    <Field label="默认单价（元）">
                      <Input
                        name="defaultPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item?.defaultPrice ?? 0}
                      />
                    </Field>
                    <Field label="默认数量">
                      <Input
                        name="defaultQty"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item?.defaultQty ?? 1}
                      />
                    </Field>
                  </div>

                  <Field label="材料说明">
                    <Textarea
                      name="materials"
                      rows={2}
                      defaultValue={item?.materials ?? ""}
                      placeholder="如：16A 开关 × 2，国标 BVR 2.5㎡ 线"
                    />
                  </Field>

                  <Field label="施工要求 SOP" hint="多行按换行分隔，报价时随明细快照带出">
                    <Textarea
                      name="sop"
                      rows={4}
                      defaultValue={item?.sop ?? ""}
                      placeholder={"按图定位并标记\n开槽深度 ≤ 线管外径 1.5 倍\n隐蔽前拍照留档"}
                    />
                  </Field>
                </form>

                <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
                  <Button
                    variant="ghost"
                    onClick={() => setDrawer(null)}
                    disabled={pending}
                  >
                    取消
                  </Button>
                  <Button type="submit" form="item-form" disabled={pending}>
                    {pending ? "保存中…" : item ? "保存修改" : "新增科目项"}
                  </Button>
                </footer>
              </div>
            </div>
          );
        })()}

      {confirm && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <p className="text-sm">{confirm.text}</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setConfirm(null);
                  confirm.run();
                }}
              >
                {pending ? "删除中…" : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
