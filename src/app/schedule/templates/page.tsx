import Link from "next/link";

export const metadata = { title: "工序模板库" };

/** 工序模板库占位页（M6-a 防死链；11 工序 × 3 档编辑在 M6-d 交付）。 */
export default function ScheduleTemplatesPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/schedule"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回时间管控
        </Link>
      </div>

      <header className="border-b border-line pb-6">
        <h1 className="text-[28px] font-semibold leading-tight">工序模板库</h1>
        <p className="mt-2 text-[13px] text-secondary">
          11 道标准工序 × 3 个面积档（90㎡以下 / 90-130㎡ / 130㎡以上）的标准工期。
        </p>
      </header>

      {/* 诚实空态：不造假表格，明说编辑功能在 M6-d 上线 */}
      <div className="mt-8 rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">模板编辑将在 M6-d 上线</p>
        <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-secondary">
          届时可在此编辑各工序在三个面积档下的标准天数，新建项目排程将按面积档自动套用；
          修改模板不回溯已生成的排程（排程生成即快照）。
        </p>
        <Link
          href="/schedule"
          className="mt-4 inline-flex h-8 items-center rounded-inner bg-accent px-3 text-[13px] font-medium text-white whitespace-nowrap transition-colors hover:opacity-90"
        >
          返回预警看板
        </Link>
      </div>
    </div>
  );
}
