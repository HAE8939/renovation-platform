"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Field, Input, Textarea } from "@/core/ui";
import { submitDesignTaskAction, type SubmitTaskFormState } from "@/modules/design/actions";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "提交中…" : "提交成果"}
    </Button>
  );
}

/**
 * 提交成果表单（M5-b）：Server Action 驱动，taskId 走隐藏字段。
 * 提交人 = 占位当前用户（P4 接登录后换登录人）；无占位用户时禁用提交并给出可读提示。
 */
export function SubmitTaskForm({
  taskId,
  placeholderUserName,
}: {
  taskId: string;
  placeholderUserName: string | null;
}) {
  const [state, formAction] = useFormState<SubmitTaskFormState, FormData>(
    submitDesignTaskAction,
    {}
  );

  return (
    <form action={formAction} className="mt-4 space-y-4" encType="multipart/form-data">
      <input type="hidden" name="taskId" value={taskId} />
      <Field label="提交说明" required>
        <Textarea name="note" rows={3} placeholder="本次交付的内容要点、相对上一版的调整…" required />
      </Field>
      <Field label="交付物文件" hint="最多 5 个文件，单个不超过 20 MB；PDF、图片、Word、Excel、ZIP">
        <Input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.zip" />
      </Field>
      <Field label="外部交付物链接" hint="已有云盘或在线文档可继续粘贴">
        <Input name="assetRef" placeholder="https:// 开头，可留空" />
      </Field>

      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}
      {state.ok && <p className="text-[13px] text-success">已提交，等待审核。</p>}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton disabled={!placeholderUserName} />
        <p className="text-[13px] text-secondary">
          {placeholderUserName ? (
            <>
              提交人：<span className="font-medium text-primary">{placeholderUserName}</span>
              （P4 接登录后自动切换为登录人）
            </>
          ) : (
            <span className="text-danger">
              未找到 designer 角色用户，无法确定提交人（请先运行 seed 初始化用户）
            </span>
          )}
        </p>
      </div>
    </form>
  );
}
