"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal } from "@/core/ui";
import { signLeadAction, type SignLeadState } from "@/modules/crm/actions";

const initial: SignLeadState = {};

/** 单行「签约」入口：按钮打开最小 Modal，提交调 signLeadAction。 */
export function SignLeadButton({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState<SignLeadState, FormData>(
    signLeadAction.bind(null, leadId),
    initial
  );

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center justify-center rounded-inner border border-line bg-surface px-3 text-[13px] font-medium text-accent-ink whitespace-nowrap transition-colors hover:bg-accent-tint"
      >
        签约
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} title="签约建项">
          <form action={formAction} className="space-y-4">
            <Field label="合同额（元）" required hint="必填，数字；将作为项目合同额">
              <Input
                name="contractAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="如：128000"
                required
              />
            </Field>
            <Field label="设计师">
              <Input name="designer" placeholder="选填" />
            </Field>
            <Field label="项目经理">
              <Input name="pm" placeholder="选填" />
            </Field>
            <Field label="开工日期">
              <Input name="startDate" type="date" />
            </Field>

            {state.error && (
              <p className="text-[13px] text-danger">{state.error}</p>
            )}

            <div className="flex items-center gap-4">
              <SubmitButton />
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "签约中…" : "确认签约"}
    </Button>
  );
}
