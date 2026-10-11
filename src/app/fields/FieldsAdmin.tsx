"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Modal, Select, Table, Td, Th } from "@/core/ui";
import {
  FIELD_TYPE_LABEL,
  FIELD_TYPE_ORDER,
  type FieldType,
} from "@/core/domain/customField";
import type { FieldDef } from "@/core/domain/customFieldRepo";
import {
  EMPTY_FIELD_STATE,
  deleteFieldAction,
  reorderFieldsAction,
  saveFieldAction,
  toggleFieldActiveAction,
} from "./actions";

/**
 * 自定义字段定义管理面（M9-c，client）。
 * - 列表：顺序（上移/下移）/ 名称 / 标识 / 类型 / 必填 / 状态 / 已填值 / 操作。
 * - 新建与编辑共用一个 Modal 表单；**编辑态「标识」与「类型」只读**——改了历史值所在的列
 *   语义就漂了（数字会躺在 valueText 里、日期变成字符串比较），服务端也同样拒（M8-b 教训：
 *   控件必须与写侧语义一致，不给"改了静默不生效"的口子）。
 * - 类型↔选项联动：只有「单选」显示选项输入，切走类型即隐藏（服务端同样只在 select 时取选项）。
 * - 删除＝行内两步确认（首点变「确认删除」danger 描边，再点执行，2 秒复位）。
 * - 停用＝不进录入、不进筛选，历史值保留可查（行文字转 muted）。
 *
 * 口径：本文件零校验逻辑、零算式——所有规则与报错文案来自 core/domain/customField{,Repo}。
 */

interface Draft {
  id: string; // 空＝新建
  key: string;
  label: string;
  type: FieldType;
  optionsRaw: string;
  required: boolean;
  active: boolean;
}

const NEW_DRAFT: Draft = {
  id: "",
  key: "",
  label: "",
  type: "text",
  optionsRaw: "",
  required: false,
  active: true,
};

function toDraft(def: FieldDef): Draft {
  return {
    id: def.id,
    key: def.key,
    label: def.label,
    type: def.type,
    optionsRaw: def.options.join("\n"),
    required: def.required,
    active: def.active,
  };
}

export interface FieldsAdminProps {
  defs: FieldDef[];
}

