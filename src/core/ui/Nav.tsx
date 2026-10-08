"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleManifest } from "@/modules/types";

interface NavProps {
  modules: ModuleManifest[];
  /** compact = 移动端横向条状导航；默认是桌面侧栏 */
  compact?: boolean;
}

/**
 * 平台外壳导航。条目完全由 registry 传入，组件内不写死任何模块名。
 * 当前项用 accent 表达（选中即原色），其余走 secondary 字。
 */
export function Nav({ modules, compact = false }: NavProps) {
  const pathname = usePathname() ?? "/";

  const isActive = (m: ModuleManifest) =>
    pathname === m.entryPath || pathname.startsWith(m.entryPath + "/");

  const items = modules.map((m, i) => {
    const active = isActive(m);
    return (
      <Link
        key={m.id}
        href={m.entryPath}
        className={
          compact
            ? `shrink-0 px-3 py-2 text-sm transition-colors duration-150 ${
                active
                  ? "border-b-2 border-accent font-semibold text-accent-ink"
                  : "border-b-2 border-transparent text-secondary hover:text-primary"
              }`
            : `group relative flex items-baseline gap-3 px-4 py-2.5 text-sm transition-colors duration-150 ${
                active
                  ? "bg-accent-tint font-semibold text-accent-ink"
                  : "text-secondary hover:bg-surface hover:text-primary"
              }`
        }
      >
        {compact ? null : (
          <span
            className={`num text-xs ${
              active ? "text-accent-ink" : "text-muted"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
        )}
        <span>{m.name}</span>
        {!compact && active && (
          <span
            aria-hidden
            className="absolute left-0 top-0 h-full w-[3px] bg-accent"
          />
        )}
      </Link>
    );
  });

  if (compact) {
    return (
      <nav className="flex items-center gap-1 border-t border-line bg-canvas">
        {items}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col">
      {items}
    </nav>
  );
}
