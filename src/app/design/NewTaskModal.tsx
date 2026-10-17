"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea } from "@/core/ui";
import {
  createDesignTaskAction,
  type DesignCreateFormState,
} from "@/modules/design/actions";
import { DESIGN_TASK_TYPE_ORDER, DESIGN_TASK_TYPE_LABEL } from "@/modules/design/types";
import type { DesignProjectOption, DesignUserOption } from "@/modules/design/server/create";

const PRIORITY_ORDER = ["high", "medium", "low"] as const;
const PRIORITY_LABEL: Record<(typeof PRIORITY_ORDER)[number], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/**
 * 新建设计任务 Modal（M5-e，仿 NewIssueModal / SignLeadModal 结构）。
 *
 * 字段：项目（必选）/ 标题（必填）/ 类型（必选，默认方案）/ 优先级（默认中）/
 * 负责人（选填：留空=待分配，可选设计师立即指派）/ 截止日期（date 选填）/ 需求说明（textarea 选填）。
 * 提交调 createDesignTaskAction；成功关闭 + router.refresh()；错误红字回显。
 */
export function NewTaskModal({
  projects,
  users,
}: {
  projects: DesignProjectOption[];
  users: DesignUserOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState<DesignCreateFormState, FormData>(
    createDesignTaskAction,
    {}
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
        className="inline-flex h-9 items-center justify-center rounded-inner bg-accent px-4 text-sm font-medium text-accent-fg whitespace-nowrap transition-colors hover:brightness-95"
      >
        + 新建任务
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} title="新建设计任务">
          <form action={formAction} className="space-y-4">
            <Field label="项目" required hint="设计任务挂在项目下，已归档项目不出现在此列">
              <Select name="projectId" required defaultValue="">
                <option value="" disabled>
                  请选择项目
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="任务标题" required>
              <Input name="title" required placeholder="如：主卧效果图三版" />
            </Field>

            <div className="flex items-start gap-4">
              <Field label="类型" required>
                <Select name="type" defaultValue="scheme" className="max-w-[12rem]">
                  {DESIGN_TASK_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {DESIGN_TASK_TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="优先级" required>
                <Select name="priority" defaultValue="medium" className="max-w-[8rem]">
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="负责人" hint="选填：留空即落「待分配」，可在任务详情里再指派">
              <Select name="assigneeId" defaultValue="">
                <option value="">待分配</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="截止日期" hint="选填：不设则不进日历、不算逾期">
              <Input name="deadline" type="date" />
            </Field>

            <Field label="需求说明" hint="选填">
              <Textarea name="requirement" rows={3} placeholder="设计要求、范围、交付标准…" />
            </Field>

            {state.error && (
              <p className="text-[13px] text-danger">{state.error}</p>
            )}

            <div className="flex items-center gap-4">
              <NewTaskSubmitButton />
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

function NewTaskSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认新建"}
    </Button>
  );
}
