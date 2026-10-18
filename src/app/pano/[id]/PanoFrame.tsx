"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 全景视窗外壳（客户端组件，只为“全屏”这一件事存在）。
 *
 * iframe 里面的拖动环视、双指缩放、热点跳转全部由导览包自带的 marzipano 运行时负责，
 * 平台不插一脚——这正是“只展示、不编辑”的边界所在。服务端渲染不出的是元素全屏状态，
 * 所以这里只做三件小事：全屏切换、加载提示、iOS 兜底说明。
 *
 * iOS Safari（含 iPad）不支持对普通元素 requestFullscreen，只有 <video> 可以。
 * 因此这里 catch 住并明确告诉用户改用“新窗口打开 + 转横屏”，
 * 而不是留一个点了没反应的按钮让人以为坏了。
 */
export function PanoFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    function onChange() {
      setFull(document.fullscreenElement === box.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    const el = box.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await el.requestFullscreen();
      setHint(null);
    } catch {
      setHint("当前浏览器不支持整页全屏（iOS / iPadOS 只允许视频全屏）。可用“新窗口打开”后把设备转成横屏观看。");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-secondary">
          在画面里按住拖动即可环视，双指或滚轮缩放；画面里的圆点是场景之间的通道。
        </p>
        <div className="flex items-center gap-3">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-inner border border-line bg-surface px-3 text-xs text-secondary whitespace-nowrap transition-colors hover:bg-sunken hover:text-primary"
          >
            新窗口打开 <span aria-hidden>↗</span>
          </a>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex h-8 items-center rounded-inner border border-line bg-surface px-3 text-xs text-secondary whitespace-nowrap transition-colors hover:bg-sunken hover:text-primary"
          >
            {full ? "退出全屏" : "全屏"}
          </button>
        </div>
      </div>

      <div
        ref={box}
        className={
          full
            ? "fixed inset-0 z-50 bg-canvas"
            : "relative overflow-hidden rounded-card border border-line bg-sunken"
        }
      >
        <iframe
          src={src}
          title={`全景导览：${title}`}
          onLoad={() => setLoaded(true)}
          allow="fullscreen; autoplay; gyroscope; accelerometer; encrypted-media; xr-spatial-tracking"
          className="block w-full border-0"
          style={{ height: full ? "100%" : "min(68vh, 720px)" }}
        />
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface">
            <span className="text-[13px] text-secondary">正在装载全景…</span>
          </div>
        )}
      </div>

      {hint && (
        <p className="border-l-[3px] border-warning bg-surface px-4 py-2 text-[13px] leading-relaxed text-secondary">
          {hint}
        </p>
      )}
      {full && <p className="text-[13px] text-muted">按 Esc 或右上角“退出全屏”回到平台。</p>}
    </div>
  );
}
