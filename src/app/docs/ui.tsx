import type { ReactNode } from "react";
import Image from "next/image";
import { Card } from "@/core/ui";

/**
 * docs/ui.tsx —— 文档站正文的排版原语（服务端组件，无交互）。
 * 全部落在 AGENTS §6 令牌阶梯内：字号仅 12/13/15/17/20/28，间距仅 4/8/12/16/24/32/48（+长页 section 64/96），
 * 默认无阴影，层级靠字重与对比度。警示块用「卡纸 + 左 3px 低饱和色条」，不整块染色（MT-VL §8 实跑校正后的口径）。
 */

/**
 * 文档正文统一行宽。max-w-prose 只有 42ch（≈33 中文字）过窄，1440 下正文右侧留大片空白；
 * 用 max-w-3xl（768px，中文约 45–48 字/行）作单一真源，比 42ch 明显舒展。表格/卡片仍铺满整列。
 * 只动排版容器宽度（max-w-* 是命名刻度，不受 verify-tokens 字号/间距阶梯管辖）。
 */
const BODY_W = "max-w-3xl";

export function DocsPage({
  eyebrow,
  title,
  lead,
  hero,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  /** 可选头图：只用于个别需要气质铺垫的页面（当前仅总览）。展示用插画，不承载信息。 */
  hero?: { src: string; alt: string; width: number; height: number };
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-24">
      <header className="border-b border-line pb-8">
        {hero && (
          <Image
            src={hero.src}
            alt={hero.alt}
            width={hero.width}
            height={hero.height}
            priority
            className="mb-8 h-auto w-full rounded-card border border-line"
          />
        )}
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">{eyebrow}</p>
        <h1 className={`mt-3 text-[28px] font-semibold leading-[1.3] ${BODY_W}`}>{title}</h1>
        <p className={`mt-4 ${BODY_W} text-[15px] leading-relaxed text-secondary`}>{lead}</p>
      </header>
      {children}
    </article>
  );
}

export function DocsSection({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      {desc && <p className={`mt-3 ${BODY_W} text-[15px] leading-relaxed text-secondary`}>{desc}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className={`${BODY_W} space-y-4 text-[15px] leading-relaxed text-primary`}>{children}</div>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className={`${BODY_W} text-[13px] leading-relaxed text-secondary`}>{children}</p>;
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className={`${BODY_W} text-[15px] leading-relaxed text-primary`}>{children}</p>;
}

/** 定义式要点：标题 + 说明，竖线分隔，用于"六条取向""数据观"这类成组要点。 */
export function PointList({ items }: { items: { term: string; desc: ReactNode }[] }) {
  return (
    <dl className={`divide-y divide-line border-y border-line ${BODY_W}`}>
      {items.map((it) => (
        <div key={it.term} className="py-4">
          <dt className="text-[15px] font-medium text-primary">{it.term}</dt>
          <dd className={`mt-2 ${BODY_W} text-[13px] leading-relaxed text-secondary`}>{it.desc}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 单张信息卡：模块逐块、能力清单等。 */
export function InfoCard({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: { text: string; tone: "ok" | "doing" | "todo" };
  children: ReactNode;
}) {
  const toneClass =
    tag?.tone === "ok"
      ? "text-success"
      : tag?.tone === "doing"
        ? "text-warning"
        : "text-muted";
  return (
    <Card padded className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-semibold leading-snug">{title}</h3>
        {tag && <span className={`num shrink-0 text-xs ${toneClass}`}>{tag.text}</span>}
      </div>
      <div className={`mt-3 ${BODY_W} text-[13px] leading-relaxed text-secondary`}>{children}</div>
    </Card>
  );
}

/** 把含 `反引号` 的字符串切成文本 / 代码段。全字符串行 → 无需在数据数组里写 JSX（避开 react/jsx-key 误报）。 */
function renderCell(s: string): ReactNode {
  const parts = s.split("`");
  if (parts.length === 1) return s;
  return parts.map((p, i) => (i % 2 === 1 ? <Code key={i}>{p}</Code> : p));
}

/**
 * 精简表格：入参是纯字符串二维数组，`反引号` 段自动渲染为内联代码；
 * numCols / codeCols 控制列样式，statusCol 按「已上线/进行中/未开放」给状态列上色。
 */
export function DocsTable({
  head,
  rows,
  numCols = [],
  statusCol,
}: {
  head: string[];
  rows: string[][];
  numCols?: number[];
  statusCol?: number;
}) {
  const statusClass = (v: string) =>
    v.includes("已上线") || v.includes("已具备")
      ? "text-success"
      : v.includes("进行中") || v.includes("缺") || v.includes("待")
        ? "text-warning"
        : v.includes("未开放") || v.includes("未建")
          ? "text-muted"
          : "";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-secondary"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line align-top last:border-b-0">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className={`px-3 py-3 leading-relaxed text-primary ${
                    numCols.includes(c) ? "num" : ""
                  } ${c === statusCol ? statusClass(cell) : ""}`}
                >
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 提示块：卡纸底 + 左 3px 低饱和色条（对齐 MT-VL §8，不整块染色）。 */
export function Note({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "accent" | "line";
  children: ReactNode;
}) {
  const bar =
    tone === "warning" ? "border-warning" : tone === "accent" ? "border-accent" : "border-line";
  return (
    <div className={`${BODY_W} border-l-[3px] ${bar} bg-surface px-6 py-3 text-[13px] leading-relaxed text-secondary`}>
      {children}
    </div>
  );
}

/** 行内代码 / 路径。 */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-inner bg-sunken px-1 py-1 font-mono text-[13px] text-primary">
      {children}
    </code>
  );
}
