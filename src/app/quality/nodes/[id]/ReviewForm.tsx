"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button, Field, Textarea, Select } from "@/core/ui";
import { reviewNodeAction, type ReviewNodeFormState } from "@/app/quality/actions";

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
 * 节点审核操作区（M7-b）：仅 status==="submitted" 且占位审核用户存在时渲染。
 * 「通过」直接确认（文案说明后态）；「退回」内联展开：原因 textarea（必填）
 * + 严重度 select（轻微/一般/严重，默认一般）+ [确认退回]。
 * 前端拦 + 后端再拦双保险（reviewNode 服务层守卫）。
 * 审核人 = 占位当前用户 kind="review"（PM，缺则 inspector）。
 */
export function ReviewForm({
  nodeId,
  placeholderUserName,
}: {
  nodeId: string;
  placeholderUserName: string | null;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [state, formAction] = useFormState<ReviewNodeFormState, FormData>(
    reviewNodeAction,
    {}
  );

  if (state.ok) {
    return <p className="text-[13px] text-success">已处理，页面正在刷新…</p>;
  }

  const noUser = !placeholderUserName;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="nodeId" value={nodeId} />
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
          <p className="text-[13px] leading-relaxed text-primary">
            确认通过此验收节点？通过后节点状态将转为「已通过」，付款联动将在财务模块（M8）接入。
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
          <Field label="退回原因" required hint="必填，将据此自动建立质量问题">
            <Textarea
              name="reason"
              rows={3}
              placeholder="说明退回的具体问题、整改要求…"
              required
            />
          </Field>
          <Field label="问题严重度" required>
            <Select name="severity" defaultValue="normal" className="max-w-[12rem]">
              <option value="minor">轻微</option>
              <option value="normal">一般</option>
              <option value="major">严重</option>
            </Select>
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
          未找到 pm/inspector 角色用户，无法确定审核人（请先运行 seed 初始化用户）
        </p>
      )}
    </form>
  );
}
