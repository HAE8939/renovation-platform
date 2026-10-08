import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** 内容区留白；false = 无内边距（用于表格容器等需要贴边的场景） */
  padded?: boolean;
}

/**
 * 卡纸容器：surface 底 + 1px 气声描边 + 10px 外圆角。
 * 无阴影 —— 层级靠底色差与描边，不靠投影。
 */
export function Card({ padded = true, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-card border border-line bg-surface ${
        padded ? "p-6" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface SectionTitleProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** 区块标题：小字 + 次级色 + 字距，V0.3 §4 表格表头同款处理。 */
export function SectionTitle({ className = "", children, ...rest }: SectionTitleProps) {
  return (
    <h2
      className={`text-xs font-medium uppercase tracking-[0.08em] text-secondary ${className}`}
      {...rest}
    >
      {children}
    </h2>
  );
}
