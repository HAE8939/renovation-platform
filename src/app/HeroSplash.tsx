"use client";

/**
 * 启动页首屏（/ · M10-b）
 *
 * 需求来源：HAE 2026-10-13 意见 1「给程序做个高大上的启动页，现在多少有点干燥」，
 * 并在三个方案里明确选了**「启动页完全例外，不受 V0.3 管」**——所以这里允许展示级字号、
 * 深色主按钮、径向柔光、入场动画。例外已登记进 `AGENTS.md` §6.3，作用域锁在 `.splash-*`，
 * 业务页不得引用（否则 V0.3 的 Benchmark ≠ Style 红线就白写了）。
 *
 * 运动逻辑取自 codex 模板的《Typora 首屏动画拆解表》：背景首帧即立 → 标题 240ms 起
 * translateY(18px) 淡入 → 副标题逐字写入（42ms/字 + 光标闪烁）→ CTA 1180ms 后进入 →
 * 底部提示 1.5s 脉冲。只借**节奏与运动方式**，文字与配色全部换成平台自己的。
 *
 * 三条实现约束：
 * ① 覆盖层是 `fixed`，不改变下层页面结构——关掉首屏就是原来的模块索引，零回归风险；
 * ② 收起方式三种都给：滚轮 / 「进入平台」/ Esc，且收起后**不再自动弹出**（同一次访问内）；
 * ③ `prefers-reduced-motion` 下跳过逐字写入（直接给全文），动画时长由 globals.css 的全局
 *    规则压到近零——这条是本仓硬要求，例外作用域也不豁免它。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const SUB_PHRASE = "9 个功能模块 · 线索 / 设计 / 排程 / 质量 / 财务 / 驾驶舱，全挂在同一套主数据上。";
const TYPE_MS = 42;
const TYPE_START_MS = 470;

export function HeroSplash({ moduleNameCount }: { moduleNameCount: number }) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState("");
  const [reduced, setReduced] = useState(false);
  const timer = useRef<number | null>(null);

  const phrase = moduleNameCount > 0
    ? SUB_PHRASE.replace("9 个功能模块", `${moduleNameCount} 个功能模块`)
    : SUB_PHRASE;

  const dismiss = useCallback(() => {
    if (!visible || leaving) return;
    setLeaving(true);
    window.setTimeout(() => setVisible(false), reduced ? 0 : 430);
  }, [visible, leaving, reduced]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);

    if (mq.matches) {
      setTyped(phrase);
      return;
    }
    let i = 0;
    const step = () => {
      i += 1;
      setTyped(phrase.slice(0, i));
      if (i < phrase.length) timer.current = window.setTimeout(step, TYPE_MS);
    };
    timer.current = window.setTimeout(step, TYPE_START_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [phrase]);

  // 收起后锁回页面滚动；显示期间锁掉背景滚动，避免"两层都在滚"的错觉
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") dismiss();
    }
    function onWheel() {
      dismiss();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div className="splash" data-leaving={leaving ? "1" : "0"} aria-label="平台启动首屏">
      <p className="splash-eyebrow">装修经营 · 全流程数字化</p>
      <h1 className="splash-title">
        <em>一站式</em>
        数字管理平台
      </h1>
      <p className="splash-sub" aria-label={phrase}>
        <span aria-hidden>{typed}</span>
        {!reduced && typed.length < phrase.length && <span className="splash-caret" aria-hidden />}
      </p>

      <div className="splash-cta">
        <button type="button" className="splash-enter" onClick={dismiss}>
          进入平台
          <span aria-hidden>↗</span>
        </button>
        <Link href="/docs" className="splash-ghost">
          平台说明
          <span aria-hidden>↗</span>
        </Link>
      </div>

      <div className="splash-hint" aria-hidden>
        <span>SCROLL</span>
        <i />
      </div>
    </div>
  );
}
