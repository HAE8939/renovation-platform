import type { Metadata, Viewport } from "next";
import { PLATFORM } from "@/core/platform";
import { modules } from "@/modules/registry";
import { getPlatformSettings } from "@/core/domain/platformSettings";
import { brandingUrl } from "@/core/domain/branding";
import { PlatformShell } from "./PlatformShell";
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
 *
 * 主题（M9-d）：本组件是全站唯一读 PlatformSetting 的地方——把 themeKey 打到 <html data-theme>，
 * tokens.css 的 :root[data-theme="X"] 覆盖一族 accent 变量，全站（含 Tailwind 映射）随之换色。
 * 读库使外壳转为动态渲染；/settings 保存主题后 revalidatePath("/", "layout") 即时生效。
 * themeKey 已在服务层归一，永远落四套插槽之一，不会写脏。
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { themeKey, logoFile } = await getPlatformSettings();
  const logoSrc = brandingUrl(logoFile);

  return (
    <html lang="zh-CN" data-theme={themeKey}>
      <body>
        <PlatformShell logoSrc={logoSrc}>{children}</PlatformShell>
      </body>
    </html>
  );
}
