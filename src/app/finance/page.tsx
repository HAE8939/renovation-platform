import Link from "next/link";
import { formatCny, formatPercent } from "@/core/domain/pricing";
import { listRecords } from "@/modules/finance/server/records";
import { ViewToggle } from "./ViewToggle";
import { NewRecordModal } from "./NewRecordModal";
import { FinanceLedger } from "./FinanceLedger";

export const dynamic = "force-dynamic";
export const metadata = { title: "财务管控" };

/** 色点（非 emoji）：green/yellow/red/gray 用 V0.3 状态色令牌（仿 schedule LightDot）。 */
function MarginDot({ light }: { light: "green" | "yellow" | "red" | "neutral" }) {
  const cls =
    light === "green"
      ? "bg-success"
      : light === "yellow"
        ? "bg-warning"
        : light === "red"
          ? "bg-danger"
          : "bg-muted";
  return (
    <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />
  );
}

/** 汇总条单格：标签 + 金额 + 可选色点。无阴影、气声描边。 */
function StatBox({
  label,
  value,
  hint,
  dot,
}: {
  label: string;
  value: string;
  hint?: string;
  dot?: "green" | "yellow" | "red" | "neutral";
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-secondary">{label}</span>
        {dot ? <MarginDot light={dot} /> : null}
      </div>
      <div className="mt-1 num text-[17px] font-semibold text-primary whitespace-nowrap">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-secondary">{hint}</div> : null}
    </div>
  );
}

/**
 * 收支台账页（M8-a 只读 + M8-b 写入）。
 * - ?view=income|expense 双 Tab（默认收入）；?projectId= 项目筛选。
 * - 汇总条口径不受 Tab 切换影响（取全部记录口径）。
 * - 待收款（合同额−已收，缺口口径）与计划未付合计（Σ 未付段 amountDue）分列两框（§7-12）。
 * - 表格抽成客户端 FinanceLedger（行可点开编辑/删除抽屉）；汇总与筛选留 server。
 */
export default async function FinanceLedgerPage({
  searchParams,
}: {
  searchParams: { view?: string; projectId?: string };
}) {
  const view: "income" | "expense" =
    searchParams?.view === "expense" ? "expense" : "income";
  const projectId = searchParams?.projectId || undefined;

  const data = await listRecords({ projectId, view });
  const { rows, projectOptions, summary } = data;

  const marginText =
    summary.marginRate === null ? "—" : formatPercent(summary.marginRate);
  const marginHint =
    summary.marginRate === null ? "合同额未录入，不可算" : `毛利率 ${marginText}`;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">收支台账</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              按项目录入收入与支出，即时复算毛利与毛利率。付款计划页（M8-c 上线）
              展示五段应收与解锁进度。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <NewRecordModal
              projects={projectOptions}
              defaultView={view}
              defaultProjectId={projectId ?? null}
            />
            <ViewToggle view={view} />
          </div>
        </div>
      </header>

      {/* 项目筛选：服务端 GET form（仿 quality/issues 直链，无客户端状态） */}
      <form
        className="flex flex-wrap items-end gap-3"
        method="get"
        action="/finance"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-secondary">项目</span>
          <select
            name="projectId"
            defaultValue={projectId ?? ""}
            className="block w-full rounded-inner border border-line bg-surface px-3 py-2 pr-8 text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value="">全部项目</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="view" value={view} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-inner bg-accent px-4 text-sm font-medium text-white whitespace-nowrap transition-colors hover:brightness-95"
          >
            筛选
          </button>
          <Link
            href="/finance"
            className="inline-flex h-9 items-center justify-center rounded-inner border border-line bg-surface px-4 text-sm text-secondary whitespace-nowrap transition-colors hover:text-primary"
          >
            清除
          </Link>
        </div>
      </form>

      {/* 汇总条：口径不受 Tab 切换影响。待收款与计划未付合计分列两框（§7-12）。 */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatBox label="合同额" value={formatCny(summary.contractAmount)} />
        <StatBox label="已收款" value={formatCny(summary.receivedTotal)} />
        <StatBox
          label="待收款"
          value={formatCny(summary.pendingTotal)}
          hint="合同额 − 已收"
        />
        <StatBox
          label="计划未付合计"
          value={formatCny(summary.unpaidPlanTotal)}
          hint="付款段未标记已付"
        />
        <StatBox label="总支出" value={formatCny(summary.expenseTotal)} />
        <StatBox
          label="毛利"
          value={formatCny(summary.grossProfit)}
          hint={marginHint}
          dot={summary.marginRate === null ? "neutral" : summary.marginLight}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">
            {view === "income" ? "收入记录" : "支出记录"}
          </h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            共 {rows.length} 条
          </span>
        </div>

        {rows.length > 0 ? (
          <FinanceLedger rows={rows} />
        ) : (
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">
              暂无{view === "income" ? "收入" : "支出"}记录——台账手工录入
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              点击右上角「+ 新建记录」录入第一笔。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
