import { notFound } from "next/navigation";
import { PROJECT_STATUS_LABEL, QUOTE_STATUS_LABEL } from "@/core/domain/types";
import type { ProjectStatus, QuoteStatus } from "@/core/domain/types";
import { getProjectDetail } from "@/modules/budget/server/projects";
import { QuoteBoard } from "./QuoteBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "报价明细" };

interface PageProps {
  params: { projectId: string };
}

/**
 * 项目报价明细页（M1a：只读为主，数量可临时改并即时重算）。
 * 服务端取数并序列化为可传给客户端组件的纯数据。
 */
export default async function BudgetDetailPage({ params }: PageProps) {
  const detail = await getProjectDetail(params.projectId);
  if (!detail) notFound();

  const data = {
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
    quoteStatusLabel:
      QUOTE_STATUS_LABEL[detail.quoteStatus as QuoteStatus] ?? detail.quoteStatus,
    items: detail.items,
  };

  return <QuoteBoard data={data} />;
}
