"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Select } from "@/core/ui";
import { FIELD_TYPE_LABEL, TEXT_MAX, TEXTAREA_MAX } from "@/core/domain/customField";
import type { EntityFieldValue } from "@/core/domain/customFieldRepo";
import {
  saveCustomFieldValuesAction,
  type CustomValuesState,
} from "./actions";

/**
 * 项目「自定义字段」值录入（M9-c，client）。
 * - 控件按定义类型分派：单行文本→Input / 多行文本→textarea / 数字→Input number /
 *   日期→Input date / 单选→Select（选项来自定义，前端不猜类型、不写校验规则）。
 * - 必填项 label 后加「*」；**校验真源在服务端**（core 的 coerce + requiredEmpty），
 *   这里只做输入形态约束（number/date 由控件本身门住）。
 * - 无在用定义 → 诚实空态 + 指向 /fields 的引导（不显示空表框）。
 * - 保存后回显成功一行（不弹提示、不加动效）。
 */
export interface CustomFieldsFormProps {
  projectId: string;
  rows: EntityFieldValue[];
}

export function CustomFieldsForm({ projectId, rows }: CustomFieldsFormProps) {
  const [state, setState] = useState<CustomValuesState>({});
  const [pending, setPending] = useState(false);

  if (rows.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-[15px] font-medium">自定义字段</h3>
        <p className="mt-2 text-[13px] text-secondary">
          尚未定义自定义字段。可在
          <Link href="/fields" className="mx-1 text-accent-ink hover:underline">
            自定义字段
          </Link>
          里添加，之后就能在项目上录入并按条件筛选项目列表。
        </p>
      </div>
    );
  }

  async function onSubmit(formData: FormData) {
    setPending(true);
    const res = await saveCustomFieldValuesAction(projectId, {}, formData);
    setPending(false);
    setState(res);
  }

  return (
    <div className="mt-6">
      <h3 className="text-[15px] font-medium">自定义字段</h3>
      <form
        action={onSubmit}
        className="mt-3 border border-line bg-surface p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((r) => (
            <Field
              key={r.def.id}
              label={`${r.def.label}（${FIELD_TYPE_LABEL[r.def.type]}）`}
              required={r.def.required}
            >
              {r.def.type === "textarea" ? (
                <textarea
                  name={`cfv_${r.def.id}`}
                  rows={3}
                  maxLength={TEXTAREA_MAX}
                  defaultValue={r.formInput}
                  className="w-full resize-y border border-line bg-surface px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                />
              ) : r.def.type === "select" ? (
                <Select name={`cfv_${r.def.id}`} defaultValue={r.formInput}>
                  <option value="">未选择</option>
                  {r.def.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  name={`cfv_${r.def.id}`}
                  type={r.def.type === "number" ? "number" : r.def.type === "date" ? "date" : "text"}
                  step={r.def.type === "number" ? "any" : undefined}
                  maxLength={r.def.type === "text" ? TEXT_MAX : undefined}
                  defaultValue={r.formInput}
                />
              )}
            </Field>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "保存中…" : "保存字段值"}
          </Button>
          {state.error && (
            <span className="text-[13px] text-danger">{state.error}</span>
          )}
          {state.ok && !state.error && (
            <span className="text-[13px] text-success">已保存</span>
          )}
        </div>
      </form>
    </div>
  );
}
