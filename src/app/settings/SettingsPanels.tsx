"use client";

import { useState } from "react";
import { Button, Field } from "@/core/ui";
import {
  THEME_KEYS,
  THEME_LABEL,
  THEME_NOTE,
  type ThemeKey,
} from "@/core/domain/theme";
import {
  saveThemeAction,
  uploadLogoAction,
  removeLogoAction,
  type SettingsState,
} from "./actions";

/**
 * 平台设置面板（M9-d，client）：主题自助切换 + 品牌 Logo 最简版。
 *
 * 主题：四套插槽单选（决策 R1——只给已评审过的四套，不开取色器）。每套的色块预览**不写死
 * 任何 hex**：外层用 `data-theme` 把该套 CSS 变量作用域化，内层直接吃 `var(--accent)` 等，
 * 与 tokens.css 单一真源对齐（漂移由 verify-theme 门禁摁住）。
 * 每套附一句取舍说明（THEME_NOTE），让客户睁着眼选，而不是盲选一个对比度塌方的主题。
 *
 * Logo：仅类型（PNG/JPG/WebP）与大小（≤512KB）门控在核心层，这里只提交文件并回显结果。
 * 校验真源在服务端（core/domain/branding），build/断言都替代不了它。
 */
export interface SettingsPanelsProps {
  themeKey: ThemeKey;
  logoFile: string | null;
  logoUrl: string | null;
}

export function SettingsPanels({ themeKey, logoFile, logoUrl }: SettingsPanelsProps) {
  return (
    <div className="space-y-12">
      <ThemePicker initial={themeKey} />
      <LogoPanel logoFile={logoFile} logoUrl={logoUrl} />
    </div>
  );
}

/* ── 主题选择器 ───────────────────────────────────────────────── */

function ThemePicker({ initial }: { initial: ThemeKey }) {
  const [sel, setSel] = useState<ThemeKey>(initial);
  const [state, setState] = useState<SettingsState>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("themeKey", sel);
    setPending(true);
    const res = await saveThemeAction({}, fd);
    setPending(false);
    setState(res);
  }

  return (
    <section>
      <h2 className="text-[17px] font-semibold">强调色主题</h2>
      <p className="mt-1 text-xs text-secondary">
        只替换那一处强调色（色块 / 深墨 / 浅晕 / 主按钮字色），纸底、灰阶、描边、圆角一律不动。
        选定的主题全站即时生效。
      </p>

      <form onSubmit={onSubmit} className="mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {THEME_KEYS.map((key) => {
            const checked = sel === key;
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-4 rounded-card border bg-surface p-4 transition-colors duration-150 ${
                  checked ? "border-accent" : "border-line hover:border-accent-ink"
                }`}
              >
                <input
                  type="radio"
                  name="themeKey"
                  value={key}
                  checked={checked}
                  onChange={() => setSel(key)}
                  className="sr-only"
                />
                <ThemeSwatch theme={key} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{THEME_LABEL[key]}</span>
                    {key === initial && (
                      <span className="text-[12px] text-muted">当前</span>
                    )}
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-secondary">
                    {THEME_NOTE[key]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending || sel === initial}>
            {pending ? "保存中…" : "应用主题"}
          </Button>
          {state.error && <span className="text-[13px] text-danger">{state.error}</span>}
          {state.ok && !state.error && (
            <span className="text-[13px] text-success">已应用，全站已切换</span>
          )}
        </div>
      </form>
    </section>
  );
}

/** 用 data-theme 作用域取 CSS 变量，杜绝在 TSX 里硬写色值。 */
function ThemeSwatch({ theme }: { theme: ThemeKey }) {
  return (
    <span
      data-theme={theme}
      aria-hidden
      className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5"
    >
      <span className="flex overflow-hidden rounded-inner border border-line">
        <span className="flex h-8 w-6 items-center justify-center" style={{ background: "var(--accent)" }}>
          <span className="text-[13px] font-semibold" style={{ color: "var(--accent-fg)" }}>A</span>
        </span>
        <span className="h-8 w-6" style={{ background: "var(--accent-tint)" }} />
      </span>
      <span className="text-[12px] font-semibold" style={{ color: "var(--accent-ink)" }}>
        强调文字
      </span>
    </span>
  );
}

/* ── Logo 面板 ────────────────────────────────────────────────── */

function LogoPanel({ logoFile, logoUrl }: { logoFile: string | null; logoUrl: string | null }) {
  const [state, setState] = useState<SettingsState>({});
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!(fd.get("file") instanceof File) || (fd.get("file") as File).size === 0) {
      setState({ error: "请先选择图片文件" });
      return;
    }
    setPending(true);
    const res = await uploadLogoAction({}, fd);
    setPending(false);
    setState(res);
    if (res.ok) form.reset();
  }

  async function onRemove() {
    setRemoving(true);
    const res = await removeLogoAction();
    setRemoving(false);
    setState(res);
  }

  return (
    <section>
      <h2 className="text-[17px] font-semibold">品牌 Logo</h2>
      <p className="mt-1 text-xs text-secondary">
        上传后显示在左侧品牌区，替代「Platform」字样（未上传时回落文字标识）。
        仅支持 PNG / JPG / WebP，不超过 512 KB。
      </p>

      <div className="mt-4 flex items-center gap-4">
        {logoUrl ? (
          <span className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="当前 Logo 预览"
              className="h-12 w-auto max-w-[200px] rounded-inner border border-line bg-canvas object-contain p-1"
            />
            <span className="num text-[12px] text-muted">{logoFile}</span>
          </span>
        ) : (
          <span className="text-[13px] text-muted">尚未上传 Logo</span>
        )}
      </div>

      <form onSubmit={onUpload} className="mt-4 border border-line bg-surface p-4">
        <Field label={logoUrl ? "替换 Logo" : "上传 Logo"}>
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm text-primary file:mr-3 file:rounded-inner file:border-0 file:bg-sunken file:px-3 file:py-2 file:text-sm file:text-primary"
          />
        </Field>
        <div className="mt-4 flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "上传中…" : "上传"}
          </Button>
          {logoUrl && (
            <Button type="button" variant="danger" onClick={onRemove} disabled={removing}>
              {removing ? "移除中…" : "移除 Logo"}
            </Button>
          )}
          {state.error && <span className="text-[13px] text-danger">{state.error}</span>}
          {state.ok && !state.error && (
            <span className="text-[13px] text-success">已保存</span>
          )}
        </div>
      </form>
    </section>
  );
}
