"use client";

/**
 * 项目归档 / 恢复按钮（M10-a 备料三）。
 *
 * 为什么单独一个客户端组件：归档需要「确认」这一步（点了就全站口径变化），
 * 而表格是服务端渲染的，没有客户端组件挂不住 onSubmit + confirm。
 * 形态守 §6：默认无阴影、气声描边、ghost 小按钮，不抢视觉重量。
 */
import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { Button } from "@/core/ui";
import { archiveProjectAction, restoreProjectAction, type ArchiveState } from "./actions";

interface Props {
  projectId: string;
  /** 项目名，只用于确认文案——员工得看清自己要归档的是哪一单 */
  projectName: string;
  archived: boolean;
  /**
   * 未闭环事项（M10-c「归档允许但提示」，HAE 拍板）：还有问题没整改、款没收齐时，
   * 确认框要**如实列出来**——归档是合法动作，但必须知情。数据一律保留，这里只负责说清楚。
   */
  unclosed?: { issues: number; unpaidSegs: number; unpaidAmount: number };
}

/** 确认文案：先说后果（从哪些视野消失、钱仍算数），再列未闭环事项。 */
function archiveConfirmText(
  name: string,
  unclosed?: { issues: number; unpaidSegs: number; unpaidAmount: number }
) {
  const NL = String.fromCharCode(10);
  const money = (n: number) =>
    "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const head =
    `确认归档「${name}」？` +
    NL + NL +
    "归档后这一单从「需要你处理」、项目健康度与各类待办视野里消失；" +
    "它已发生的钱（已收、支出、合同额、毛利）仍照常计入报表——" +
    "归档改变的是「还要做什么」，不是「发生过什么」。数据全部保留，可随时恢复。";
  if (!unclosed) return head + NL + NL + "（未闭环事项明细未取到；归档仍会照常保留全部数据。）";
  const bits = [
    unclosed.issues > 0 ? `${unclosed.issues} 个未整改质量问题` : null,
    unclosed.unpaidSegs > 0
      ? `${unclosed.unpaidSegs} 段款未收（应收 ${money(unclosed.unpaidAmount)}）`
      : null,
  ].filter(Boolean);
  if (bits.length === 0) return head + NL + NL + "该项目没有未闭环事项。";
  return head + NL + NL + "注意：这个项目还有 " + bits.join("、") + "。归档不会清掉它们，只是不再提醒你。";
}

export function ArchiveButton({ projectId, projectName, archived, unclosed }: Props) {
  const [pending, start] = useTransition();
  const [state, formAction] = useFormState<ArchiveState, FormData>(
    archived ? restoreProjectAction : archiveProjectAction,
    {}
  );
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // 文案必须走 archiveConfirmText：旧版那句「不再计入驾驶舱、财务与质量口径」
    // 与 M10-c 的「钱按事实」直接矛盾（已收/支出/毛利仍照常计入），验收 s12 实见。
    if (!archived && !window.confirm(archiveConfirmText(projectName, unclosed))) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await (archived ? restoreProjectAction({}, fd) : archiveProjectAction({}, fd));
      if (res?.error) setError(res.error);
    });
  }

  const msg = error ?? state?.error;

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "处理中…" : archived ? "恢复" : "归档"}
      </Button>
      {msg && <span className="text-[12px] text-danger">{msg}</span>}
    </form>
  );
}
