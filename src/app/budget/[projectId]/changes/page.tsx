import Link from "next/link";
import { notFound } from "next/navigation";
import { listChanges } from "@/modules/budget/server/changes";
import { getProjectDetail } from "@/modules/budget/server/projects";
import { changeTotal, changeWatch, type ChangeRow } from "@/core/domain/ledger";
import { formatCny, formatSignedCny } from "@/core/domain/pricing";
import { ChangesBoard } from "./ChangesBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "变更单" };

interface PageProps {
  params: { projectId: string };
}

/**
 * 变更单页（M9-a）。汇总条 + 预警横幅 + 列表 + 新建/编辑 Modal + 行内两步删除。
 * 金额带符号（正=增加、负=减少）；累计超合同额 5% → warning 描边横幅。
 * 口径全走 core/domain/ledger（changeTotal/changeWatch）与 core/domain/pricing
 * （formatSignedCny）—— 页面不得各写算式。
 */
export default async function ChangesPage({ params }: PageProps) {
  const [detail, rows] = await Promise.all([
    getProjectDetail(params.projectId),
    listChanges(params.projectId),
  ]);
  if (!detail) notFound();

  const changeRows: ChangeRow[] = rows.map((r) => ({ amount: r.amount }));
  const total = changeTotal(changeRows);
  const contractAmount = detail.contractAmount ?? 0;
  const { warn, ratio } = changeWatch(contractAmount, total);
  const afterChange = contractAmount + total;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <Link
          href={`/budget/${detail.id}`}
          className="text-xs text-secondary underline-offset-4 hover:text-accent-ink hover:underline"
        >
          ← 返回报价单
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="text-[20px] font-semibold text-primary">变更单</h1>
          <span className="text-[13px] text-secondary">{detail.name}</span>
          <span className="num text-xs text-secondary">{detail.code}</span>
        </div>
      </header>

      {/* 汇总条：合同额 / 累计变更 / 变更后总额 */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="合同额" value={formatCny(contractAmount)} />
        <SummaryCard
          label="累计变更"
          value={formatSignedCny(total)}
          tone={warn ? "warning" : "neutral"}
        />
        <SummaryCard label="变更后总额" value={formatCny(afterChange)} accent />
      </section>

      {/* 预警横幅：累计变更超合同额 5% → warning 描边，不铺红底 */}
      {warn && (
        <div
          role="alert"
          className="mb-6 rounded-inner border border-warning bg-surface px-4 py-3 text-[13px] leading-relaxed text-warning"
        >
          累计变更额已超合同额 5%，请关注
          {ratio !== null && (
            <span className="num ml-2 whitespace-nowrap">
              （当前 {total >= 0 ? "+" : ""}{(ratio * 100).toFixed(1)}%）
            </span>
          )}
        </div>
      )}

      <ChangesBoard
        projectId={detail.id}
        rows={rows}
        contractAmount={contractAmount}
        changeTotal={total}
        changeWarn={warn}
      />
    </div>
  );
}

/** 汇总卡（V0.3 刻度：字号 12/13/15/20/28；无阴影、单点 accent）。 */
function SummaryCard({
  label,
  value,
  accent = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "neutral" | "warning";
}) {
  const valueCls = accent
    ? "text-[20px] font-semibold text-accent-ink"
    : tone === "warning"
      ? "text-[20px] font-semibold text-warning"
      : "text-[20px] font-semibold text-primary";
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-secondary">
        {label}
      </div>
      <div className={`num mt-2 whitespace-nowrap ${valueCls}`}>{value}</div>
    </div>
  );
}
