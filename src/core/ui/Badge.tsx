import type { HTMLAttributes } from "react";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger" | "outline";

/**
 * 标签 Chip：tint 底 + ink 字，6px 圆角，caption 字号。
 * 状态标签 = 状态色 ~12% 叠 surface 作底 + 状态色作字（V0.3 §4）。
 */
const variantClass: Record<BadgeVariant, string> = {
  neutral: "border border-line bg-surface text-secondary",
  accent: "bg-accent-tint text-accent-ink",
  success: "bg-[color-mix(in_srgb,var(--success)_14%,var(--surface))] text-success",
  warning: "bg-[color-mix(in_srgb,var(--warning)_14%,var(--surface))] text-warning",
  danger: "bg-[color-mix(in_srgb,var(--danger)_14%,var(--surface))] text-danger",
  outline: "border border-line bg-transparent text-secondary",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "neutral", className = "", ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-inner px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap ${variantClass[variant]} ${className}`}
      {...rest}
    />
  );
}
