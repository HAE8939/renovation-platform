import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/core/db";
import { Badge } from "@/core/ui";
import {
  DESIGN_TASK_STATUS_LABEL,
  isOverdue,
  statusBadgeTone,
  type DesignTaskStatus,
} from "@/modules/design/status";
import { DESIGN_TASK_TYPE_LABEL, type DesignTaskType } from "@/modules/design/types";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const PRIORITY_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

/**
 * 设计任务详情 —— M5-a 最小占位页（防死链）。
 * 提交成果 / 版本历史 / 审核退回在 M5-b、M5-c 实现，本页不做任何写操作。
 */
export default async function DesignTaskDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const task = await prisma.designTask.findUnique({
    where: { id: params.id },
    include: { project: { select: { code: true, name: true } } },
  });
  if (!task) notFound();

  // assignee/reviewer 仅逻辑引用 User.id（无 @relation），按需查名。
  const [assignee, reviewer] = await Promise.all([
    task.assigneeId
      ? prisma.user.findUnique({ where: { id: task.assigneeId }, select: { name: true } })
      : null,
    task.reviewerId
      ? prisma.user.findUnique({ where: { id: task.reviewerId }, select: { name: true } })
      : null,
  ]);

  const overdue = isOverdue(task.deadline, task.status);
  const typeLabel = DESIGN_TASK_TYPE_LABEL[task.type as DesignTaskType] ?? task.type;
  const statusLabel =
    DESIGN_TASK_STATUS_LABEL[task.status as DesignTaskStatus] ?? task.status;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "类型", value: typeLabel },
    { label: "项目", value: `${task.project.code} · ${task.project.name}` },
    { label: "负责人", value: assignee?.name ?? "待分配" },
    { label: "审核人", value: reviewer?.name ?? "—" },
    {
      label: "截止",
      value: (
        <span
          className={`inline-flex items-center gap-2 num ${
            overdue ? "font-medium text-danger" : ""
          }`}
        >
          {overdue && (
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-danger" />
          )}
          {formatDate(task.deadline)}
          {overdue ? "（已逾期）" : ""}
        </span>
      ),
    },
    { label: "优先级", value: PRIORITY_LABEL[task.priority] ?? task.priority },
  ];

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/design"
          className="text-[13px] text-secondary whitespace-nowrap transition-colors hover:text-primary"
        >
          ← 返回设计看板
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] num text-secondary">{task.code}</p>
            <h1 className="mt-1 text-[28px] font-semibold">{task.title}</h1>
          </div>
          <Badge variant={statusBadgeTone(task.status)}>{statusLabel}</Badge>
        </div>
      </header>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-[15px] font-semibold">基本信息</h2>
        <div className="mt-4 space-y-2 text-[13px]">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4">
              <span className="shrink-0 text-secondary whitespace-nowrap">{r.label}</span>
              <span className="text-right text-primary break-words">{r.value}</span>
            </div>
          ))}
        </div>
        {task.requirement && (
          <>
            <h3 className="mt-6 text-[15px] font-semibold">需求说明</h3>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-primary">
              {task.requirement}
            </p>
          </>
        )}
      </section>

      {/* 诚实引导：提交与审核属后续单元，不放假按钮、不造数据 */}
      <section className="rounded-card border border-line bg-surface px-8 py-12 text-center">
        <p className="text-[15px] font-medium text-primary">提交与审核功能开发中（M5-b / M5-c）</p>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">
          执行者提交成果、版本化历史与设计师审核（通过 / 退回需填原因）将在后续版本上线。
        </p>
      </section>
    </div>
  );
}
