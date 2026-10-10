import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/core/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "排程甘特" };

/** 排程甘特占位页（M6-a 防死链；甘特主体在 M6-b 上线）。 */
export default async function ScheduleProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, name: true, code: true },
  });
  if (!project) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/schedule"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回时间管控
        </Link>
      </div>

      <header className="border-b border-line pb-6">
        <h1 className="text-[28px] font-semibold leading-tight">{project.name}</h1>
        <p className="mt-2 text-[13px] text-secondary">{project.code}</p>
      </header>

      {/* 诚实空态：不画线、不造数，明说甘特主体在 M6-b 上线 */}
      <div className="mt-8 rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">
          甘特图将在 M6-b 上线
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          工序排程的甘特视图（双轨进度条、依赖连线、今日竖线、一键生成与清空）
          在 M6-b 单元交付。当前可从预警看板查看项目工期灯与进度，生成流程空态预览
          与拖拽调期随后到位。
        </p>
        <Link
          href="/schedule"
          className="mt-4 inline-flex h-8 items-center rounded-inner bg-accent px-3 text-[13px] font-medium text-white whitespace-nowrap transition-colors hover:opacity-90"
        >
          返回预警看板
        </Link>
      </div>
    </div>
  );
}
