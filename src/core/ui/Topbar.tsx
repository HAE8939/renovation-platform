"use client";

import Link from "next/link";
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
        {active ? (
          <>
            <Link
              href="/"
              className="text-sm font-semibold transition-colors duration-150 hover:text-accent-ink"
            >
              {PLATFORM.name}
            </Link>
            <span aria-hidden className="text-sm text-muted">
              /
            </span>
            <span className="text-sm font-medium text-primary">{active.name}</span>
          </>
        ) : (
          <span className="text-sm font-semibold">{PLATFORM.name}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden text-xs text-muted sm:inline">{PLATFORM.status}</span>
        {/* 平台设置入口（M9-d）：主题 + Logo，属平台工具，不进业务模块导航，故放顶栏。 */}
        <Link
          href="/settings"
          className={`text-xs transition-colors duration-150 hover:text-accent-ink ${
            pathname === "/settings" || pathname.startsWith("/settings/")
              ? "font-medium text-accent-ink"
              : "text-secondary"
          }`}
        >
          设置
        </Link>
      </div>
    </header>
  );
}
