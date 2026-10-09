import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/core/ui";
import { getPlaceholderUser } from "@/modules/design/currentUser";
import {
  canReview,
  canSubmit,
  DESIGN_TASK_STATUS_LABEL,
  statusBadgeTone,
  SUBMISSION_RESULT_LABEL,
  submissionResultTone,
  type DesignTaskStatus,
} from "@/modules/design/status";
import { DESIGN_TASK_TYPE_LABEL, type DesignTaskType } from "@/modules/design/types";
import {
  getTaskDetail,
  type TaskSubmissionItem,
} from "@/modules/design/server/submissions";
import { SubmitTaskForm } from "./SubmitTaskForm";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 提交/审核时间精确到分钟（同一天的多轮提交靠时间区分）。 */
function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PRIORITY_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

/** 版本历史单条：版本号、提交人/时间、说明、交付物链接、结果徽章；退回显示原因。 */
function SubmissionEntry({
  s,
  reviewForm,
}: {
  s: TaskSubmissionItem;
  reviewForm?: React.ReactNode;
}) {
  return (
    <li className="border-l border-line pl-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium num text-primary whitespace-nowrap">
          v{s.version}
        </span>
        <Badge variant={submissionResultTone(s.result)}>
          {SUBMISSION_RESULT_LABEL[s.result] ?? s.result}
        </Badge>
      </div>
      <p className="mt-1 text-[13px] text-secondary">
        {s.submittedByName ?? "未知用户"} 提交于 {formatDateTime(s.createdAt)}
        {s.reviewedByName && (
          <>
            {" · "}
            {s.reviewedByName} 审核{formatDateTime(s.reviewedAt) !== "—" ? `于 ${formatDateTime(s.reviewedAt)}` : ""}
          </>
        )}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed break-words text-primary">{s.note}</p>
      <p className="mt-1 text-[13px] text-secondary">
        交付物：
        {s.assetRef ? (
          <a
            href={s.assetRef}
            target="_blank"
            rel="noreferrer"
            className="font-medium break-all text-accent-ink hover:underline"
          >
            {s.assetRef}
          </a>
        ) : (
          "—"
        )}
      </p>
      {s.result === "rejected" && s.rejectReason && (
        <p className="mt-2 text-[13px] leading-relaxed text-danger">
          退回原因：{s.rejectReason}
        </p>
      )}
      {reviewForm && <div className="mt-4">{reviewForm}</div>}
    </li>
  );
}

/**
 * 设计任务详情（M5-b + M5-c）：基本信息 + 需求说明 + 提交成果表单 + 版本历史（倒序）。
 * 审核通过/退回操作区（M5-c）渲染在最新一条 pending 提交旁；门控走 status.ts 的
 * canSubmit / canReview 纯函数，不在页面硬编码状态。
 */
export default async function DesignTaskDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [task, placeholder] = await Promise.all([
    getTaskDetail(params.id),
    getPlaceholderUser(),
  ]);
  if (!task) notFound();

  const overdue = task.overdue;
  const typeLabel = DESIGN_TASK_TYPE_LABEL[task.type as DesignTaskType] ?? task.type;
  const statusLabel =
    DESIGN_TASK_STATUS_LABEL[task.status as DesignTaskStatus] ?? task.status;

  // 审核操作区（M5-c）：仅 canReview 态（submitted）在最新一条 pending 提交旁渲染。
  // 历史已倒序，find 返回的即最新待审版本；无 pending 则不渲染（防御性）。
  const reviewTarget = canReview(task.status)
    ? task.submissions.find((s) => s.result === "pending") ?? null
    : null;

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "类型", value: typeLabel },
    {
      label: "项目",
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          <span className="break-words">
            {task.projectCode} · {task.projectName}
          </span>
          {/* 跳预算：放页面内部带真 id，不进 manifest.nav（拿不到 id 会成死链，TASK_M5 §5） */}
          <Link
            href={`/budget/${task.projectId}`}
            className="text-[13px] text-accent-ink whitespace-nowrap underline-offset-4 hover:underline"
          >
            打开该项目报价单 →
          </Link>
        </span>
      ),
    },
    { label: "负责人", value: task.assigneeName ?? "待分配" },
    { label: "审核人", value: task.reviewerName ?? "—" },
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

      {/* 提交成果：仅可提交状态显示（canSubmit 谓词门控，不在页面硬编码状态） */}
      {canSubmit(task.status) ? (
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="text-[15px] font-semibold">提交成果</h2>
          <SubmitTaskForm taskId={task.id} placeholderUserName={placeholder?.name ?? null} />
        </section>
      ) : (
        <p className="text-[13px] text-secondary">
          当前任务状态为「{statusLabel}
          」，暂不可提交{task.status === "submitted" ? "，请等待审核" : ""}。
        </p>
      )}

      {/* 版本历史：倒序，最新在上 */}
      <section className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold">版本历史</h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            共 <span className="num text-primary">{task.submissions.length}</span> 次提交
          </span>
        </div>
        {task.submissions.length === 0 ? (
          <p className="mt-4 text-[13px] leading-relaxed text-secondary">尚无提交记录。</p>
        ) : (
          <ol className="mt-6 space-y-6">
            {task.submissions.map((s) => (
              <SubmissionEntry
                key={s.id}
                s={s}
                reviewForm={
                  reviewTarget && reviewTarget.id === s.id ? (
                    <ReviewForm
                      taskId={task.id}
                      submissionId={s.id}
                      placeholderUserName={placeholder?.name ?? null}
                    />
                  ) : undefined
                }
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
