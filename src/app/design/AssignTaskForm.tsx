"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/core/ui";
import {
  assignDesignTaskAction,
  type DesignAssignFormState,
} from "@/modules/design/actions";
import type { DesignUserOption } from "@/modules/design/server/create";

/**
 * 任务详情页的“指派 / 改派”内联表单（M5-e）。
 * 仅在 canAssign 状态（待分配 / 进行中 / 待返修）由服务端渲染；已提交/已通过不出现。
 * 选负责人 → 指派，成功刷新页面（看板与详情同步）；错误红字回显。
 * 默认选中当前负责人（改派直观可见现在是谁）。
 */
export function AssignTaskForm({
  taskId,
  currentAssigneeId,
  users,
}: {
  taskId: string;
  currentAssigneeId: string | null;
  users: DesignUserOption[];
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<DesignAssignFormState, FormData>(
    assignDesignTaskAction,
    {}
  );
  const [selected, setSelected] = useState(currentAssigneeId ?? "");

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
      <input type="hidden" name="taskId" value={taskId} />
      <Select
        name="assigneeId"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="max-w-[14rem]"
      >
        <option value="" disabled>
          选择负责人
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      <AssignSubmitButton />
      {state.error && (
        <span className="text-[13px] text-danger">{state.error}</span>
      )}
    </form>
  );
}

function AssignSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "指派中…" : "指派"}
    </Button>
  );
}
