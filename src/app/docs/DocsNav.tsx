"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_TOC } from "./docsToc";

interface DocsNavProps {
  /** compact = 移动端横向条；默认是桌面侧栏。视觉语言与平台 Nav 同构，但条目取自 DOCS_TOC。 */
  compact?: boolean;
}

/**
 * 文档站导航。/docs 下替换业务模块导航进驻平台外壳的左侧栏（与首页隐藏侧栏同构），
 * 因此文档区只有一套导航，不再是「业务侧栏 + 内容区目录」两栏并存。
 */
export function DocsNav({ compact = false }: DocsNavProps) {
  const pathname = usePathname() ?? "/docs";

  const isActive = (href: string) =>
    href === ""
      ? pathname === "/docs"
      : pathname === "/docs/" + href || pathname.startsWith("/docs/" + href + "/");

  const linkHref = (href: string) => (href === "" ? "/docs" : "/docs/" + href);

  if (compact) {
    return (
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line bg-canvas md:hidden">
        {DOCS_TOC.map((d) => {
          const active = isActive(d.href);
          return (
            <Link
              key={linkHref(d.href)}
              href={linkHref(d.href)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm transition-colors duration-[120ms] ${
                active
                  ? "border-b-2 border-accent font-semibold text-accent-ink"
                  : "border-b-2 border-transparent text-secondary hover:text-primary"
              }`}
            >
              {d.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col">
      <p className="px-4 pb-2 pt-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">
        说明目录
      </p>
      {DOCS_TOC.map((d) => {
        const active = isActive(d.href);
        return (
          <Link
            key={linkHref(d.href)}
            href={linkHref(d.href)}
            title={d.desc}
            className={`group relative flex items-baseline gap-3 px-4 py-3 text-sm transition-colors duration-[120ms] ${
              active
                ? "bg-accent-tint font-semibold text-accent-ink"
                : "text-secondary hover:bg-surface hover:text-primary"
            }`}
          >
            <span className={`num text-xs ${active ? "text-accent-ink" : "text-muted"}`}>{d.num}</span>
            <span>{d.label}</span>
            {active && (
              <span aria-hidden className="absolute left-0 top-0 h-full w-[3px] bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
