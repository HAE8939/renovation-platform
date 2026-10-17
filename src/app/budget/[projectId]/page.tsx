import { notFound } from "next/navigation";
import { PROJECT_STATUS_LABEL, QUOTE_STATUS_LABEL } from "@/core/domain/types";
import type { ProjectStatus, QuoteStatus } from "@/core/domain/types";
import { listCatalogForPicker } from "@/modules/budget/server/catalog";
import { getProjectDetail } from "@/modules/budget/server/projects";
import { QuoteBoard, type QuoteBoardData } from "./QuoteBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "报价明细" };

interface PageProps {
  params: { projectId: string };
}

/**
 * 项目报价明细页（M1b：完整编辑器）。
 * 服务端并行取项目详情与科目库选入清单，序列化为可传给客户端组件的纯数据。
 */
export default async function BudgetDetailPage({ params }: PageProps) {
  const [detail, picker] = await Promise.all([
    getProjectDetail(params.projectId),
    listCatalogForPicker(),
  ]);
  if (!detail) notFound();

  const data: QuoteBoardData = {
    project: {
      id: detail.id,
      code: detail.code,
      name: detail.name,
      address: detail.address,
      area: detail.area,
      statusLabel: PROJECT_STATUS_LABEL[detail.status as ProjectStatus] ?? detail.status,
      designer: detail.designer,
      pm: detail.pm,
      clientName: detail.clientName,
      clientPhone: detail.clientPhone,
      startDate: detail.startDate
        ? detail.startDate.toLocaleDateString("zh-CN")
        : null,
      endDate: detail.endDate ? detail.endDate.toLocaleDateString("zh-CN") : null,
    },
    taxRate: detail.taxRate,
    quoteStatus: detail.quoteStatus,
    quoteStatusLabel:
      QUOTE_STATUS_LABEL[detail.quoteStatus as QuoteStatus] ?? detail.quoteStatus,
    quoteLockedAt: detail.quoteLockedAt
      ? detail.quoteLockedAt.toLocaleDateString("zh-CN")
      : null,
    items: detail.items,
    picker,
  };

  return <QuoteBoard data={data} />;
}
