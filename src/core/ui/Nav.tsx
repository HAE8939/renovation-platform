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
 * 模块的二级导航（manifest.nav）缩进挂在所属模块下，仅在桌面侧栏展示。
 */
export function Nav({ modules, compact = false }: NavProps) {
  const pathname = usePathname() ?? "/";

  const isActive = (m: ModuleManifest) =>
    pathname === m.entryPath || pathname.startsWith(m.entryPath + "/");

  if (compact) {
    return (
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line bg-canvas">
        {modules.map((m) => {
          const active = isActive(m);
          return (
            <Link
              key={m.id}
              href={m.entryPath}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm transition-colors duration-150 ${
                active
                  ? "border-b-2 border-accent font-semibold text-accent-ink"
                  : "border-b-2 border-transparent text-secondary hover:text-primary"
              }`}
            >
              {m.name}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col">
      {modules.map((m, i) => {
        const active = isActive(m);
        const subNav = m.nav ?? [];
        return (
          <div key={m.id}>
            <Link
              href={m.entryPath}
              className={`group relative flex items-baseline gap-3 px-4 py-2.5 text-sm transition-colors duration-150 ${
                active
                  ? "bg-accent-tint font-semibold text-accent-ink"
                  : "text-secondary hover:bg-surface hover:text-primary"
              }`}
            >
              <span
                className={`num text-xs ${
                  active ? "text-accent-ink" : "text-muted"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{m.name}</span>
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-[3px] bg-accent"
                />
              )}
            </Link>

            {subNav.length > 0 && (
              <ul className="flex flex-col">
                {subNav.map((n) => {
                  const subActive = pathname === n.href;
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        className={`flex items-center pl-12 pr-4 py-2 text-[13px] transition-colors duration-150 ${
                          subActive
                            ? "bg-accent-tint font-medium text-accent-ink"
                            : "text-secondary hover:bg-surface hover:text-primary"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mr-2 inline-block h-px w-3 ${
                            subActive ? "bg-accent" : "bg-line"
                          }`}
                        />
                        {n.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
