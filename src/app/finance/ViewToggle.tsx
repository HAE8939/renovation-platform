"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/core/ui";

/** 收入 / 支出 双 Tab 切换。默认收入；切换写入 ?view= 以便深链与截图。
 *  平行复制 crrm/ViewToggle（跨模块禁引组件，TASK_M8 §3）。 */
export function ViewToggle({ view }: { view: "income" | "expense" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: "income" | "expense") => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next === "income") sp.delete("view");
    else sp.set("view", "expense");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">类型</span>
      <div className="flex items-center rounded-inner border border-line bg-surface p-1">
        <Button
          variant={view === "income" ? "secondary" : "ghost"}
          size="sm"
          type="button"
          onClick={() => go("income")}
          className="whitespace-nowrap"
        >
          收入
        </Button>
        <Button
          variant={view === "expense" ? "secondary" : "ghost"}
          size="sm"
          type="button"
          onClick={() => go("expense")}
          className="whitespace-nowrap"
        >
          支出
        </Button>
      </div>
    </div>
  );
}
