"use client";

/**
 * 顶栏通知铃铛（M10-a UI-12 · HAE 意见 12）
 *
 * 三条实现取舍：
 * ① **按需拉取**：铃铛挂在每页顶栏，若在布局里服务端预取，等于每页多付一次跨模块聚合查询。
 *    这里改成"首次点开才 fetch"，之后每次点开重拉（数据要新鲜，缓存没意义）。
 * ② **不弹窗、不推送**：只把"该看一眼的事"集中列出来 + 给深链。真推送（IM/邮件）是
 *    PLAN §1 决策④ 明确本期不做的东西，这里不越线。
 * ③ **无阴影浮层**：面板靠 bg-surface + border-line + 42% 遮罩分层（AGENTS §6.2 当前落地口径），
 *    不消耗阴影预算；点外部或 Esc 关闭；无内容时按钮不显示角标，避免"永远 0"的噪声。
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
// 形状取自 core，不 import dashboard 模块内部——core 不依赖任何单一模块（§2）。
import type { NotificationSummary } from "@/core/domain/notificationTypes";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as NotificationSummary);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = data?.total ?? 0;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative inline-flex h-8 items-center gap-2 rounded-inner px-3 text-xs transition-colors duration-[120ms] ${
          open ? "bg-accent-tint font-medium text-accent-ink" : "text-secondary hover:bg-accent-tint hover:text-accent-ink"
        }`}
      >
        通知
        {total > 0 && (
          <span className="num inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[12px] font-semibold text-[color:var(--accent-fg)]">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-10 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface"
        >
          <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
            <span className="text-[13px] font-semibold">通知中心</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] text-secondary transition-colors duration-[120ms] hover:text-primary"
            >
              关闭
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
            {loading && !data && <p className="text-[13px] text-secondary">正在汇总…</p>}
            {failed && <p className="text-[13px] text-danger">暂时取不到通知，请稍后重试。</p>}
            {!loading && !failed && data && data.groups.length === 0 && (
              <p className="text-[13px] text-secondary">
                没有待处理事项。验收待审核、未整改问题、工期超期、变更超 5% 与到期跟进线索都会汇总到这里。
              </p>
            )}
            {data?.groups.map((g) => (
              <section key={g.id} className="mb-4 last:mb-0">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[13px] font-semibold">{g.title}</h3>
                  <span className="num text-[12px] text-muted">{g.count}</span>
                </div>
                <ul className="mt-1 space-y-1">
                  {g.rows.map((r) => (
                    <li key={r.href + r.label}>
                      <Link
                        href={r.href}
                        onClick={() => setOpen(false)}
                        className="block truncate rounded-inner px-2 py-1 text-[13px] text-secondary transition-colors duration-[120ms] hover:bg-accent-tint hover:text-accent-ink"
                        title={r.label}
                      >
                        {r.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href={g.allHref}
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-block px-2 text-[12px] text-accent-ink hover:underline underline-offset-4"
                >
                  查看全部 →
                </Link>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
