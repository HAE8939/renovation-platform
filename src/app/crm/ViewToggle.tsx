"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/core/ui";

/** 看板 / 列表 视图切换。默认看板；切换写入 ?view= 以便深链与截图。 */
export function ViewToggle({ view }: { view: "board" | "list" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (next: "board" | "list") => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next === "board") sp.delete("view");
    else sp.set("view", "list");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">视图</span>
      <div className="flex items-center rounded-inner border border-line bg-surface p-1">
        <Button
          variant={view === "board" ? "secondary" : "ghost"}
          size="sm"
          type="button"
          onClick={() => go("board")}
          className="whitespace-nowrap"
        >
          看板
        </Button>
        <Button
          variant={view === "list" ? "secondary" : "ghost"}
          size="sm"
          type="button"
          onClick={() => go("list")}
          className="whitespace-nowrap"
        >
          列表
        </Button>
      </div>
    </div>
  );
}
