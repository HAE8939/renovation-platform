import Link from "next/link";
import { Badge } from "@/core/ui/Badge";
import { Card, SectionTitle } from "@/core/ui/Card";
import { formatCny, formatPercent, formatSignedCny } from "@/core/domain/pricing";
import { formatSignedPercent } from "@/core/domain/dashboard";
import type { Light } from "@/core/domain/health";
import { getDashboardOverview } from "@/modules/dashboard/server/overview";

/**
 * 数据驾驶舱页面（M9-b-1）：server component，零客户端交互。
 * 全部数字来自 getDashboardOverview 的真实聚合；不可算一律显「—」。
 * 页面不含业务算式与阈值字面量——口径与换算都收敛在 core/domain
 * 与 modules/dashboard/server，本文件只做展示与链接。
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "数据驾驶舱" };

/** 色点配色（全站既有范式）：green/yellow/red，neutral 为未知态灰点。 */
const dotCls: Record<Light | "neutral", string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  neutral: "bg-sunken",
};

/** 灯位 tooltip 词语（展示文案，不含阈值）。 */
const lightWord: Record<Light, string> = { green: "正常", yellow: "预警", red: "告警" };

/** 线索阶段中文标签（本地映射，不 import crm/stages.ts 模块内部，照 ProjectTabs/finance 既有先例）。 */
const STAGE_LABEL: Record<string, string> = {
  leads: "线索",
  contacted: "已联系",
  confirmed: "已确认",
  quoted: "已报价",
  signed: "已签约",
};

