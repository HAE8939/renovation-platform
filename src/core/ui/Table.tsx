import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * 表格：表头 secondary 小字，气声分隔线，单元格上下内距对称。
 * 无阴影，分隔线为唯一视觉结构。
 */
export function Table({ className = "", ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${className}`} {...rest} />
    </div>
  );
}

type ThAlign = "left" | "right" | "center";
const alignClass: Record<ThAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Th({
  align = "left",
  className = "",
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { align?: ThAlign }) {
  return (
    <th
      className={`border-b border-line px-3 py-2.5 text-left text-xs font-medium uppercase tracking-[0.08em] text-secondary ${alignClass[align]} ${className}`}
      {...rest}
    />
  );
}

export function Td({
  align = "left",
  className = "",
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { align?: ThAlign }) {
  return (
    <td
      className={`border-b border-line px-3 py-2.5 align-top ${alignClass[align]} ${className}`}
      {...rest}
    />
  );
}
