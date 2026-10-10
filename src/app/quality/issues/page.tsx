import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "问题台账" };

export default function QualityIssuesPage() {
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
        <h1 className="text-[28px] font-semibold leading-tight">问题台账</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
          验收退回自动建问题，亦支持手工新建。问题台账将在 M7-c 上线，
          届时提供筛选、整改记录、复验闭环与手工新建入口。
        </p>
      </header>

      <div className="rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">
          问题台账将在 M7-c 上线
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          当前阶段仅交付验收节点列表与状态机；整改、复验、关闭与手工新建问题
          的交互将在 M7-c 的台账页完成。
        </p>
      </div>
    </div>
  );
}
