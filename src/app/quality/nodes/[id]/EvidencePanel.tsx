"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Field } from "@/core/ui";
import {
  deleteEvidenceAction,
  uploadEvidenceAction,
  type EvidenceActionFormState,
} from "@/app/quality/actions";
import type { EvidenceItem } from "@/modules/quality/server/evidence";

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "上传中…" : "上传证据"}
    </Button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "删除中…" : "删除"}
    </Button>
  );
}

export function EvidencePanel({
  nodeId,
  evidence,
  viewerId,
}: {
  nodeId: string;
  evidence: EvidenceItem[];
  viewerId: string | null;
}) {
  const [uploadState, uploadAction] = useFormState<EvidenceActionFormState, FormData>(
    uploadEvidenceAction,
    {},
  );
  const [deleteState, deleteAction] = useFormState<EvidenceActionFormState, FormData>(
    deleteEvidenceAction,
    {},
  );

  return (
    <section className="rounded-card border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">现场证据</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-secondary">
            节点最多保留 9 张 JPG / PNG 图片，单张不超过 5 MB。
          </p>
        </div>
        <span className="num text-[12px] text-muted">{evidence.length}/9</span>
      </div>

      {evidence.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {evidence.map((item) => (
            <figure key={item.id} className="min-w-0 border border-line bg-canvas p-2">
              {/* 证据图走原生 <img>：standalone 无 sharp，next/image 优化会在生产报错；
                  且证据是手机原片，任何有损优化都可能改动呈像——验收凭证宁可不处理。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.originalName}
                className="aspect-square w-full object-cover"
              />
              <figcaption className="mt-2 min-w-0">
                <p className="truncate text-[12px] text-primary" title={item.originalName}>
                  {item.originalName}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {item.uploaderName ?? "未知上传人"} · {Math.ceil(item.size / 1024)} KB
                </p>
                {viewerId && item.uploadedBy === viewerId ? (
                  <form
                    action={deleteAction}
                    className="mt-2"
                    onSubmit={(event) => {
                      if (!window.confirm(`确认删除证据「${item.originalName}」？`)) event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="evidenceId" value={item.id} />
                    <DeleteButton />
                  </form>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[13px] leading-relaxed text-secondary">尚未上传现场证据。</p>
      )}

      {evidence.length < 9 ? (
        <form action={uploadAction} className="mt-6 space-y-4 border-t border-line pt-6">
          <input type="hidden" name="nodeId" value={nodeId} />
          <Field label="上传图片" hint="仅支持 JPG / PNG，单张不超过 5 MB。">
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png"
              required
              className="block w-full text-sm text-primary file:mr-3 file:rounded-inner file:border-0 file:bg-sunken file:px-3 file:py-2 file:text-sm file:text-primary"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <UploadButton />
            {uploadState.error ? <p className="text-[13px] text-danger">{uploadState.error}</p> : null}
            {uploadState.ok ? <p className="text-[13px] text-success">已上传，页面正在刷新…</p> : null}
          </div>
        </form>
      ) : null}
      {deleteState.error ? <p className="mt-3 text-[13px] text-danger">{deleteState.error}</p> : null}
      {deleteState.ok ? <p className="mt-3 text-[13px] text-success">已删除，页面正在刷新…</p> : null}
    </section>
  );
}
