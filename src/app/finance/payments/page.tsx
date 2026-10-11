import Link from "next/link";
import { formatCny } from "@/core/domain/pricing";
import { listPlanProjects, getPlanView } from "@/modules/finance/server/payments";
import { PaymentPlanBoard, GeneratePlanForm } from "../PaymentPlanBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "付款计划" };

/**
 * 付款计划页（M8-c，去占位重写）。
 *
 * - ?projectId= 深链（无参→ listPlanProjects 默认选中第一个 hasPlan 的项目，无则第一个）。
 * - 顶部对照条：计划已标记已付 ¥A · 台账已入账合同款 ¥B · 差额 ¥(A−B)（§1-2 诚实对照，
 *   差额非零标 warning 不静默对齐）。
 * - 有 hasPlan → 渲染 PaymentPlanBoard（含清空按钮）。
 * - 无计划 → 空态 + GeneratePlanForm（canGenerate false 且 contractAmount<=0 时禁用 + 提示录入合同额）。
 * - 头部明示应收金额＝生成时快照（§1-4）。
 */
export default async function FinancePaymentsPage({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  const projects = await listPlanProjects();

  // 无项目：诚实空态
  if (projects.length === 0) {
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
          <p className="text-[15px] font-medium text-primary">暂无项目</p>
          <p className="mt-2 text-[13px] text-secondary">
            请先创建项目后再生成付款计划。
          </p>
        </section>
      </div>
    );
  }

  // 默认选中：URL 指定且有效 → 用之；否则第一个 hasPlan 的项目；无则第一个项目
  let projectId = searchParams?.projectId;
  if (!projectId || !projects.some((p) => p.id === projectId)) {
    const firstWithPlan = projects.find((p) => p.hasPlan);
    projectId = firstWithPlan?.id ?? projects[0]?.id;
  }

  const view = await getPlanView(projectId!);
  const reconWarning = view.reconDiff !== 0;

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

      {/* 项目筛选：GET form（仿 /finance） */}
      <form
        className="flex flex-wrap items-end gap-3"
        method="get"
        action="/finance/payments"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-secondary">
            项目
          </span>
          <select
            name="projectId"
            defaultValue={projectId ?? ""}
            className="block w-full rounded-inner border border-line bg-surface px-3 py-2 pr-8 text-[13px] text-primary focus:outline-none focus:border-accent"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-inner bg-accent px-4 text-[13px] font-medium text-white whitespace-nowrap transition-colors hover:brightness-95"
          >
            筛选
          </button>
          <Link
            href="/finance/payments"
            className="inline-flex h-9 items-center justify-center rounded-inner border border-line bg-surface px-4 text-[13px] text-secondary whitespace-nowrap transition-colors hover:text-primary"
          >
            清除
          </Link>
        </div>
      </form>

      {/* 对照条（§1-2 诚实对照，差额非零标 warning 不静默对齐） */}
      <section className="rounded-card border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] text-secondary">计划已标记已付</span>
            <span className="num text-[15px] font-medium text-primary whitespace-nowrap">
              {formatCny(view.planPaidTotal)}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] text-secondary">台账已入账合同款</span>
            <span className="num text-[15px] font-medium text-primary whitespace-nowrap">
              {formatCny(view.ledgerContractIncome)}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[13px] text-secondary">差额</span>
            <span
              className={`num text-[15px] font-medium whitespace-nowrap ${
                reconWarning ? "text-warning" : "text-primary"
              }`}
            >
              {formatCny(view.reconDiff)}
            </span>
          </div>
        </div>
        {reconWarning && (
          <p className="mt-2 text-[12px] text-warning">
            计划与台账两本账口径不同，差额属正常
          </p>
        )}
      </section>

      {/* 快照语义提示（§1-4） */}
      <p className="text-[13px] leading-relaxed text-secondary">
        应收金额按签约时合同额生成；合同额变更后如需调整，清空重生成。
      </p>

      {/* 计划看板 或 空态 */}
      {view.hasPlan ? (
        <PaymentPlanBoard
          segments={view.segments}
          projectId={view.projectId}
        />
      ) : (
        <section className="rounded-card border border-line bg-surface px-8 py-12 text-center">
          <p className="text-[15px] font-medium text-primary">暂无付款计划</p>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            按合同额生成五段付款计划（开工 / 水电完成 / 主体完工 / 竣工 / 保修金）。
          </p>
          <div className="mt-4 flex justify-center">
            <GeneratePlanForm
              projectId={view.projectId}
              canGenerate={view.canGenerate}
              contractAmount={view.contractAmount}
            />
          </div>
        </section>
      )}
    </div>
  );
}
