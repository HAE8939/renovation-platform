"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Field, Textarea } from "@/core/ui";
import { reviewDesignTaskAction, type ReviewFormState } from "@/modules/design/actions";

function ReviewSubmitButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * 审核操作区（M5-c）：仅在最新「待审核」提交旁渲染。
 * 「通过」直接确认（confirm 文案，无 alert）；「退回」展开必填原因输入
 * （textarea required，前端拦 + 后端再拦双保险）。
 * 审核人 = 占位当前用户（P4 接登录后自动切换为登录人）；无占位用户则禁用提交。
 */
export function ReviewForm({
  taskId,
  submissionId,
  placeholderUserName,
}: {
  taskId: string;
  submissionId: string;
  placeholderUserName: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [state, formAction] = useFormState<ReviewFormState, FormData>(
    reviewDesignTaskAction,
    {}
  );

  // 成功后页面由 revalidatePath 刷新，这里兜底显示已处理。
  if (state.ok) {
    return <p className="text-[13px] text-success">已处理，页面正在刷新…</p>;
  }

  const noUser = !placeholderUserName;

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <input
        type="hidden"
        name="approve"
        value={mode === "approve" ? "true" : "false"}
      />

      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" size="sm" onClick={() => setMode("approve")}>
            通过
          </Button>
          <Button variant="danger" size="sm" onClick={() => setMode("reject")}>
            退回
          </Button>
        </div>
      )}

      {mode === "approve" && (
        <div className="space-y-4">
          <p className="text-[13px] text-primary">
            确认通过此版本？通过后任务状态将转为「已通过」。
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <ReviewSubmitButton
              label="确认通过"
              pendingLabel="处理中…"
              disabled={noUser}
            />
            <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
              取消
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="space-y-4">
          <Field label="退回原因" required hint="必填，提交人将据此返修">
            <Textarea
              name="rejectReason"
              rows={3}
              placeholder="说明需要返修的具体问题…"
              required
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <ReviewSubmitButton
              label="确认退回"
              pendingLabel="处理中…"
              disabled={noUser}
            />
            <Button variant="ghost" size="sm" onClick={() => setMode("idle")}>
              取消
            </Button>
          </div>
        </div>
      )}

      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}

      {noUser && (
        <p className="text-[13px] text-danger">
          未找到 designer 角色用户，无法确定审核人（请先运行 seed 初始化用户）
        </p>
      )}
    </form>
  );
}
