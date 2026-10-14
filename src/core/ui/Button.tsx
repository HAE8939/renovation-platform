import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * 主按钮 = accent 实色平涂 + 自适应前景；6px 圆角；无渐变无阴影。
 * hover/press 用 filter 压暗（非阴影），零位移零缩放。
 */
const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[color:var(--accent-fg)] border border-transparent hover:brightness-95 active:brightness-90",
  secondary:
    "bg-surface text-primary border border-line hover:bg-sunken active:bg-sunken",
  ghost: "bg-transparent text-accent-ink border border-transparent hover:bg-accent-tint",
  danger:
    "bg-surface text-danger border border-danger hover:bg-danger hover:text-white active:brightness-90",
};

const sizeClass: Record<ButtonSize, string> = {
  md: "h-9 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", type = "button", ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-inner whitespace-nowrap",
          "font-medium transition-[background-color,border-color,filter] duration-[120ms] ease-out",
          "select-none disabled:opacity-50 disabled:pointer-events-none",
          variantClass[variant],
          sizeClass[size],
          className,
        ].join(" ")}
        {...rest}
      />
    );
  }
);
