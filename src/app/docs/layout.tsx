import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "平台说明",
  description: "装修经营数字化管理平台 · 完整说明文档",
};

/**
 * 文档站布局。目录导航已上移到平台外壳的左侧栏（见 PlatformShell 的 isDocs 分支 + DocsNav），
 * 这里不再重复渲染一份“说明目录”，正文直接占满内容区——文档区只有一套导航。
 * 正文列用 max-w-5xl（1024）：表格/卡片铺满，段落再由 ui.tsx 的 BODY_W 收到可读行宽。
 * /docs 不在 accessGate 白名单内 → 内测期访问闸开启时整段随全站受保护（含内部经营口径，刻意如此）；
 * 2026-10 起闸按拍板暂关（PLATFORM_GATE=off），白名单口径保留，恢复保护即自动生效。
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl">{children}</div>;
}
