import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "质量档案" };

export default function QualityArchivePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/quality"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回质量管控
        </Link>
      </div>

      <header className="border-b border-line pb-6">
        <h1 className="text-[28px] font-semibold leading-tight">质量档案</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
          按项目汇总验收节点与质量问题，提供全事件时间轴与 A4 打印。
          质量档案将在 M7-d 上线，届时提供项目索引页、时间轴详情与打印导出。
        </p>
      </header>

      <div className="rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">
          质量档案将在 M7-d 上线
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          当前阶段仅交付验收节点列表与状态机；项目级时间轴、节点/问题统计
          与打印将在 M7-d 的档案页完成。
        </p>
      </div>
    </div>
  );
}
