import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/core/db";
import { Badge, Card } from "@/core/ui";
import { PROJECT_STATUS_LABEL } from "@/core/domain/types";
import type { ProjectStatus } from "@/core/domain/types";

export const dynamic = "force-dynamic";

/** M4-a 占位详情页：仅显项目名 + 开发中提示，避免 /projects/[id] 死链。
 *  六合一详情由 M4-b 实现。 */
export default async function ProjectDetailPlaceholder({
  params,
}: {
  params: { id: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { name: true, code: true, status: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold">{project.name}</h1>
          <Badge variant="neutral">{PROJECT_STATUS_LABEL[project.status as ProjectStatus] ?? project.status}</Badge>
        </div>
        <p className="mt-2 text-[13px] text-secondary">{project.code}</p>
      </header>

      <Card>
        <p className="text-[15px] text-secondary">详情页开发中（M4-b）。</p>
        <Link
          href="/projects"
          className="mt-3 inline-block text-[13px] text-accent-ink whitespace-nowrap hover:underline underline-offset-4"
        >
          ← 返回项目列表
        </Link>
      </Card>
    </div>
  );
}
