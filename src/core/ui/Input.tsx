import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

/** 输入框：surface 底、1px 描边、6px 圆角；聚焦描边换 accent，不加外发光。 */
const fieldClass =
  "block w-full rounded-inner border border-line bg-surface text-sm text-primary " +
  "placeholder:text-muted transition-colors duration-150 " +
  "focus:outline-none focus:border-accent disabled:opacity-50 disabled:bg-sunken";

// 两档尺寸写成互斥的完整类串，避免 px/py 同名工具类相互覆盖
const sizeClass = {
  default: "px-3 py-2",
  compact: "px-2 py-1",
} as const;

export interface InputSizeProps {
  compact?: boolean;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & InputSizeProps
>(function Input({ className = "", compact = false, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`${fieldClass} ${sizeClass[compact ? "compact" : "default"]} ${className}`}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...rest }, ref) {
  return <textarea ref={ref} className={`${fieldClass} resize-y ${className}`} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${fieldClass} pr-8 ${className}`} {...rest}>
      {children}
    </select>
  );
});

export interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

/** label + 控件的包裹，label 用小字 + 次级色，保持表单节奏一致。 */
export function Field({ label, required, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