/** 全站统一色点范式。 */
function Dot({ cls }: { cls: string }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

export default async function DashboardPage() {
  const { kpi, health, todos, funnel, cash, margins, generatedAt } = await getDashboardOverview();

  // 折线坐标串：只做几何拼接（xPct / incomeY / expenseY 均由服务层算好），本页不算数。
  const incomePts = cash.points.map((p) => `${p.xPct},${p.incomeY}`).join(" ");
  const expensePts = cash.points.map((p) => `${p.xPct},${p.expenseY}`).join(" ");

  return (
    <div className="space-y-12">
      {/* 一、页头 */}
      <section>
        <h1 className="text-[28px] font-semibold leading-[1.3]">数据驾驶舱</h1>
        <p className="mt-2 text-xs text-secondary">
          口径范围：全部未归档项目 · 生成于 {generatedAt}
        </p>
      </section>

      {/* 二、KPI 四格：主级 28px，其余 20px，刻意成阶梯 */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col">
          <p className="text-xs text-secondary">本月签单额</p>
          <p className="num mt-2 text-[28px] font-semibold leading-[1.2]">
            {formatCny(kpi.signedThisMonth)}
          </p>
          <p className="mt-2 text-xs text-secondary">
            {kpi.momPct === null
              ? "上月无签单，不可比"
              : `较上月 ${formatSignedPercent(kpi.momPct)}`}
          </p>
        </Card>

        <Card className="flex flex-col">
          <p className="text-xs text-secondary">在建项目数</p>
          <p className="num mt-2 text-[20px] font-semibold leading-[1.2]">
            {kpi.activeProjects}
          </p>
          <p className="mt-2 text-xs text-secondary">设计中 / 施工中 / 验收中</p>
          <Link href="/projects" className="mt-auto pt-2 text-xs text-accent-ink">
            全部项目 →
          </Link>
        </Card>

        <Card className="flex flex-col">
          <p className="flex items-center gap-2 text-xs text-secondary">
            <Dot cls={dotCls[kpi.collectionLight]} />
            全司回款率
          </p>
          <p className="num mt-2 text-[20px] font-semibold leading-[1.2]">
            {kpi.collectionRate === null ? "—" : formatPercent(kpi.collectionRate)}
          </p>
          {kpi.collectionBar !== null && (
            <div className="mt-2 h-1 w-full rounded-full bg-sunken">
              <div
                className="h-1 rounded-full bg-accent"
                style={{ width: kpi.collectionBar ?? "0%" }}
              />
            </div>
          )}
          <Link href="/finance" className="mt-auto pt-2 text-xs text-accent-ink">
            财务总览 →
          </Link>
        </Card>

        <Card className="flex flex-col">
          <p className="text-xs text-secondary">风险项数</p>
          <p className="num mt-2 text-[20px] font-semibold leading-[1.2]">{kpi.risk.total}</p>
          <p className="mt-2 text-xs text-secondary">
            {`工期 ${kpi.risk.scheduleRed} · 质量 ${kpi.risk.qualityRed} · 预算 ${kpi.risk.budgetRed} · 变更 ${kpi.risk.changeWarn}`}
          </p>
        </Card>
      </section>

      {/* 三、项目健康矩阵（左，约 60%）+ 全局待办中心（右） */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <SectionTitle>项目健康矩阵</SectionTitle>
          {health.length === 0 ? (
            <p className="mt-4 text-sm text-secondary">暂无在建项目</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {health.map((row) => (
                <Link key={row.id} href={`/projects/${row.id}`} className="block min-w-0">
                  <Card className="h-full">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="truncate text-[15px] font-semibold">{row.name}</h3>
                      <span className="num shrink-0 text-xs text-muted">{row.code}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {(
                        [
                          ["工期", row.lights.schedule],
                          ["质量", row.lights.quality],
                          ["预算", row.lights.budget],
                        ] as const
                      ).map(([label, light]) => (
                        <span
                          key={label}
                          className="flex items-center gap-1 text-xs text-secondary"
                          title={`${label}：${lightWord[light]}`}
                        >
                          <Dot cls={dotCls[light]} />
                          {label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[13px]">
                      {row.hasSchedule ? (
                        <>
                          <span className="text-secondary">进度 </span>
                          <span className="num">{row.progress}%</span>
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-secondary">
                          <Dot cls={dotCls.neutral} />
                          未排程
                        </span>
                      )}
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-secondary">
                      <p>项目经理 {row.pm ?? "—"}</p>
                      <p>预计完工 {row.plannedEnd ?? "—"}</p>
                    </div>
                    {row.changeWarn && (
                      <p className="mt-2 text-xs text-warning">累计变更超合同额 5%</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <SectionTitle>全局待办中心</SectionTitle>
          <Card padded={false} className="mt-4">
            <ul className="divide-y divide-line">
              {todos.map((g) => (
                <li key={g.key} className="px-6 py-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium">{g.label}</span>
                    {g.count > 0 ? (
                      <span className="num text-[13px]">{g.count}</span>
                    ) : (
                      <span className="text-[13px] text-muted">无</span>
                    )}
                  </div>
                  {g.placeholder ? (
                    <p className="mt-2 text-xs text-secondary">人员管控模块未上线，暂不统计</p>
                  ) : g.items.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {g.items.map((it, i) => (
                        <li key={`${g.key}-${i}`} className="min-w-0">
                          <Link
                            href={it.href}
                            className="block truncate text-xs text-secondary hover:text-accent-ink"
                          >
                            {it.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2">
                    {g.href === "" ? (
                      <Badge variant="outline">未接入</Badge>
                    ) : (
                      <Link href={g.href} className="text-xs text-accent-ink">
                        打开模块 →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* 四、月度现金收付（左）+ 项目毛利率排行（右）：与上节同构的 3:2 版式；items-start
          让两卡各自按内容取高，避免被拉成等高空白（V0.3 §7.4 节奏） */}
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <SectionTitle>月度现金收付</SectionTitle>
          <p className="mt-2 text-xs text-secondary">现金收付口径 · {cash.rangeLabel}</p>
          <div className="mt-3 space-y-1 text-[12px] text-secondary">
            <p className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-[2px] w-3 bg-accent" />
              当月收款
            </p>
            <p className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-[2px] w-3 bg-muted" />
              当月支出
            </p>
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="mt-4 h-40 w-full"
            role="img"
            aria-label={`近 6 个月现金收付折线，收款合计 ${formatCny(cash.totalIncome)}，支出合计 ${formatCny(cash.totalExpense)}`}
          >
            <line
              x1={0}
              y1={100}
              x2={100}
              y2={100}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {cash.hasAnyCash && (
              <>
                <polyline
                  points={incomePts}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  points={expensePts}
                  fill="none"
                  stroke="var(--text-disabled)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
          <div className="mt-2 grid grid-cols-6">
            {cash.points.map((p) => (
              <span key={p.key} className="text-center text-[12px] text-secondary">
                {p.label}
              </span>
            ))}
          </div>
          {!cash.hasAnyCash && (
            <p className="mt-2 text-sm text-secondary">近 6 个月暂无现金记录</p>
          )}
          <ul className="mt-4 divide-y divide-line">
            <li className="grid grid-cols-[auto_1fr_1fr_1fr] items-baseline gap-x-4 py-2 text-[12px] text-muted">
              <span>月份</span>
              <span className="text-right">收款</span>
              <span className="text-right">支出</span>
              <span className="text-right">净现金</span>
            </li>
            {cash.points.map((p) => (
              <li
                key={p.key}
                className="grid grid-cols-[auto_1fr_1fr_1fr] items-baseline gap-x-4 py-2"
              >
                <span className="text-[13px] text-secondary">{p.label}</span>
                <span className="num text-right text-[13px]">{formatCny(p.income)}</span>
                <span className="num text-right text-[13px]">{formatCny(p.expense)}</span>
                <span
                  className={`num text-right text-[13px] ${
                    p.cashTone === "warning" ? "text-warning" : "text-success"
                  }`}
                >
                  {formatSignedCny(p.net)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-secondary">
            近 6 个月合计 收款 {formatCny(cash.totalIncome)} · 支出 {formatCny(cash.totalExpense)} ·
            净现金 {formatSignedCny(cash.totalNet)}
          </p>
        </Card>

        <Card className="min-w-0">
          <SectionTitle>项目毛利率排行</SectionTitle>
          <p className="mt-2 text-xs text-secondary">
            口径：合同额 + 变更 − 支出（项目维度，非现金收付）
          </p>
          {margins.rows.length === 0 ? (
            <p className="mt-4 text-sm text-secondary">暂无项目</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {margins.rows.map((row) => (
                <li key={row.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-[13px] ${row.rankable ? "" : "text-secondary"}`}
                    >
                      {row.name}
                    </span>
                    <span className="num shrink-0 text-[12px] text-muted">{row.code}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {row.rankable ? (
                      <div className="h-2 flex-1 rounded-full bg-sunken">
                        <div
                          className="h-2 rounded-full bg-accent"
                          style={{ width: row.barWidth ?? "0%" }}
                        />
                      </div>
                    ) : (
                      <div className="h-2 flex-1" />
                    )}
                    <span className="num w-14 shrink-0 text-right text-[13px]">
                      {!row.rankable || row.rate === null ? "—" : formatPercent(row.rate)}
                    </span>
                    {row.rankable && <Dot cls={dotCls[row.light]} />}
                  </div>
                  {!row.rankable && <p className="mt-2 text-[12px] text-muted">{row.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* 五、商务漏斗（真内容）+ 人效排行灰占位（不画假图、不放假数字）；items-start 让两卡各自
          按内容取高，避免占位卡被漏斗拉成一整列空白（V0.3 §7.4 节奏） */}
      <section className="grid items-start gap-4 sm:grid-cols-2">
        <Card>
          <SectionTitle>商务漏斗</SectionTitle>
          <p className="mt-2 text-xs text-secondary">阶段存量分布（非累计流量）</p>
          <ul className="mt-4 space-y-2">
            {funnel.stages.map((s) => (
              <li key={s.stage} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-[13px] text-secondary">
                  {STAGE_LABEL[s.stage] ?? s.stage}
                </span>
                <div className="h-2 flex-1 rounded-full bg-sunken">
                  <div className="h-2 rounded-full bg-accent" style={{ width: s.barWidth }} />
                </div>
                <span className="num w-8 shrink-0 text-right text-[13px] text-primary">
                  {s.count}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-secondary">
            签约率{" "}
            <span className="num text-primary">
              {funnel.conversionRate === null ? "—" : formatPercent(funnel.conversionRate)}
            </span>
          </p>
        </Card>
        <Card>
          <SectionTitle>人效排行</SectionTitle>
          <p className="mt-2 text-xs text-secondary">未接入：人员管控模块未上线</p>
        </Card>
      </section>
    </div>
  );
}
