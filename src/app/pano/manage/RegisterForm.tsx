"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/core/ui";
import { registerPanoTourAction, type PanoFormState } from "@/modules/pano/actions";

interface DirOption {
  /** 提交的就是目录名本身，服务端再对它做一次安全校验。 */
  value: string;
  label: string;
}

interface ProjectOption {
  id: string;
  label: string;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "登记中…" : "登记导览"}
    </Button>
  );
}

/**
 * 登记表单。目录下拉由服务端扫描结果喂进来（客户端不去猜磁盘上有什么），
 * 因此这里只负责提交与回显错误；真正的“这个目录能不能登记”判断全在服务层。
 */
export function RegisterForm({
  dirs,
  projects,
  dirsEmpty,
}: {
  dirs: DirOption[];
  projects: ProjectOption[];
  dirsEmpty: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState<PanoFormState, FormData>(registerPanoTourAction, {});

  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  if (dirsEmpty) {
    return (
      <p className="text-[13px] leading-relaxed text-secondary">
        暂时没有可登记的目录。先在本地导出导览，把解压后的整个目录放进服务器的{" "}
        <code className="font-mono text-[13px]">public/uploads/pano/</code> 下，再点右上角“重新扫描”。
      </p>
    );
  }

  return (
    <form ref={form} action={formAction} className="max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="导览目录" required>
          <Select name="dirName" defaultValue={dirs[0]?.value} required>
            {dirs.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="挂到项目" hint="留空=先登记，稍后再挂；未挂项目的导览会归进“未关联项目”">
          <Select name="projectId" defaultValue="">
            <option value="">暂不关联</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="展示标题" hint="留空则自动取导览包里写的标题">
        <Input name="title" placeholder="如：保利天悦 竣工全景" maxLength={80} />
      </Field>
      <Field label="备注" hint="给同事看的一句话，如“客户已确认，可用于内部演示”">
        <Textarea name="note" rows={2} maxLength={200} />
      </Field>
      <div className="flex items-center gap-4">
        <SubmitButton disabled={false} />
        {state.error && <span className="text-[13px] text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
