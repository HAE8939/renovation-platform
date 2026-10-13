import Link from "next/link";
import { Badge } from "@/core/ui/Badge";
import { Card, SectionTitle } from "@/core/ui/Card";
import { Table, Td, Th } from "@/core/ui/Table";
import { formatCny, formatPercent, formatSignedCny } from "@/core/domain/pricing";
import { formatSignedPercent } from "@/core/domain/dashboard";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/core/domain/types";
import type { Light } from "@/core/domain/health";
import { getDashboardOverview } from "@/modules/dashboard/server/overview";

/**
 * 数据驾驶舱页面（M9-b-1 建页 · M10-b 排版改版）。
 * server component，零客户端交互；全部数字来自 getDashboardOverview 的真实聚合，
 * 不可算一律显「—」。本页不含业务算式与阈值字面量——口径与几何换算都收敛在
 * core/domain 与 modules/dashboard/server。
 *
 * M10-b 改版（HAE：「排版很丑，配不上驾驶舱」；已批样张 docs/preview/dashboard-v2.html）：
 * ① 四张等大 KPI 卡 → 本月签单额独占主级带 + 三格次级紧凑（同 /finance 毛利卡已定的阶梯法）；
 * ② 待办中心从右列长条 → 「需要你处理」横向清单，按数量倒序并到第二屏；
 * ③ 健康矩阵两张大卡 → 全部在册项目的密集表（项目名不截断、30 个项目也不崩）；
 * ④ 现金与毛利并排、漏斗收在一屏内。
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

/** 线索阶段中文标签（本地映射，不 import crm 模块内部，照 ProjectTabs/finance 既有先例）。 */
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
  const { kpi, health, todos, funnel, cash, margins, archivedFacts, generatedAt } =
    await getDashboardOverview();

  // 折线坐标串：只做几何拼接（xPct / incomeY / expenseY 均由服务层算好），本页不算数。
  const incomePts = cash.points.map((p) => `${p.xPct},${p.incomeY}`).join(" ");
  const expensePts = cash.points.map((p) => `${p.xPct},${p.expenseY}`).join(" ");

  // 「需要你处理」：占位组（人员管控未上线）不进这条清单——它不是待办，是留位声明。
  const actionGroups = todos.filter((g) => !g.placeholder).sort((a, b) => b.count - a.count);
  const actionTotal = actionGroups.reduce((s, g) => s + g.count, 0);

  return (
    <div className="space-y-12">
      {/* 一、页头 */}
      <section>
        <h1 className="text-[28px] font-semibold leading-[1.3]">数据驾驶舱</h1>
        <p className="mt-2 text-xs text-secondary">
          口径：钱按事实（签单额 / 回款率 / 现金收付 / 毛利含已归档项目的历史事实）·
          事按可见性（风险 · 待办 · 项目健康度不含已归档）· 生成于 {generatedAt}
        </p>
        {/* 归档参与说明（M10-c）：只在真有归档项目参与时出现，无归档一个字都不加。
            不写这句，员工看到的是「刚归档一个项目，现金线掉了一截 / 又好像没掉」，
            然后开始怀疑整本账——沉默地少一个数字，比数字变小更糟。 */}
        {archivedFacts.projectCount > 0 && (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            当前有 <span className="num font-medium text-secondary">{archivedFacts.projectCount}</span>{" "}
            个已归档项目：其历史已收{" "}
            <span className="num">{formatCny(archivedFacts.income)}</span>、支出{" "}
            <span className="num">{formatCny(archivedFacts.expense)}</span>{" "}
            仍计入上方签单额、回款率、现金线与右侧毛利排行（发生过的事不因归档消失）；
            它们不再出现在「需要你处理」与「项目健康度」里。要连历史一起排除，请到项目中心恢复归档。
          </p>
        )}
      </section>

      {/* 二、主指标带：签单额独占主级，其余三格降次级紧凑（V0.3 §7.4 尺寸成阶梯、慎用等分） */}
      <section className="grid gap-8 border-b border-line pb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.14em] text-secondary">本月签单额</p>
          <p className="num mt-3 text-[28px] font-semibold leading-[1.2]">
            {formatCny(kpi.signedThisMonth)}
          </p>
          <p
            className={`mt-2 text-xs ${
              kpi.momPct === null
                ? "text-secondary"
                : kpi.momPct >= 0
                  ? "text-success"
                  : "text-warning"
            }`}
          >
            {kpi.momPct === null
              ? "上月无签单，不可比"
              : `较上月 ${formatSignedPercent(kpi.momPct)}（上月 ${formatCny(kpi.prevMonthSigned)}）`}
          </p>
          {kpi.momBar && (
            <div className="mt-4 flex items-end gap-3">
              {/* 百分比高度必须有确定高度的父盒（h-8），否则父高 auto 时条子塌成 0 高 */}
              <span className="flex h-8 items-end" aria-hidden>
                <span className="block w-6 bg-sunken" style={{ height: kpi.momBar.prev ?? "2px" }} />
              </span>
              <span className="flex h-8 items-end" aria-hidden>
                <span className="block w-6 bg-accent" style={{ height: kpi.momBar.cur }} />
              </span>
              <span className="text-[12px] text-muted">近两月签单对比 · 左上月 右本月</span>
            </div>
          )}
        </div>

        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="min-w-0 pb-4 sm:border-l-0 sm:px-5 sm:pb-0 sm:first:pl-0">
            <p className="text-xs text-secondary">在建项目数</p>
            <p className="num mt-1 text-[20px] font-semibold leading-[1.2]">{kpi.activeProjects}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-secondary">
              设计中 / 施工中 / 验收中
            </p>
            <Link href="/projects" className="mt-2 inline-block text-xs text-accent-ink">
              全部项目 →
            </Link>
          </div>
          <div className="min-w-0 py-4 sm:px-4 sm:py-0">
            <p className="flex items-center gap-2 text-xs text-secondary">
              <Dot cls={dotCls[kpi.collectionLight]} />
              全司回款率
            </p>
            <p className="num mt-1 text-[20px] font-semibold leading-[1.2]">
              {kpi.collectionRate === null ? "—" : formatPercent(kpi.collectionRate)}
            </p>
            {kpi.collectionBar !== null && (
              <div className="mt-2 h-1 w-full bg-sunken">
                <div className="h-1 bg-accent" style={{ width: kpi.collectionBar ?? "0%" }} />
              </div>
            )}
            <Link href="/finance" className="mt-2 inline-block text-xs text-accent-ink">
              财务总览 →
            </Link>
          </div>
          <div className="min-w-0 pt-4 sm:px-5 sm:pt-0 sm:pl-4">
            <p className="text-xs text-secondary">风险项数</p>
            <p className="num mt-1 text-[20px] font-semibold leading-[1.2]">{kpi.risk.total}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-secondary">
              工期 {kpi.risk.scheduleRed} · 质量 {kpi.risk.qualityRed} · 预算 {kpi.risk.budgetRed} ·
              变更 {kpi.risk.changeWarn}
            </p>
          </div>
        </div>
      </section>

      {/* 三、需要你处理：横向清单，按数量倒序；每项带具体主体与入口
          （老板开驾驶舱的第一问是"哪儿要出事"，不是"总数多少"） */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle>需要你处理</SectionTitle>
          <p className="text-xs text-secondary">
            共 <span className="num">{actionTotal}</span> 项 · 按模块归集
          </p>
        </div>
        {actionGroups.length === 0 ? (
          <Card className="mt-4">
            <p className="text-sm text-secondary">
              没有待处理事项。验收待审、质量问题、设计待审、待收付款段都会汇总到这里。
            </p>
          </Card>
        ) : (
          <Card padded={false} className="mt-4">
            <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3 lg:divide-x">
              {actionGroups.map((g) => (
                <li key={g.key} className="min-w-0 border-line p-5 sm:border-b lg:border-b-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`num text-[20px] font-semibold leading-none ${
                        g.count > 0 ? "text-primary" : "text-muted"
                      }`}
                    >
                      {g.count}
                    </span>
                    <span className="text-[13px] font-medium">{g.label}</span>
                  </div>
                  {g.items.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {g.items.map((it, i) => (
                        <li key={`${g.key}-${i}`} className="min-w-0">
                          <Link
                            href={it.href}
                            className="block truncate text-[12px] leading-relaxed text-secondary transition-colors duration-[120ms] hover:text-accent-ink"
                            title={it.label}
                          >
                            {it.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[12px] text-muted">
                      {g.count > 0 ? "另有同类事项" : "暂无"}
                    </p>
                  )}
                  <Link
                    href={g.href}
                    className="mt-3 inline-block text-[12px] text-accent-ink underline-offset-4 hover:underline"
                  >
                    打开模块 →
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* 四、项目健康度：全部在册项目的密集表（M10-b 由两张大卡改来）——
          在建优先、其余按编号；一项目一行，项目名不截断，项目多了也不崩。 */}
      <section>
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle>项目健康度</SectionTitle>
          <p className="text-xs text-secondary">
            <span className="num">{health.length}</span> 个在册项目 · 点行进入项目中心
          </p>
        </div>
        {health.length === 0 ? (
          <p className="mt-4 text-sm text-secondary">还没有项目。</p>
        ) : (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>项目</Th>
                  <Th>状态</Th>
                  <Th>整体进度</Th>
                  <Th>三灯</Th>
                  <Th align="right">合同额</Th>
                  <Th align="right">已收</Th>
                  <Th align="right">毛利</Th>
                  <Th align="right">毛利率</Th>
                  <Th>风险</Th>
                </tr>
              </thead>
              <tbody>
                {health.map((row) => {
                  const risks = [
                    row.overdueTasks > 0 ? `超期 ${row.overdueTasks}` : null,
                    row.openIssues > 0 ? `问题 ${row.openIssues}` : null,
                    row.changeWarn ? "变更超 5%" : null,
                  ].filter(Boolean);
                  return (
                    <tr key={row.id} className="group hover:bg-canvas">
                      <Td>
                        <Link
                          href={`/projects/${row.id}`}
                          className="font-medium text-primary transition-colors duration-[120ms] group-hover:text-accent-ink"
                        >
                          {row.name}
                        </Link>
                        <span className="num ml-2 text-[12px] text-muted">{row.code}</span>
                      </Td>
                      <Td>
                        <Badge variant="outline">
                          {PROJECT_STATUS_LABEL[row.status as ProjectStatus] ?? row.status}
                        </Badge>
                      </Td>
                      <Td>
                        {row.hasSchedule ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 bg-sunken">
                              <div
                                className="h-1 bg-accent"
                                style={{ width: `${row.progress}%` }}
                              />
                            </div>
                            <span className="num text-[12px] text-secondary">{row.progress}%</span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-muted">未排程</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {(
                            [
                              ["工期", row.lights.schedule],
                              ["质量", row.lights.quality],
                              ["预算", row.lights.budget],
                            ] as const
                          ).map(([label, light]) => (
                            <span
                              key={label}
                              className="flex items-center gap-1 text-[12px] text-secondary"
                              title={`${label}：${lightWord[light]}`}
                            >
                              <Dot cls={dotCls[light]} />
                              {label}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td align="right" className="num text-[12px] whitespace-nowrap">
                        {formatCny(row.contractAmount)}
                      </Td>
                      <Td align="right" className="num text-[12px] whitespace-nowrap">
                        {formatCny(row.incomeAmount)}
                      </Td>
                      <Td align="right" className="num text-[12px] whitespace-nowrap">
                        {/* 未录入支出 ⇒ 毛利额同样不可信（合同额减 0 支出＝全额成毛利），
                            与毛利率一起置「—」，不半真半假 */}
                        {row.rankable ? formatCny(row.profit) : <span className="text-muted">—</span>}
                      </Td>
                      <Td align="right" className="num text-[12px] whitespace-nowrap">
                        {row.rankable && row.margin !== null ? (
                          <span className="flex items-center justify-end gap-2">
                            {formatPercent(row.margin)}
                            <Dot cls={dotCls[row.marginLight]} />
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px]">
                        {risks.length > 0 ? (
                          <span className="text-[12px] text-danger">{risks.join(" · ")}</span>
                        ) : row.pendingNodes > 0 ? (
                          <span className="text-[12px] text-warning">
                            节点待提交 {row.pendingNodes}
                          </span>
                        ) : (
                          <span className="text-[12px] text-muted">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="mt-3 text-[12px] leading-relaxed text-secondary">
              毛利 = 合同额 + 累计变更 − 支出；
              <b className="font-medium text-primary">只录了合同额、还没录支出的项目不显示 100%</b>
              （那是没数据不是高利润），故置「—」。
            </p>
          </div>
        )}
      </section>

      {/* 五、月度现金收付（左）+ 项目毛利率排行（右）；items-start 让两卡各自按内容取高，
          避免被拉成等高空白（V0.3 §7.4 节奏） */}
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
          {!cash.hasAnyCash && <p className="mt-2 text-sm text-secondary">近 6 个月暂无现金记录</p>}
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
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            5~7 月是<b className="font-medium text-secondary">真实现金流空白</b>（演示项目最早
            2026-08 开工），不是数据缺失，故如实显示 ¥0.00 而非「—」。
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
                    <span className={`truncate text-[13px] ${row.rankable ? "" : "text-secondary"}`}>
                      {row.name}
                    </span>
                    <span className="num shrink-0 text-[12px] text-muted">{row.code}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {row.rankable ? (
                      <div className="h-2 flex-1 bg-sunken">
                        <div className="h-2 bg-accent" style={{ width: row.barWidth ?? "0%" }} />
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
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            毛利率 15%~25% 归黄档，低于 15% 归红档；未录入支出者不入榜。
          </p>
        </Card>
      </section>

      {/* 六、商务漏斗（真内容）+ 人效排行灰占位（不画假图、不放假数字） */}
      <section className="grid items-start gap-4 sm:grid-cols-2">
        <Card>
          <SectionTitle>商务漏斗</SectionTitle>
          <p className="mt-2 text-xs text-secondary">
            阶段存量分布（非累计流量）· 已作废线索不计入
          </p>
          <ul className="mt-4 space-y-2">
            {funnel.stages.map((s) => (
              <li key={s.stage} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-[13px] text-secondary">
                  {STAGE_LABEL[s.stage] ?? s.stage}
                </span>
                <div className="h-2 flex-1 bg-sunken">
                  <div className="h-2 bg-accent" style={{ width: s.barWidth }} />
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
            </span>{" "}
            · 共 <span className="num">{funnel.total}</span> 条线索
          </p>
        </Card>
        <Card>
          <SectionTitle>人效排行</SectionTitle>
          <p className="mt-2 text-xs text-secondary">未接入：人员管控模块未上线</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            此处不留假数字。同口径还缺的有项目回款账龄与班组成本对比——三者都要人员与工时数据才能算，
            缺数据时诚实空着比画个假图表有用。
          </p>
        </Card>
      </section>
    </div>
  );
}
