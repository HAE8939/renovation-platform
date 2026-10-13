"use client";

/**
 * 线索作废 / 恢复按钮（M10-a 备料三）。
 *
 * 与项目归档的差别只在文案与后果：作废一条线索不会牵动项目/台账，
 * 但**已签约的线索不允许只作废**（会让项目失去来源）——该守卫在服务层，
 * 这里负责把中文原因原样显示出来，不吞。
 */
import { useState, useTransition } from "react";
import { Button } from "@/core/ui";
import { archiveLeadAction } from "@/modules/crm/actions";

interface Props {
  leadId: string;
  leadName: string;
  archived: boolean;
  /** 已签约线索：作废会被服务层拒，界面直接给出去处（归档项目），少一次白点 */
  signed?: boolean;
}

export function LeadArchiveButton({ leadId, leadName, archived, signed }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!archived && !window.confirm(`确认作废线索「${leadName}」？\n作废后不再出现在看板、漏斗与签约率里，可随时恢复。`)) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await archiveLeadAction({}, fd);
      if (res?.error) setError(res.error);
    });
  }

  if (signed && !archived) {
    return (
      <span className="text-[12px] text-muted whitespace-nowrap" title="已签约线索请到项目中心归档项目">
        请到项目中心归档
      </span>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "处理中…" : archived ? "恢复" : "作废"}
      </Button>
      {error && <span className="max-w-[14rem] text-[12px] text-danger">{error}</span>}
    </form>
  );
}
