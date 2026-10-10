"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Badge, Button, Field, Input, Textarea, Th, Td, Table } from "@/core/ui";
import { submitNodeAction, type SubmitNodeFormState } from "@/app/quality/actions";

interface CheckRow {
  id: string;
  name: string;
  standard: string;
  order: number;
  result: string | null;
  note: string;
}

function SubmitButton({
  disabled,
  placeholderUserName,
}: {
  disabled: boolean;
  placeholderUserName: string | null;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled || !placeholderUserName}>
      {pending ? "提交中…" : "提交验收"}
    </Button>
  );
}

/**
 * 验收检查项提交表单（M7-b）。
 *
 * 提交模式 = canSubmitNode(status) 且（returned 时）canResubmitAfterReturn：
 * 每行 通过/不通过 单选 + 备注输入；底部提交说明 textarea + [提交验收]。
 * 客户端：全部检查项已选才能点提交（按钮 disabled），服务端仍守卫覆盖率。
 *
 * 表单字段：check_<id>_result（radio pass|fail，未选不提交）+ check_<id>_note。
 * 提交人 = 占位当前用户（P4 接登录后换登录人）；无占位用户时禁用提交。
 */
export function SubmitChecksForm({
  nodeId,
  checks,
  placeholderUserName,
}: {
  nodeId: string;
  checks: CheckRow[];
  placeholderUserName: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction] = useFormState<SubmitNodeFormState, FormData>(
    submitNodeAction,
    {}
  );

  const allFilled = useMemo(
    () => checks.length > 0 && selected.size === checks.length,
    [checks.length, selected.size]
  );

  // 空清单工序可直接提交（§1-3：空清单要能提交，诚实显示）
  const canSubmit = checks.length === 0 || allFilled;

  if (state.ok) {
    return <p className="text-[13px] text-success">已提交，等待审核，页面正在刷新…</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="nodeId" value={nodeId} />

      {checks.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-secondary">
          该工序暂无检查项，可直接提交验收。
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>检查项</Th>
              <Th>标准</Th>
              <Th>结果</Th>
              <Th>备注</Th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => {
              const picked = selected.has(c.id);
              return (
                <tr key={c.id}>
                  <Td className="font-medium text-primary whitespace-nowrap">{c.name}</Td>
                  <Td className="text-secondary text-[13px]">{c.standard}</Td>
                  <Td>
                    <div className="flex items-center gap-4 whitespace-nowrap">
                      <label className="inline-flex items-center gap-2 text-[13px] text-primary">
                        <input
                          type="radio"
                          name={`check_${c.id}_result`}
                          value="pass"
                          className="accent-[var(--accent)]"
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              next.add(c.id);
                              return next;
                            });
                          }}
                        />
                        通过
                      </label>
                      <label className="inline-flex items-center gap-2 text-[13px] text-primary">
                        <input
                          type="radio"
                          name={`check_${c.id}_result`}
                          value="fail"
                          className="accent-[var(--accent)]"
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              next.add(c.id);
                              return next;
                            });
                          }}
                        />
                        不通过
                      </label>
                    </div>
                  </Td>
                  <Td>
                    <Input
                      name={`check_${c.id}_note`}
                      placeholder="备注（可留空）"
                      compact
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Field label="提交说明" required>
        <Textarea
          name="submitNote"
          rows={3}
          placeholder="本次验收的整体说明、特殊情况备注…"
          required
        />
      </Field>

      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton
          disabled={!canSubmit}
          placeholderUserName={placeholderUserName}
        />
        <p className="text-[13px] text-secondary">
          {placeholderUserName ? (
            <>
              提交人：<span className="font-medium text-primary">{placeholderUserName}</span>
              （P4 接登录后自动切换为登录人）
            </>
          ) : (
            <span className="text-danger">
              未找到 inspector/pm 角色用户，无法确定提交人（请先运行 seed 初始化用户）
            </span>
          )}
        </p>
        {checks.length > 0 && !allFilled && (
          <Badge variant="neutral">
            已选 {selected.size}/{checks.length}
          </Badge>
        )}
      </div>
    </form>
  );
}
