"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input } from "@/core/ui";
import { createProjectAction, type ProjectFormState } from "./actions";

const initialState: ProjectFormState = {};

interface Props {
  /** 服务端算好的建议编号，避免用户手填 */
  suggestedCode: string;
}

/**
 * 新建项目：Server Action 落库。
 * 展开式表单，成功后跳进项目详情。
 */
export function CreateProjectForm({ suggestedCode }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useFormState<ProjectFormState, FormData>(
    createProjectAction,
    initialState
  );
  const [code, setCode] = useState(suggestedCode);
  const router = useRouter();

  // 成功后跳进新项目
  useEffect(() => {
    if (state.ok && state.projectId) {
      router.push(`/budget/${state.projectId}`);
    }
  }, [state, router]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">新建项目</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "收起" : "展开表单"}
        </Button>
      </div>

      {open && (
        <Card className="mt-3">
          <form action={formAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="项目名称" required>
              <Input name="name" placeholder="如：云栖名邸 3 栋 1602" required />
            </Field>
            <Field label="客户名称" required hint="不存在时自动创建客户">
              <Input name="clientName" placeholder="如：陈女士" required />
            </Field>
            <Field label="项目编号" hint="留空自动生成">
              <Input name="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            {/* step 必须到 0.01：面积与单方造价按两位小数记账，
                step="0.1" 会让浏览器以 step mismatch 静默拦下 89.55 这类合法值（表单根本不提交）。 */}
            <Field label="建筑面积（㎡）" required>
              <Input
                name="area"
                type="number"
                min="0"
                step="0.01"
                placeholder="如：128.6"
                required
              />
            </Field>
            <Field label="设计师">
              <Input name="designer" placeholder="选填" />
            </Field>
            <Field label="项目经理">
              <Input name="pm" placeholder="选填" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="项目地址">
                <Input name="address" placeholder="选填" />
              </Field>
            </div>

            <div className="flex items-center gap-4 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? "保存中…" : "创建项目"}
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
                取消
              </Button>
              {state.error && <span className="text-sm text-danger">{state.error}</span>}
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
