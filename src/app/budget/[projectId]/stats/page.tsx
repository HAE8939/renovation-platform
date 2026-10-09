import { notFound } from "next/navigation";
import { Card, SectionTitle, Badge, Table, Th, Td } from "@/core/ui";
import { listCatalogForPicker } from "@/modules/budget/server/catalog";
import { getProjectDetail } from "@/modules/budget/server/projects";
import {
  groupByCategory,
  computeTotals,
  formatCny,
  formatPercent,
  formatQty,
} from "@/modules/budget/lib/quote";

export const dynamic = "force-dynamic";
export const metadata = { title: "科目分布" };

interface PageProps {
  params: { projectId: string };
}

/**
 * 科目分布看板（M1b-B2，只读）。
 * 回答三件事：钱花在哪（科目占比列表 + 占比条）、报完没报全（填报完整度）、
 * 哪科占比高（汇总卡）。全部计算走 lib/quote.ts 的 groupByCategory / computeTotals。
 */
export default async function BudgetStatsPage({ params }: PageProps) {
  const [detail, catalog] = await Promise.all([
    getProjectDetail(params.projectId),
    listCatalogForPicker(),
  ]);
  if (!detail) notFound();

  const items = detail.items;
  const groups = groupByCategory(items);
  const totals = computeTotals(items, detail.taxRate, detail.area);

  // 按金额降序
  const ranked = [...groups].sort((a, b) => b.subtotal - a.subtotal);
  const totalSubtotal = totals.directSubtotal;

  // 填报完整度：已填明细行数、涉及科目数 / 全量科目数
  const totalCategories = catalog.length;
  const missingMaterials = items.filter((i) => !i.materials || !i.materials.trim()).length;
  const missingSop = items.filter((i) => !i.sop || !i.sop.trim()).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[20px] font-semibold text-primary">{detail.name}</h1>
          <span className="text-[13px] text-secondary num">{detail.code}</span>
        </div>
        <p className="mt-1 text-[13px] text-secondary">科目分布看板</p>
      </header>

      {/* 汇总卡：直接费 / 税金 / 总价 / 单方造价 */}
      <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="直接费" value={formatCny(totals.directSubtotal)} />
        <SummaryCard label="税金" value={formatCny(totals.tax)} />
        <SummaryCard label="总价" value={formatCny(totals.grand)} />
        <SummaryCard label="单方造价" value={formatCny(totals.unitCost)} />
      </section>

      {/* 科目占比列表 */}
      <Card className="mb-8">
        <SectionTitle className="mb-4">科目占比</SectionTitle>
        {ranked.length === 0 ? (
          <p className="text-[13px] text-secondary">暂无报价明细，无法统计科目分布。</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>科目</Th>
                <Th align="right">小计</Th>
                <Th align="right">占比</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((g) => {
                const pct = totalSubtotal > 0 ? g.subtotal / totalSubtotal : 0;
                const isTop = g === ranked[0];
                return (
                  <tr key={g.categoryName}>
                    <Td>
                      <div className="text-[15px] text-primary">{g.categoryName}</div>
                      <div
                        className="mt-2 h-2 w-full overflow-hidden rounded-inner bg-surface-sunken"
                        role="img"
                        aria-label={`${g.categoryName} 占比 ${formatPercent(pct)}`}
                      >
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${formatPercent(pct).replace("%", "")}%` }}
                        />
                      </div>
                    </Td>
                    <Td align="right" className="num text-[15px] text-primary">
                      {formatCny(g.subtotal)}
                    </Td>
                    <Td
                      align="right"
                      className={`num text-[15px] ${isTop ? "font-semibold text-primary" : "text-secondary"}`}
                    >
                      {formatPercent(pct)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* 填报完整度 */}
      <Card>
        <SectionTitle className="mb-4">填报完整度</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">已填明细 {totals.itemCount} 行</Badge>
          <Badge variant="neutral">
            涉及科目 {totals.categoryCount} / {totalCategories}
          </Badge>
          <Badge variant={missingMaterials > 0 ? "warning" : "success"}>
            缺材料说明 {missingMaterials} 行
          </Badge>
          <Badge variant={missingSop > 0 ? "warning" : "success"}>
            缺施工要求 {missingSop} 行
          </Badge>
        </div>
        <p className="mt-4 text-[13px] leading-6 text-secondary">
          材料说明与施工要求是装修报价最容易漏的两项，按行数提示比笼统进度条更实用。
        </p>
      </Card>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-secondary">
        {label}
      </div>
      <div className="mt-2 text-[20px] font-semibold text-primary num">{value}</div>
    </div>
  );
}
