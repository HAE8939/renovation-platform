import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/core/ui";
import { getProjectHub } from "@/modules/projects/server/projectDetail";
import { ProjectTabs } from "./ProjectTabs";
import { ArchiveButton } from "../ArchiveButton";

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
        {/* M10-a 备料三：详情页也放归档/恢复入口。列表卡片视图整卡是链接（HTML 不允许
            在 a 里嵌表单），所以那侧只有表格视图的行内按钮——两处都能操作才叫可纠正。 */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-[13px] leading-relaxed text-muted">
            {hub.status === "archived"
              ? "该项目已归档：待收款、未整改问题与待办不再出现在全司视野里；已收、支出、合同额与毛利等已发生的账仍照常统计（发生过的事不因归档消失）。数据全部保留，可恢复。"
              : "归档＝未闭环事项从全司视野里摘出去（可恢复），不是删除数据；已发生的收支与毛利照常计入财务口径。"}
          </p>
          <ArchiveButton
            projectId={hub.id}
            projectName={hub.name}
            archived={hub.status === "archived"}
            unclosed={hub.unclosed}
          />
        </div>
      </header>

      <ProjectTabs hub={hub} initialTab={searchParams.tab} />
    </div>
  );
}
