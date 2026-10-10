"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Modal } from "@/core/ui";
import {
  clearScheduleAction,
  type ScheduleActionState,
} from "@/modules/schedule/actions";

function ClearSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "清空中…" : "确认清空"}
    </Button>
  );
}

/**
 * 清空排程入口（M6-b）：次级文字按钮 + Modal 二次确认。
 * 成功后页面 revalidate 重渲为空态（本按钮随 hasTasks=false 卸载）；
 * 失败把错误信息回传 Modal 内展示，不抛白屏。
 */
export function ClearScheduleButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ScheduleActionState, FormData>(
    clearScheduleAction,
    {}
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-inner border border-line px-3 text-[13px] text-secondary whitespace-nowrap transition-colors hover:bg-sunken hover:text-primary"
      >
        清空排程
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="确认清空排程">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-[15px] leading-relaxed text-primary">
            将删除本项目全部工序排程（含依赖关系），此操作不可撤销。
          </p>
          {state.error && (
            <p className="text-[13px] text-danger">{state.error}</p>
          )}
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <ClearSubmitButton />
          </div>
        </form>
      </Modal>
    </div>
  );
}
