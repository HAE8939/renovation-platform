"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Button, Card, Field, Input } from "@/core/ui";
import { createLeadAction, type LeadFormState } from "@/modules/crm/actions";

const initialState: LeadFormState = {};

/**
 * 新建线索：Server Action 落库，成功后收起并刷新列表（revalidatePath）。
 */
export function NewLeadForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useFormState<LeadFormState, FormData>(
    createLeadAction,
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
    }
  }, [state]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">新建线索</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "收起" : "展开表单"}
        </Button>
      </div>

      {open && (
        <Card className="mt-3">
          <form action={formAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="客户姓名" required>
              <Input name="name" placeholder="如：王先生" required />
            </Field>
            <Field label="联系电话">
              <Input name="phone" placeholder="选填" />
            </Field>
            <Field label="楼盘">
              <Input name="estate" placeholder="选填，如：云栖名邸" />
            </Field>
            <Field label="面积（㎡）">
              {/* step 与另两处面积框同为 0.01：签约时会把此面积写进项目并参与单方造价计算，
                  0.1 会让浏览器静默拦下两位小数的合法值 */}
              <Input name="area" type="number" min="0" step="0.01" placeholder="选填" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="负责人">
                <Input name="assignee" placeholder="选填" />
              </Field>
            </div>

            <div className="flex items-center gap-4 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "保存中…" : "创建线索"}
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
                取消
              </Button>
              {state.error && <span className="text-[13px] text-danger">{state.error}</span>}
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
