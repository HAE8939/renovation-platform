import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/core/ui";
import { getProjectHub } from "@/modules/projects/server/projectDetail";
import { ProjectTabs } from "./ProjectTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目详情" };

/** 项目中心六合一详情（M4-b）。 */
export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const hub = await getProjectHub(params.id);
  if (!hub) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/projects"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors duration-[120ms] hover:text-accent-ink"
        >
          ← 返回项目列表
        </Link>
      </div>

      <header className="border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-tight">{hub.name}</h1>
          <Badge variant="outline">{hub.statusLabel}</Badge>
        </div>
        <p className="mt-2 text-[13px] text-secondary">
          {hub.code}
          {hub.client ? ` · ${hub.client.name}` : ""}
        </p>
      </header>

      <ProjectTabs hub={hub} initialTab={searchParams.tab} />
    </div>
  );
}
