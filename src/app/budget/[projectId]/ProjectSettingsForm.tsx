"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Select } from "@/core/ui";
import { PROJECT_STATUS, PROJECT_STATUS_LABEL, PROJECT_STATUS_ORDER } from "@/core/domain/types";
import type { ProjectStatus } from "@/core/domain/types";
import { updateProjectAction, type ProjectFormState } from "../actions";

export interface ProjectSettingsValues {
  id: string;
  code: string;
  name: string;
  address: string | null;
  area: number;
  status: string;
  designer: string | null;
  pm: string | null;
  clientName: string;
  clientPhone: string | null;
  startDate: string | null;
  endDate: string | null;
  contractAmount: number;
}

const initialState: ProjectFormState = {};

// 顺序严格按 PROJECT_STATUS_ORDER（TS 不会强制数组穷举，故以 ORDER 派生，
// 避免漏加 design / acceptance 两态或顺序错位）。
// **归档态不在这里给选**（M13 体检 M-3）：走这个表单归档既没有"未闭环事项"的知情确认框，
// 也不写 project.archive 流水，而恢复动作正是回读那条流水决定回到哪一态——
// 经此归档的项目将无流水可恢复，只能静默回落 draft。服务层另有守卫兜住绕过。
const STATUS_OPTIONS = (PROJECT_STATUS_ORDER as readonly ProjectStatus[])
  .filter((s) => s !== PROJECT_STATUS.archived)
  .map((s) => ({
    value: s,
    label: PROJECT_STATUS_LABEL[s] ?? s,
  }));

function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 项目基础信息编辑（M1b-B3）。成功后原地提示并跳回详情页。
 * 不动报价 / 金额逻辑。
 */
export function ProjectSettingsForm({ values }: { values: ProjectSettingsValues }) {
  const router = useRouter();
  const [state, formAction, pending] = useFormState<ProjectFormState, FormData>(
    updateProjectAction.bind(null, values.id),
    initialState
  );

  useEffect(() => {
    if (state.ok) {
      router.push(`/budget/${values.id}`);
    }
  }, [state, router, values.id]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">项目设置</h2>
        <Button variant="ghost" size="sm" type="button" onClick={() => router.push(`/budget/${values.id}`)}>
          返回详情
        </Button>
      </div>

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <Field label="项目名称" required>
          <Input name="name" defaultValue={values.name} required />
        </Field>
        <Field
          label="客户名称"
          required
          hint="客户是共享主数据：此处修改会同步到该客户名下所有项目"
        >
          <Input name="clientName" defaultValue={values.clientName} required />
        </Field>
        <Field label="项目编号" required>
          <Input name="code" defaultValue={values.code} required />
        </Field>
        <Field label="客户电话" hint="同样写入共享的客户记录">
          <Input name="clientPhone" defaultValue={values.clientPhone ?? ""} placeholder="选填" />
        </Field>
        {/* step 必须到 0.01：面积与单方造价按两位小数记账，
            step="0.1" 会让浏览器以 step mismatch 静默拦下 89.55 这类合法值 */}
        <Field label="建筑面积（㎡）" required>
          <Input
            name="area"
            type="number"
            min="0"
            step="0.01"
            defaultValue={values.area}
            required
          />
        </Field>
        <Field
          label="合同额（元）"
          hint="0＝未录入；清空＝保存时不改动此列。影响毛利粗算与付款计划生成"
        >
          <Input
            name="contractAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={values.contractAmount ?? 0}
          />
        </Field>
        <Field label="状态">
          {values.status === PROJECT_STATUS.archived ? (
            // 归档项目不渲染 Select：字段不提交时浏览器会把回落的首项交出去，
            // 等于改个地址就把项目悄悄放回全司口径。这里干脆不传 status，
            // 由 updateProject 按“未传＝保持原值”处理。
            <div className="flex h-9 items-center text-[13px] text-muted">
              已归档 · 需先在项目详情页点“恢复”
            </div>
          ) : (
            <Select name="status" defaultValue={values.status}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="设计师">
          <Input name="designer" defaultValue={values.designer ?? ""} placeholder="选填" />
        </Field>
        <Field label="项目经理">
          <Input name="pm" defaultValue={values.pm ?? ""} placeholder="选填" />
        </Field>
        <Field label="工期起">
          <Input name="startDate" type="date" defaultValue={fmtDate(values.startDate)} />
        </Field>
        <Field label="工期止">
          <Input name="endDate" type="date" defaultValue={fmtDate(values.endDate)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="项目地址">
            <Input name="address" defaultValue={values.address ?? ""} placeholder="选填" />
          </Field>
        </div>

        <div className="flex items-center gap-4 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => router.push(`/budget/${values.id}`)}>
            取消
          </Button>
          {state.ok && !state.error && (
            <span className="text-[13px] text-secondary">已保存，正在返回详情…</span>
          )}
          {state.error && <span className="text-[13px] text-danger">{state.error}</span>}
        </div>
      </form>
    </Card>
  );
}
