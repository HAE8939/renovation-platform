"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea } from "@/core/ui";
import {
  createRecordAction,
  type FinanceFormState,
} from "@/app/finance/actions";
import { categoriesFor } from "@/modules/finance/types";
import { CATEGORY_LABEL } from "@/modules/finance/status";
import type { ProjectOption } from "@/modules/finance/server/records";

/**
 * 新建收支记录 Modal（M8-b，仿 NewIssueModal）。
 *
 * 字段：项目（必选，默认当前筛选项目）/ 收支类型（默认=当前 Tab view）/ 科目
 * （随类型联动：切换类型时重置为该侧第一项，避免残留跨侧非法值——防错账第一道闸的
 * 界面体现）/ 金额（正数，方向由 type 决定）/ 发生日期 / 摘要（选填）。
 * 提交调 createRecordAction；成功关闭 Modal + router.refresh()；错误红字回显。
 *
 * 定宽输入用外层容器定宽（勿改 core/ui/Input 的 w-full，STATUS §5）。
 */
export function NewRecordModal({
  projects,
  defaultView,
  defaultProjectId,
}: {
  projects: ProjectOption[];
  defaultView: "income" | "expense";
  defaultProjectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState<FinanceFormState, FormData>(
    createRecordAction,
    {}
  );

  // 类型↔科目联动：随 type 变化把科目重置为该侧第一项
  const [type, setType] = useState<"income" | "expense">(defaultView);
  const categoryOptions = categoriesFor(type);
  const [category, setCategory] = useState<string>(
    categoryOptions[0] as string
  );

  // 打开时按 defaultView 重置一次（当前 Tab 切换后再次打开能带上当前类型）
  useEffect(() => {
    if (open) {
      setType(defaultView);
      const first = categoriesFor(defaultView)[0];
      if (first) setCategory(first as string);
    }
  }, [open, defaultView]);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  // 切换类型：重置科目为该侧第一项
  const onTypeChange = (next: "income" | "expense") => {
    setType(next);
    const first = categoriesFor(next)[0];
    if (first) setCategory(first as string);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-inner bg-accent px-4 text-sm font-medium text-accent-fg whitespace-nowrap transition-colors hover:brightness-95"
      >
        + 新建记录
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} title="新建收支记录">
          <form action={formAction} className="space-y-4">
            <Field label="项目" required>
              <Select
                name="projectId"
                required
                defaultValue={defaultProjectId ?? ""}
              >
                <option value="" disabled>
                  请选择项目
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>

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
                    placeholder="如 24500.00"
                  />
                </div>
              </Field>
              <Field label="发生日期" required>
                <div className="w-[12rem]">
                  <Input name="date" type="date" required />
                </div>
              </Field>
            </div>

            <Field label="摘要" hint="选填">
              <Textarea
                name="description"
                rows={2}
                placeholder="如：泥工班组第二期人工"
              />
            </Field>

            {state.error && (
              <p className="text-[13px] text-danger">{state.error}</p>
            )}

            <div className="flex items-center gap-4">
              <NewRecordSubmitButton />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function NewRecordSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认新建"}
    </Button>
  );
}
