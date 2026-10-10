import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "付款计划" };

/** 付款计划占位页（M8-a）。防 manifest.nav 死链；正式页 M8-c 上线。 */
export default function FinancePaymentsPage() {
  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/finance"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回收支台账
        </Link>
        <h1 className="mt-3 text-[28px] font-semibold">付款计划</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
          按合同额生成五段付款计划（开工 / 水电完成 / 主体完工 / 竣工 / 保修金），
          验收节点通过后对应段自动进入「可收款」态。
        </p>
      </header>

      <section className="rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">
          付款计划将在 M8-c 上线
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          五段生成、解锁派生与标记已付正在路上；当前可在
          <Link
            href="/finance"
            className="mx-1 text-accent-ink underline-offset-4 hover:underline"
          >
            收支台账
          </Link>
          查看已录入的收支记录与毛利粗算。
        </p>
      </section>
    </div>
  );
}
