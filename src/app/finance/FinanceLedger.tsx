"use client";

import { useState } from "react";
import { Badge, Card, Table, Th, Td } from "@/core/ui";
import { formatCny } from "@/core/domain/pricing";
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
} from "@/modules/finance/status";
import type { FinanceCategory } from "@/modules/finance/types";
import type { FinanceRecordRow } from "@/modules/finance/server/records";
import { RecordDrawer } from "./RecordDrawer";

/** 仅日期。Date 可能由 RSC 序列化传入，统一兜底。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * 收支台账表格 + 抽屉（客户端，仿 IssueLedger）。
 * 行点击打开右侧抽屉；抽屉与表同级，避免非法嵌套。
 * 数据由服务端 page 传入（FinanceRecordRow 已含抽屉所需全部字段）。
 * 表格列保持 M8-a 六列（日期/科目/摘要/项目/金额/录入人），只加行可点开。
 */
export function FinanceLedger({ rows }: { rows: FinanceRecordRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const current =
    openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <>
      <Card padded={false} className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th>日期</Th>
              <Th>科目</Th>
              <Th>摘要</Th>
              <Th>项目</Th>
              <Th align="right">金额</Th>
              <Th>录入人</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="cursor-pointer hover:bg-canvas"
              >
                <Td className="num text-secondary whitespace-nowrap">
                  {formatDate(r.date)}
                </Td>
                <Td>
                  <Badge
                    variant={
                      CATEGORY_TONE[r.category as FinanceCategory] ?? "neutral"
                    }
                  >
                    {CATEGORY_LABEL[r.category as FinanceCategory] ?? r.category}
                  </Badge>
                </Td>
                <Td className="text-primary">
                  <span
                    className="block max-w-[18rem] truncate"
                    title={r.description}
                  >
                    {r.description || "—"}
                  </span>
                </Td>
                <Td className="text-secondary">{r.projectName}</Td>
                <Td
                  align="right"
                  className="num whitespace-nowrap font-medium text-primary"
                >
                  {formatCny(r.amount)}
                </Td>
                <Td className="text-secondary">
                  {r.recordedByName ?? "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <RecordDrawer
        record={current}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
