"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea } from "@/core/ui";
import { createIssueAction, type IssueActionFormState } from "@/app/quality/actions";
import type { ProjectOption, UserOption } from "@/modules/quality/server/issues";
import { ISSUE_SEVERITY_ORDER, ISSUE_SEVERITY_LABEL } from "@/modules/quality/status";

/**
 * 手工新建问题 Modal（M7-c，仿 crm SignLeadModal 结构）。
 *
 * 字段：项目（select 必选，默认当前筛选项目）/ 标题（必填）/ 描述（textarea 可选）/
 * 严重度（select 默认一般）/ 责任人（select：未指派 + 用户列表）/ 截止日期（date 可选）。
 * 提交调 createIssueAction；成功关闭 Modal + router.refresh()；错误红字回显。
 */
export function NewIssueModal({
  projects,
  users,
  defaultProjectId,
}: {
  projects: ProjectOption[];
  users: UserOption[];
  defaultProjectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState<IssueActionFormState, FormData>(
    createIssueAction,
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
        + 新建问题
      </button>

      {open && (
        <Modal open={open} onClose={() => setOpen(false)} title="新建问题">
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

            <Field label="问题标题" required>
              <Input
                name="title"
                required
                placeholder="如：墙面大面积空鼓"
              />
            </Field>

            <Field label="详细描述" hint="选填">
              <Textarea
                name="desc"
                rows={3}
                placeholder="问题描述、位置、整改要求…"
              />
            </Field>

            <div className="flex items-start gap-4">
              <Field label="严重度" required>
                <Select name="severity" defaultValue="normal" className="max-w-[10rem]">
                  {ISSUE_SEVERITY_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {ISSUE_SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="责任人" hint="选填">
                <Select name="assigneeId" defaultValue="" className="max-w-[12rem]">
                  <option value="">未指派</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="截止日期" hint="选填">
              <Input name="dueDate" type="date" />
            </Field>

            {state.error && (
              <p className="text-[13px] text-danger">{state.error}</p>
            )}

            <div className="flex items-center gap-4">
              <NewIssueSubmitButton />
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

function NewIssueSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认新建"}
    </Button>
  );
}
