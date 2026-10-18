"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav, Topbar } from "@/core/ui";
import { PLATFORM } from "@/core/platform";
import { modules } from "@/modules/registry";
import { DocsNav } from "./docs/DocsNav";
import { isDocsPath } from "./docs/docsToc";

/**
 * 平台外壳的路径感知层。
 * 首页本身就是模块入口页，因此不再同时展示一套桌面侧栏导航；
 * 业务页仍保留固定侧栏，移动端也只在业务页显示横向模块条。
 */
export function PlatformShell({
  children,
  logoSrc,
}: {
  children: React.ReactNode;
  logoSrc: string | null;
}) {
  const pathname = usePathname() ?? "/";
  const isHome = pathname === "/";
  // 文档站：左侧栏由业务模块导航换成“说明目录”，文档区只留一套导航（与首页隐藏侧栏同构）。
  const isDocs = isDocsPath(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      <aside
        className={`hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:max-h-screen md:overflow-y-auto ${
          isHome ? "md:hidden" : ""
        }`}
      >
        <Link href="/" className="block border-b border-line px-6 py-6">
          {logoSrc ? (
            // 刻意用原生 <img>：内网 standalone 无 sharp，next/image 的服务端优化会在生产报错；
            // Logo 由平台设置上传、已限尺寸，不走优化也谈不上带宽损失。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${PLATFORM.name} 标识`}
              width={200}
              height={48}
              className="mb-2 h-auto w-full max-w-[180px] object-contain"
            />
          ) : (
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Platform</p>
          )}
          <p className="mt-2 text-sm font-semibold leading-snug transition-colors duration-[120ms] hover:text-accent-ink">
            {PLATFORM.name}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-secondary">{PLATFORM.tagline}</p>
        </Link>

        <div className="py-2">{isDocs ? <DocsNav /> : <Nav modules={modules} />}</div>

        <div className="mt-auto border-t border-line px-6 py-4">
          <p className="text-xs leading-relaxed text-muted">{PLATFORM.status}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar modules={modules} />
        {!isHome && (isDocs ? <DocsNav compact /> : <Nav modules={modules} compact />)}

        <main className="min-w-0 flex-1">
          <div
            className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${
              isHome ? "max-w-7xl py-6 sm:py-8 lg:py-8" : "max-w-6xl py-8 lg:py-8"
            }`}
          >
            {children}
          </div>
        </main>

        <footer className="border-t border-line px-4 py-4 sm:px-6">
          <p className="text-xs text-muted">
            {isDocs ? "文档站目录由单一真源驱动" : `平台外壳由模块注册表驱动 · 当前已注册模块 ${modules.length} 个`}
          </p>
        </footer>
      </div>
    </div>
  );
}
