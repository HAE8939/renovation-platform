"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Modal, Select, Textarea } from "@/core/ui";
import {
  movePanoTourAction,
  setPanoTourStatusAction,
  unregisterPanoTourAction,
  updatePanoTourAction,
  type PanoActionResult,
  type PanoFormState,
} from "@/modules/pano/actions";
import { PANO_STATUS } from "@/modules/pano/types";
import type { PanoTourView } from "@/modules/pano/server/tours";

interface Option {
  id: string;
  label: string;
}

function EditSubmit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</Button>;
}

function RemoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "处理中…" : "确认解除登记"}
    </Button>
  );
}

/**
 * 一行登记的全部管理动作：次序、上下架、编辑、解除登记。
 *
 * 两个决定要记一下：
 * ① **目录名不可编辑**。它是库记录与磁盘目录之间唯一的锚，允许改就等于允许失联
 *    （改完指向一个不存在的目录，或跟另一条撞名）。要换目录走“解除登记 → 移文件 → 再登记”。
 * ② **解除登记必须用文字讲清不删文件**。这个动作的名字听起来像删除，而它只摘库里一行；
 *    只靠红色表达危险，色盲同事和打印出来的纸都看不见（AGENTS §4.2/§4.3 同一条纪律）。
 */
export function TourRowActions({ tour, projects }: { tour: PanoTourView; projects: Option[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [editState, editAction] = useFormState<PanoFormState, FormData>(updatePanoTourAction, {});
  const [removeState, removeAction] = useFormState<PanoFormState, FormData>(unregisterPanoTourAction, {});

  useEffect(() => {
    if (editState.ok) setEditOpen(false);
  }, [editState]);

  useEffect(() => {
    if (removeState.ok) {
      setRemoveOpen(false);
      router.refresh();
    }
  }, [removeState, router]);

  function run(action: (fd: FormData) => Promise<PanoActionResult>, fields: Record<string, string>) {
    setErr(null);
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      const res = await action(fd);
      if (res?.error) setErr(res.error);
      else router.refresh();
    });
  }

  const published = tour.status === PANO_STATUS.published;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={isPending} onClick={() => run(movePanoTourAction, { id: tour.id, direction: "up" })}>
        上移
      </Button>
      <Button variant="secondary" size="sm" disabled={isPending} onClick={() => run(movePanoTourAction, { id: tour.id, direction: "down" })}>
        下移
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() =>
          run(setPanoTourStatusAction, {
            id: tour.id,
            status: published ? PANO_STATUS.hidden : PANO_STATUS.published,
          })
        }
      >
        {published ? "下架" : "上架"}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => { setErr(null); setEditOpen(true); }}>
        编辑
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setErr(null); setRemoveOpen(true); }}>
        解除登记
      </Button>
      {err && <span className="text-[13px] text-danger">{err}</span>}

      {editOpen && (
        <Modal open onClose={() => setEditOpen(false)} title={`编辑导览：${tour.title}`}>
          <form action={editAction} className="space-y-4">
            <input type="hidden" name="id" value={tour.id} />
            <Field label="展示标题" required>
              <Input name="title" defaultValue={tour.title} maxLength={80} required />
            </Field>
            <Field label="挂到项目" hint="选“暂不关联”会把这条挪到归纳页的“未关联项目”组">
              <Select name="projectId" defaultValue={tour.projectId ?? ""}>
                <option value="">暂不关联</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="场景数" hint={`当前记录：${tour.sceneCount > 0 ? tour.sceneCount : "未记录"}。托管版导出包里没有 project.json，只能手工填`}>
              <Input name="sceneCount" type="number" min={0} max={999} defaultValue={tour.sceneCount > 0 ? String(tour.sceneCount) : ""} placeholder="留空=不改动" />
            </Field>
            <Field label="备注">
              <Textarea name="note" rows={3} maxLength={200} defaultValue={tour.note ?? ""} />
            </Field>
            <Field label="磁盘目录" hint="目录名不可修改：它是这条登记与磁盘文件之间唯一的锚。要换目录请先解除登记、移动文件、再重新登记">
              <Input value={`uploads/pano/${tour.dirName}`} readOnly disabled className="font-mono text-[13px]" />
            </Field>
            <div className="flex items-center gap-4">
              <EditSubmit />
              {editState.error && <span className="text-[13px] text-danger">{editState.error}</span>}
            </div>
          </form>
        </Modal>
      )}

      {removeOpen && (
        <Modal open onClose={() => setRemoveOpen(false)} title="解除这条登记？">
          <form action={removeAction} className="space-y-4">
            <input type="hidden" name="id" value={tour.id} />
            <p className="text-[15px] leading-relaxed text-primary">
              将从平台摘掉「{tour.title}」这一条登记。
            </p>
            <p className="text-[13px] leading-relaxed text-secondary">
              <span className="font-medium text-danger">注意：这不是删除文件。</span>{" "}
              磁盘上的 <code className="font-mono text-[13px]">uploads/pano/{tour.dirName}</code>{" "}
              与其中所有切片都会原样保留，重新扫描后随时可以再登记回来。
              要真正腾出磁盘空间，需要到服务器上人工删除该目录。
            </p>
            <div className="flex items-center gap-4">
              <RemoveSubmit />
              <Button variant="secondary" onClick={() => setRemoveOpen(false)}>
                取消
              </Button>
              {removeState.error && <span className="text-[13px] text-danger">{removeState.error}</span>}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
