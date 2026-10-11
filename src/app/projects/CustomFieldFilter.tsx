"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/core/ui";
import { FIELD_TYPE_LABEL } from "@/core/domain/customField";
import type { FieldDef } from "@/core/domain/customFieldRepo";

/**
 * 项目列表的自定义字段筛选器（M9-c c-2，client）。
 *
 * - 每个在用定义一行控件：单行/多行文本＝一个框（包含）；数字与日期＝两个框（区间，
 *   可只填一端）；单选＝下拉（精确）。**控件形态由定义的 type 决定，前端不猜类型**。
 * - 深链约定（与 core 的 buildFiltersFromParams 对齐）：
 *   `?cfv=<key>:<值或下界>`、`?cfvto=<key>:<上界>`，可各多条；key 用字段标识而非 cuid，
 *   链接可读也能长期分享。
 * - 点「应用筛选」才写 URL（边打字边跳会打断输入，也会把半成品条件当成筛选）。
 * - 本期条件之间是"且"（同时满足），不做"或"。
 */
export interface CustomFieldFilterProps {
  defs: FieldDef[];
}

export function CustomFieldFilter({ defs }: CustomFieldFilterProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);

  // 初值从 URL 回填（刷新或分享链接后控件里能看到当前条件）
  const initial = () => {
    const lo: Record<string, string> = {};
    const hi: Record<string, string> = {};
    for (const raw of params?.getAll("cfv") ?? []) {
      const i = raw.indexOf(":");
      if (i > 0) lo[raw.slice(0, i)] = raw.slice(i + 1);
    }
    for (const raw of params?.getAll("cfvto") ?? []) {
      const i = raw.indexOf(":");
      if (i > 0) hi[raw.slice(0, i)] = raw.slice(i + 1);
    }
    return { lo, hi };
  };
  const [draft, setDraft] = useState(initial);

  if (defs.length === 0) return null;

  async function apply() {
    setPending(true);
    const sp = new URLSearchParams(params?.toString() ?? "");
    sp.delete("cfv");
    sp.delete("cfvto");
    for (const d of defs) {
      const lo = (draft.lo[d.key] ?? "").trim();
      const hi = (draft.hi[d.key] ?? "").trim();
      if (lo !== "") sp.append("cfv", `${d.key}:${lo}`);
      if (hi !== "") sp.append("cfvto", `${d.key}:${hi}`);
    }
    const qs = sp.toString();
    router.push(qs ? `/projects?${qs}` : "/projects");
    setPending(false);
  }

  function clear() {
    setDraft({ lo: {}, hi: {} });
    const sp = new URLSearchParams(params?.toString() ?? "");
    sp.delete("cfv");
    sp.delete("cfvto");
    const qs = sp.toString();
    router.push(qs ? `/projects?${qs}` : "/projects");
  }

  const hasAny = defs.some((d) => (draft.lo[d.key] ?? "").trim() || (draft.hi[d.key] ?? "").trim());

  return (
    <div className="mt-3 border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-medium text-secondary">按自定义字段筛选</h3>
        <div className="flex items-center gap-3">
          {hasAny && (
            <Button type="button" variant="ghost" onClick={clear}>
              清除
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => void apply()} disabled={pending}>
            {pending ? "筛选中…" : "应用筛选"}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {defs.map((d) => (
          <label key={d.id} className="block min-w-0">
            <span className="mb-1 block text-xs text-secondary">
              {d.label}
              <span className="ml-1 text-muted">（{FIELD_TYPE_LABEL[d.type]}）</span>
            </span>
            {d.type === "select" ? (
              <Select
                value={draft.lo[d.key] ?? ""}
                onChange={(e) =>
                  setDraft({ lo: { ...draft.lo, [d.key]: e.target.value }, hi: draft.hi })
                }
              >
                <option value="">全部</option>
                {d.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : d.type === "number" || d.type === "date" ? (
              <span className="flex items-center gap-2">
                <Input
                  compact
                  type={d.type === "number" ? "number" : "date"}
                  step={d.type === "number" ? "any" : undefined}
                  placeholder="最小"
                  value={draft.lo[d.key] ?? ""}
                  onChange={(e) =>
                    setDraft({ lo: { ...draft.lo, [d.key]: e.target.value }, hi: draft.hi })
                  }
                />
                <span className="text-xs text-muted">~</span>
                <Input
                  compact
                  type={d.type === "number" ? "number" : "date"}
                  step={d.type === "number" ? "any" : undefined}
                  placeholder="最大"
                  value={draft.hi[d.key] ?? ""}
                  onChange={(e) =>
                    setDraft({ lo: draft.lo, hi: { ...draft.hi, [d.key]: e.target.value } })
                  }
                />
              </span>
            ) : (
              <Input
                compact
                placeholder="包含…"
                value={draft.lo[d.key] ?? ""}
                onChange={(e) =>
                  setDraft({ lo: { ...draft.lo, [d.key]: e.target.value }, hi: draft.hi })
                }
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
