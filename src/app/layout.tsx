import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Nav, Topbar } from "@/core/ui";
import { PLATFORM } from "@/core/platform";
import { modules } from "@/modules/registry";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: `${PLATFORM.name} — ${PLATFORM.tagline}`,
    template: `%s · ${PLATFORM.name}`,
  },
  description: PLATFORM.tagline,
};

export const viewport: Viewport = {
  themeColor: "#F4F1EA",
};

/**
 * 平台外壳：左侧模块导航（由 registry 动态渲染）+ 顶栏 + 内容区。
 * 外壳不写死任何模块 —— 新增模块只需在 registry 加一行，导航与首页自动出现。
 * 字体不通过 next/font 加载：V0.3 的中文栈含 Microsoft YaHei 等系统字体，
 * 走 CSS font-family 回退即可，也避免构建期联网拉字体。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
          {/* 桌面侧栏 */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
            <Link href="/" className="block border-b border-line px-5 py-5">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                Platform
              </p>
              <p className="mt-1.5 text-sm font-semibold leading-snug transition-colors duration-150 hover:text-accent-ink">
                {PLATFORM.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-secondary">{PLATFORM.tagline}</p>
            </Link>

            <div className="py-2">
              <Nav modules={modules} />
            </div>

            <div className="mt-auto border-t border-line px-5 py-4">
              <p className="text-xs leading-relaxed text-muted">{PLATFORM.status}</p>
            </div>
          </aside>

          {/* 内容列 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar modules={modules} />
            {/* 移动端模块条：窄屏下替代侧栏 */}
            <Nav modules={modules} compact />

            <main className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
                {children}
              </div>
            </main>

            <footer className="border-t border-line px-4 py-4 sm:px-6">
              <p className="text-xs text-muted">
                平台外壳由模块注册表驱动 · 当前已注册模块 {modules.length} 个
              </p>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
