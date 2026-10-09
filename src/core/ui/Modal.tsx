"use client";

import { useEffect, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * 浮层对话框（V0.3 · 无阴影 / 单点钴蓝 / L1–L3 层级令牌）。
 * - L1 遮罩：纸感墨色压暗（color-mix + text-primary），非投影、非纯黑。
 * - L3 浮层：surface 卡纸 + 1px 气声描边 + 10px 圆角；层级靠底色差与描边，不靠投影。
 * 行为：Esc 关闭、点遮罩关闭、标题栏关闭按钮。
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* L1 遮罩 */}
      <div
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--text-primary)_42%,transparent)]"
        onClick={onClose}
      />
      {/* L3 浮层 */}
      <div className="relative w-full max-w-md rounded-card border border-line bg-surface">
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
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
