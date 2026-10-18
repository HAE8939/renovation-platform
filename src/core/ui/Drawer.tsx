"use client";

import { useEffect, type ReactNode } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 顶部右侧额外操作区（如关闭按钮外的动作）。 */
  children: ReactNode;
}

/**
 * 右侧滑出抽屉（V0.3 · 无阴影 / 单点钴蓝 / L1–L3 层级令牌）。
 * 复用 Modal 的遮罩与浮层令牌：
 * - L1 遮罩：纸感墨色压暗，走 `.overlay-veil`（纯色 var + opacity），非投影、非纯黑。
 * - L3 浮层：surface 卡纸 + 1px 气声描边；层级靠底色差与描边，不靠投影。
 * 行为：Esc 关闭、点遮罩关闭、标题栏关闭按钮。宽度约 480px，移动端全宽。
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* L1 遮罩 */}
      <div
        className="overlay-veil"
        onClick={onClose}
      />
      {/* L3 浮层：右侧滑出面板 */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-[17px] font-semibold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center justify-center rounded-inner px-3 text-[13px] text-secondary whitespace-nowrap transition-colors hover:bg-accent-tint hover:text-accent-ink"
          >
            关闭
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
