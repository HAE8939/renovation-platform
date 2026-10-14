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
        // 单点 accent（钴蓝）。四值一族与 AGENTS §6 / tokens.css 对齐：
        // DEFAULT=主色、ink=深墨（浅底上的文字）、tint=浅底、fg=**主按钮上的前景色**。
        // fg 曾缺失（M13 体检 H-4）：`text-accent-fg` 写出来无解，按钮前景静默落回继承色，
        // 组件只能改用 text-[color:var(--accent-fg)] 这种绕过映射的写法。补上后两者都不必再写。
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          tint: "var(--accent-tint)",
          fg: "var(--accent-fg)",
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
