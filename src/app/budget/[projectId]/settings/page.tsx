import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectDetail } from "@/modules/budget/server/projects";
import { ProjectSettingsForm } from "../ProjectSettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目设置" };

interface PageProps {
  params: { projectId: string };
}

/** 项目基础信息编辑页（M1b-B3）。详情页内的「项目设置」链接带真实 projectId 进入。 */
export default async function ProjectSettingsPage({ params }: PageProps) {
  const detail = await getProjectDetail(params.projectId);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <header className="border-b border-line pb-4">
        <Link
          href={`/budget/${detail.id}`}
          className="text-xs text-secondary underline-offset-4 hover:text-accent-ink hover:underline"
        >
          ← 返回报价明细
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold leading-tight">{detail.name}</h1>
          <span className="num text-xs text-secondary">{detail.code}</span>
        </div>
      </header>

      <ProjectSettingsForm
        values={{
          id: detail.id,
          code: detail.code,
          name: detail.name,
          address: detail.address,
          area: detail.area,
          status: detail.status,
          designer: detail.designer,
          pm: detail.pm,
          clientName: detail.clientName,
          clientPhone: detail.clientPhone,
          startDate: detail.startDate ? detail.startDate.toISOString() : null,
          endDate: detail.endDate ? detail.endDate.toISOString() : null,
        }}
      />
    </div>
  );
}
