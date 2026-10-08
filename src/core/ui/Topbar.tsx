"use client";

import { usePathname } from "next/navigation";
import { PLATFORM } from "@/core/platform";
import type { ModuleManifest } from "@/modules/types";

interface TopbarProps {
  modules: ModuleManifest[];
}

/**
 * 顶栏：平台名 + 当前模块名 + 形态说明。
 * 当前模块由 pathname 反查 registry 得到，不写死。
 */
export function Topbar({ modules }: TopbarProps) {
  const pathname = usePathname() ?? "/";
  const active = modules.find(
    (m) => pathname === m.entryPath || pathname.startsWith(m.entryPath + "/")
  );

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-canvas px-4 sm:px-6">
      <div className="flex items-baseline gap-2.5">
        <span className="text-sm font-semibold">{PLATFORM.name}</span>
        <span aria-hidden className="text-sm text-muted">
          /
        </span>
        <span
          className={`text-sm ${active ? "font-medium text-primary" : "text-secondary"}`}
        >
          {active ? active.name : "平台首页"}
        </span>
      </div>
      <span className="hidden text-xs text-muted sm:inline">{PLATFORM.status}</span>
    </header>
  );
}
