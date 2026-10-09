"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/core/ui";
import { PROJECT_STATUS_ORDER, PROJECT_STATUS_LABEL } from "@/core/domain/types";

/** 按 status 下拉筛选；清空回「全部」。写入 ?status= 以便深链与截图。 */
export function StatusFilter({ value }: { value?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (next: string) => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next) sp.set("status", next);
    else sp.delete("status");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="whitespace-nowrap"
    >
      <option value="">全部状态</option>
      {PROJECT_STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {PROJECT_STATUS_LABEL[s]}
        </option>
      ))}
    </Select>
  );
}
