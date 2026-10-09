"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/core/ui";

/** 卡片 / 表格 视图切换。默认卡片；切换写入 ?view= 以便深链与截图。 */
export function ViewToggle({ view }: { view: "card" | "table" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: "card" | "table") => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next === "card") sp.delete("view");
    else sp.set("view", "table");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">视图</span>
      <div className="flex items-center rounded-inner border border-line bg-surface p-1">
        <Button
          variant={view === "card" ? "secondary" : "ghost"}
          size="sm"
          type="button"
          onClick={() => go("card")}
          className="whitespace-nowrap"
        >
          卡片
        </Button>
        <Button
          variant={view === "table" ? "secondary" : "ghost"}
          size="sm"
          type="button"
          onClick={() => go("table")}
          className="whitespace-nowrap"
        >
          表格
        </Button>
      </div>
    </div>
  );
}
