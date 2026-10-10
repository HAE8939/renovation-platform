"use client";

import { useState } from "react";
import { Badge, Card, Table, Th, Td } from "@/core/ui";
import {
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  issueSeverityTone,
  issueStatusTone,
} from "@/modules/quality/status";
import type { IssueRow } from "@/modules/quality/server/issues";
import { IssueDrawer } from "./IssueDrawer";

/** 仅日期（截止 / 报告时间用）。Date 可能由 RSC 序列化传 入，统一兜底。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 截止日期是否逾期（早于今天且未关闭）。 */
function isOverdue(due: Date | null, status: string): boolean {
  if (!due || status === "closed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due).getTime() < today.getTime();
}

/**
 * 问题台账表格 + 抽屉（客户端，仿 crm LeadsTable 结构）。
 * 行点击打开右侧抽屉；抽屉与表同级，避免非法嵌套。
 * 数据由服务端 page 传入（IssueRow 已含抽屉所需全部字段）。
 */
export function IssueLedger({ issues }: { issues: IssueRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const current = openId ? issues.find((i) => i.id === openId) ?? null : null;

  return (
    <>
      <Card padded={false} className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th>问题</Th>
              <Th>项目</Th>
              <Th>严重度</Th>
              <Th>状态</Th>
              <Th>责任人</Th>
              <Th align="right">截止</Th>
              <Th align="right">报告时间</Th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => {
              const overdue = isOverdue(i.dueDate, i.status);
              return (
                <tr
                  key={i.id}
                  onClick={() => setOpenId(i.id)}
                  className="cursor-pointer hover:bg-canvas"
                >
                  <Td className="font-medium text-primary">
                    <span
                      className="block max-w-[18rem] truncate"
                      title={i.title}
                    >
                      {i.title}
                    </span>
                  </Td>
                  <Td className="text-secondary">{i.projectName}</Td>
                  <Td>
                    <Badge variant={issueSeverityTone(i.severity)}>
                      {ISSUE_SEVERITY_LABEL[
                        i.severity as keyof typeof ISSUE_SEVERITY_LABEL
                      ] ?? i.severity}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={issueStatusTone(i.status)}>
                      {ISSUE_STATUS_LABEL[
                        i.status as keyof typeof ISSUE_STATUS_LABEL
                      ] ?? i.status}
                    </Badge>
                  </Td>
                  <Td className="text-secondary">{i.assigneeName ?? "—"}</Td>
                  <Td
                    align="right"
                    className={`num whitespace-nowrap ${
                      overdue ? "text-danger font-medium" : "text-secondary"
                    }`}
                  >
                    {formatDate(i.dueDate)}
                  </Td>
                  <Td
                    align="right"
                    className="num text-secondary whitespace-nowrap"
                  >
                    {formatDate(i.createdAt)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <IssueDrawer
        issue={current}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
