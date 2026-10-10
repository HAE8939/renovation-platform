"use client";

import { useState, useTransition } from "react";
import { Button, Input, Table, Td, Th } from "@/core/ui";
import { AREA_TIERS, AREA_TIER_LABEL } from "@/modules/schedule/plan";
import type { AreaTier } from "@/modules/schedule/types";
import {
  updateTemplateDaysAction,
  type ScheduleActionState,
} from "@/modules/schedule/actions";
import type { TemplateMatrix, TemplateRow } from "@/modules/schedule/server/templates";

type RowFeedback = { type: "error" | "success"; msg: string };

const EMPTY_ACTION: ScheduleActionState = {};

/**
 * 工序模板编辑器（M6-d，客户端）。
 * 表 = 11 行 × 列【工序 | 90㎡以下 | 90-130㎡ | 130㎡以上 | 操作】。
 * 每格一个数字输入（外层 w-24 容器定宽，Input 基类带 w-full 故只由外层控宽）；
 * 行级 [保存] 三格一起提交（走 updateTemplateDaysAction）；
 * pending 期间所有保存按钮禁用；行内内联错误 / 成功提示（12px）。
 *
 * 仿 budget/catalog/CatalogEditor 的 useTransition + 手动 FormData 范式，
 * 而非 useFormState：表格行内做独立 <form> 会破坏 <table> 结构，故统一在
 * transition 内手工拼 FormData 调 server action。
 */
export function TemplateEditor({ matrix }: { matrix: TemplateMatrix }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    Record<number, RowFeedback | undefined>
  >({});

  // 本地编辑态：order → tier → 字符串值（受控输入）。初始化自 matrix；
  // 保存成功后页面 revalidate 重渲，matrix 更新但 edits 已与所存值一致，无需重同步。
  const [edits, setEdits] = useState<Record<number, Record<AreaTier, string>>>(
    () => {
      const init: Record<number, Record<AreaTier, string>> = {};
      for (const row of matrix.rows) {
        init[row.order] = {
          lt90: row.days.lt90.days?.toString() ?? "",
          b90_130: row.days.b90_130.days?.toString() ?? "",
          gt130: row.days.gt130.days?.toString() ?? "",
        };
      }
      return init;
    }
  );

  function handleChange(order: number, tier: AreaTier, value: string) {
    setEdits((prev) => ({
      ...prev,
      [order]: { ...prev[order], [tier]: value },
    }));
    // 用户重新编辑该行 → 清该行旧的错误 / 成功提示
    if (feedback[order]) {
      setFeedback((prev) => ({ ...prev, [order]: undefined }));
    }
  }

  function handleSave(row: TemplateRow) {
    const cur = edits[row.order] ?? { lt90: "", b90_130: "", gt130: "" };
    startTransition(async () => {
      const fd = new FormData();
      for (const tier of AREA_TIERS) {
        fd.set(`id_${tier}`, row.days[tier].id ?? "");
        fd.set(`days_${tier}`, cur[tier] ?? "");
      }
      const result = await updateTemplateDaysAction(EMPTY_ACTION, fd);
      setFeedback((prev) => ({
        ...prev,
        [row.order]: result.error
          ? { type: "error", msg: result.error }
          : { type: "success", msg: "已保存" },
      }));
    });
  }

  if (matrix.rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">暂无模板数据</p>
        <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-secondary">
          模板尚未初始化。请先执行数据库 seed 生成 11 工序 × 3 档的标准工期模板。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {matrix.hasMissing && (
        <p className="rounded-inner border border-warning bg-surface px-3 py-2 text-[13px] text-warning">
          部分面积档的模板行缺失，对应单元格不可编辑。请补齐 seed 数据。
        </p>
      )}

      <Table>
        <thead>
          <tr>
            <Th>工序</Th>
            {AREA_TIERS.map((tier) => (
              <Th key={tier} align="right">
                {AREA_TIER_LABEL[tier]}
              </Th>
            ))}
            <Th align="right">操作</Th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const fb = feedback[row.order];
            return (
              <tr key={row.order} className="hover:bg-canvas">
                <Td>
                  <span className="num text-[13px] text-secondary">
                    {row.order}
                  </span>
                  <span className="ml-2 text-[13px] font-medium text-primary">
                    {row.name}
                  </span>
                </Td>
                {AREA_TIERS.map((tier) => {
                  const cell = row.days[tier];
                  const editable = cell.id !== null;
                  const value = edits[row.order]?.[tier] ?? "";
                  return (
                    <Td key={tier} align="right">
                      {editable ? (
                        <div className="flex justify-end">
                          <div className="w-24">
                            <Input
                              type="number"
                              min={1}
                              max={999}
                              step={1}
                              value={value}
                              onChange={(e) =>
                                handleChange(row.order, tier, e.target.value)
                              }
                              compact
                              className="text-right"
                              aria-label={`${row.name} · ${AREA_TIER_LABEL[tier]} 天数`}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </Td>
                  );
                })}
                <Td align="right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSave(row)}
                      disabled={pending}
                    >
                      {pending ? "保存中…" : "保存"}
                    </Button>
                    {fb && (
                      <span
                        className={`whitespace-nowrap text-[12px] ${
                          fb.type === "error"
                            ? "text-danger"
                            : "text-success"
                        }`}
                      >
                        {fb.msg}
                      </span>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <p className="text-[13px] text-muted">
        每行单独保存；天数须为 1–999 的整数。
      </p>
    </div>
  );
}
