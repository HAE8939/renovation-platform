import type { Config } from "tailwindcss";

/**
 * Tailwind 仅作原子工具类（AGENTS §1）。
 * 颜色 / 字体 / 圆角一律映射到 src/styles/tokens.css 的 CSS 变量，
 * 不在此写死任何色值 —— 换主题只动 tokens.css 的 --accent 一族。
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 纸感底
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        sunken: "var(--surface-sunken)",
        // 三档文字对比度
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-disabled)",
        // 单点 accent（钴蓝）
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          tint: "var(--accent-tint)",
        },
        // 气声描边
        line: "var(--border)",
        // 状态色
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "PingFang SC",
          "Microsoft YaHei",
          "HarmonyOS Sans SC",
          "Noto Sans SC",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Maple Mono",
          "ui-monospace",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        card: "10px",
        inner: "6px",
      },
      maxWidth: {
        prose: "42ch", // 中文正文一行约 33–40 字
      },
    },
  },
  plugins: [],
};
export default config;