export function FieldsAdmin({ defs }: FieldsAdminProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isEdit = Boolean(draft && draft.id !== "");

  async function submitDraft() {
    const form = formRef.current;
    if (!form || !draft) return;
    setPending(true);
    setError(undefined);
    const res = await saveFieldAction(EMPTY_FIELD_STATE, new FormData(form));
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDraft(null);
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = defs.map((d) => d.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setPending(true);
    const fd = new FormData();
    fd.set("order", next.join(","));
    const res = await reorderFieldsAction(EMPTY_FIELD_STATE, fd);
    setPending(false);
    if (res.error) setError(res.error);
  }

  async function toggle(def: FieldDef) {
    setPending(true);
    const res = await toggleFieldActiveAction(def.id, !def.active);
    setPending(false);
    if (res.error) setError(res.error);
  }

  async function remove(id: string) {
    setPending(true);
    const res = await deleteFieldAction(id, EMPTY_FIELD_STATE);
    setPending(false);
    if (res.error) setError(res.error);
    setConfirmId(null);
  }

  /** 两步确认：首点置为待确认并 2 秒复位，再点执行。 */
  function clickDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((cur) => (cur === id ? null : cur)), 2000);
      return;
    }
    void remove(id);
  }

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[17px] font-medium">字段定义</h2>
        <Button
          variant="primary"
          onClick={() => {
            setError(undefined);
            setDraft({ ...NEW_DRAFT });
          }}
        >
          + 新建字段
        </Button>
      </div>

      {error && (
        <p className="mt-4 border border-danger px-3 py-2 text-[13px] text-danger">{error}</p>
      )}

      {defs.length === 0 ? (
        <p className="mt-6 text-sm text-secondary">
          尚未定义任何字段。新建后即可在项目详情的「自定义字段」区录入，并在项目列表里按条件筛选。
        </p>
      ) : (
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th align="center">顺序</Th>
                <Th>名称</Th>
                <Th>标识</Th>
                <Th>类型</Th>
                <Th align="center">必填</Th>
                <Th align="center">状态</Th>
                <Th align="right">已填值</Th>
                <Th align="right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d, i) => (
                <tr key={d.id} className={d.active ? "" : "text-muted"}>
                  <Td align="center" className="whitespace-nowrap">
                    <button
                      type="button"
                      disabled={i === 0 || pending}
                      onClick={() => void move(d.id, -1)}
                      className="px-2 text-[13px] text-secondary hover:text-primary disabled:text-muted"
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={i === defs.length - 1 || pending}
                      onClick={() => void move(d.id, 1)}
                      className="px-2 text-[13px] text-secondary hover:text-primary disabled:text-muted"
                      title="下移"
                    >
                      ↓
                    </button>
                  </Td>
                  <Td className="text-[15px]">{d.label}</Td>
                  <Td>
                    <span className="num text-xs">{d.key}</span>
                  </Td>
                  <Td className="text-[13px]">{FIELD_TYPE_LABEL[d.type]}</Td>
                  <Td align="center" className="text-[13px]">
                    {d.required ? "是" : "—"}
                  </Td>
                  <Td align="center" className="text-[13px]">
                    {d.active ? "在用" : "停用"}
                  </Td>
                  <Td align="right" className="num text-[13px]">
                    {d.valueCount ?? 0}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setError(undefined);
                        setDraft(toDraft(d));
                      }}
                      className="px-2 text-xs text-accent-ink hover:underline"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void toggle(d)}
                      className="px-2 text-xs text-secondary hover:text-primary"
                    >
                      {d.active ? "停用" : "启用"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => clickDelete(d.id)}
                      className={
                        confirmId === d.id
                          ? "ml-1 border border-danger px-2 text-xs text-danger"
                          : "px-2 text-xs text-secondary hover:text-danger"
                      }
                      title={confirmId === d.id ? "再点一次执行删除" : undefined}
                    >
                      {confirmId === d.id ? "确认删除" : "删除"}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-4 text-xs text-secondary">
            删除会连带清掉该字段已录入的值；若只想暂时停用，请用「停用」——历史值保留可查。
          </p>
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => {
          setDraft(null);
          setError(undefined);
        }}
        title={isEdit ? "编辑字段" : "新建字段"}
      >
        {draft && (
          <form
            ref={formRef}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitDraft();
            }}
          >
            <input type="hidden" name="id" value={draft.id} />
            <Field label="字段名称" required hint="列表与表单里显示的名字">
              <Input
                name="label"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="如：复尺日期"
              />
            </Field>

            <Field
              label="字段标识"
              required
              hint={
                isEdit
                  ? "创建后不可修改（改了历史值所在的列语义会漂）"
                  : "小写字母开头，可含数字与下划线，长度 2~40；创建后不可修改"
              }
            >
              <Input
                name="key"
                value={draft.key}
                readOnly={isEdit}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                placeholder="survey_date"
                className={isEdit ? "text-muted" : ""}
              />
            </Field>

            <Field
              label="类型"
              required
              hint={
                isEdit
                  ? "创建后不可修改"
                  : "本期支持五种，不含金额；数字与日期按类型分列存储，区间筛选才准确"
              }
            >
              <Select
                name="type"
                value={draft.type}
                disabled={isEdit}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as FieldType })
                }
              >
                {FIELD_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>

            {draft.type === "select" && (
              <Field label="选项" required hint="每行一个选项">
                <textarea
                  name="optionsRaw"
                  rows={4}
                  value={draft.optionsRaw}
                  onChange={(e) => setDraft({ ...draft, optionsRaw: e.target.value })}
                  className="w-full resize-y border border-line bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                  placeholder={"不含家电\n仅厨电\n含全屋家电"}
                />
              </Field>
            )}

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-[13px] text-secondary">
                <input
                  type="checkbox"
                  name="required"
                  checked={draft.required}
                  onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                />
                必填
              </label>
              <label className="flex items-center gap-2 text-[13px] text-secondary">
                <input
                  type="checkbox"
                  name="active"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                启用
              </label>
            </div>

            {error && (
              <p className="border border-danger px-3 py-2 text-[13px] text-danger">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setError(undefined);
                }}
              >
                取消
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
