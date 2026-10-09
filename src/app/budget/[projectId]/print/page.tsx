import { notFound } from "next/navigation";
import { getProjectDetail } from "@/modules/budget/server/projects";
import {
  groupByCategory,
  computeTotals,
  lineTotal,
  formatCny,
  formatQty,
  formatPercent,
} from "@/modules/budget/lib/quote";
import { Th, Td } from "@/core/ui";
import { PrintButton } from "./PrintButton";
import "./print.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "报价打印" };

interface PageProps {
  params: { projectId: string };
}

/** 封面字段：标签（次字、不折行）+ 值（主字、中字重）。 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-nowrap text-[13px] text-secondary">{label}</span>
      <span className="text-[15px] font-medium text-primary">{value}</span>
    </div>
  );
}

/**
 * A4 打印视图（M1b-B1）：独立 Server Component，不进侧栏导航。
 * 取数方式与详情页一致——直接复用 server/projects 的 getProjectDetail；
 * 分组与金额一律走 lib/quote.ts（只调用，不另写算法）。
 */
export default async function BudgetPrintPage({ params }: PageProps) {
  const detail = await getProjectDetail(params.projectId);
  if (!detail) notFound();

  const groups = groupByCategory(detail.items);
  const totals = computeTotals(detail.items, detail.taxRate, detail.area);
  const quoteDate = new Date().toLocaleDateString("zh-CN");

  const designerPm = [detail.designer, detail.pm].filter(Boolean).join(" / ") || "—";
  const clientLine = detail.clientPhone
    ? `${detail.clientName} / ${detail.clientPhone}`
    : detail.clientName;

  return (
    <div className="print-sheet">
      <PrintButton />

      {/* 封面块 */}
      <section className="mb-6">
        <h1 className="mb-6 text-[28px] font-semibold leading-snug text-primary">
          装修工程报价单
        </h1>
        <div className="grid grid-cols-2 gap-x-12 gap-y-4">
          <Field label="项目名称" value={detail.name} />
          <Field label="项目编号" value={detail.code} />
          <Field label="项目地址" value={detail.address ?? "—"} />
          <Field label="建筑面积" value={`${formatQty(detail.area)} ㎡`} />
          <Field label="客户" value={clientLine} />
          <Field label="设计 · PM" value={designerPm} />
          <Field label="报价日期" value={quoteDate} />
          <Field label="税率" value={formatPercent(detail.taxRate)} />
        </div>
      </section>

      {/* 汇总表 */}
      <section className="mb-6">
        <h2 className="mb-4 text-[20px] font-semibold text-primary">费用汇总</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>科目</Th>
              <Th align="right">小计</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.categoryName}>
                <Td className="whitespace-nowrap">{g.categoryName}</Td>
                <Td className="num" align="right">
                  {formatCny(g.subtotal)}
                </Td>
              </tr>
            ))}
            <tr>
              <Td className="font-semibold whitespace-nowrap">直接费</Td>
              <Td className="num font-semibold" align="right">
                {formatCny(totals.directSubtotal)}
              </Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap">
                税金（{formatPercent(totals.taxRate)}）
              </Td>
              <Td className="num" align="right">
                {formatCny(totals.tax)}
              </Td>
            </tr>
            <tr>
              <Td className="font-semibold whitespace-nowrap">总价</Td>
              <Td className="num font-semibold" align="right">
                {formatCny(totals.grand)}
              </Td>
            </tr>
            <tr>
              <Td className="whitespace-nowrap">单方造价</Td>
              <Td className="num" align="right">
                {totals.unitCost === null ? "—" : formatCny(totals.unitCost)}
              </Td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 分科目明细表 */}
      <section className="mb-6">
        <h2 className="mb-4 text-[20px] font-semibold text-primary">分科目明细</h2>
        {groups.map((g) => (
          <div key={g.categoryName} className="mb-4">
            <h3 className="mb-2 flex items-baseline justify-between text-[17px] font-semibold text-primary">
              <span>{g.categoryName}</span>
              <span className="num text-[15px] text-secondary">
                {formatCny(g.subtotal)}
              </span>
            </h3>
            <table className="w-full border-collapse detail-table">
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "22.5%" }} />
                <col style={{ width: "22.5%" }} />
              </colgroup>
              <thead>
                <tr>
                  <Th className="whitespace-nowrap">编号</Th>
                  <Th className="whitespace-nowrap">名称</Th>
                  <Th className="whitespace-nowrap">单位</Th>
                  <Th align="right">单价</Th>
                  <Th align="right">数量</Th>
                  <Th align="right">小计</Th>
                  <Th>材料说明</Th>
                  <Th>施工要求</Th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={it.id}>
                    <Td className="num whitespace-nowrap">{it.code}</Td>
                    <Td>{it.name}</Td>
                    <Td className="whitespace-nowrap">{it.unit}</Td>
                    <Td className="num" align="right">
                      {formatCny(it.unitPrice)}
                    </Td>
                    <Td className="num" align="right">
                      {formatQty(it.quantity)}
                    </Td>
                    <Td className="num" align="right">
                      {formatCny(lineTotal(it.unitPrice, it.quantity))}
                    </Td>
                    <Td className="text-[13px] text-secondary whitespace-pre-line">
                      {it.materials || "—"}
                    </Td>
                    <Td className="text-[13px] text-secondary whitespace-pre-line">
                      {it.sop || "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      {/* 签字栏 */}
      <section>
        <h2 className="mb-4 text-[20px] font-semibold text-primary">签字确认</h2>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3">
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <span className="text-[15px] font-medium text-primary">甲方（客户）</span>
            <span className="text-[13px] text-secondary">签字：____________</span>
            <span className="text-[13px] text-secondary">日期：____ 年 __ 月 __ 日</span>
          </div>
          <div className="flex flex-col gap-4 border-t border-line pt-4">
            <span className="text-[15px] font-medium text-primary">乙方（施工方）</span>
            <span className="text-[13px] text-secondary">签字：____________</span>
            <span className="text-[13px] text-secondary">日期：____ 年 __ 月 __ 日</span>
          </div>
        </div>
      </section>
    </div>
  );
}
