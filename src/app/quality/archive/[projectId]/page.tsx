import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectArchive } from "@/modules/quality/server/archive";
import {
  buildTimeline,
  type TimelineEvent,
} from "@/modules/quality/timeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "质量档案" };

/** 仅日期（区间用）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 日期时间（时间轴行用）：YYYY/MM/DD HH:mm。 */
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dt = new Date(d);
  return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(
    dt.getDate()
  )} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** tone → 色点背景类（对应 --success 等 CSS 变量，非 emoji）。 */
const TONE_DOT_CLASS: Record<TimelineEvent["tone"], string> = {
  neutral: "bg-secondary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

interface PageProps {
  params: { projectId: string };
}

/**
 * 项目档案时间轴页（M7-d，TASK_M7 §4-M7-d）。
 * notFound 兜底；页头（返回索引 + 项目名 + 编号 + 区间）+ 摘要行 + 打印链接 +
 * 垂直时间轴（日期时间 + 语义色点 + label + sub，label 有 href 时整行可点）。
 * V0.3：无阴影、色点非 emoji、单点 accent 仅提交事件色点。
 */
export default async function ProjectArchivePage({ params }: PageProps) {
  const archive = await getProjectArchive(params.projectId);
  if (!archive) notFound();

  const events = buildTimeline(archive.nodes, archive.issues);
  const { project, summary } = archive;
  const endDate = project.actualEndDate ?? new Date();
  const range = `${formatDate(project.startDate)} → ${formatDate(endDate)}`;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/quality/archive"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回质量档案
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">{project.name}</h1>
            <p className="mt-2 text-[13px] text-secondary">
              <span className="num">{project.code}</span>
              <span className="mx-2" aria-hidden>
                ·
              </span>
              <span className="whitespace-nowrap">{range}</span>
            </p>
          </div>
          <Link
            href={`/quality/archive/${project.id}/print`}
            className="inline-flex h-8 items-center rounded-inner border border-line bg-surface px-3 text-[13px] font-medium text-primary whitespace-nowrap transition-colors hover:border-accent hover:text-accent-ink"
          >
            打印档案
          </Link>
        </div>

        <p className="mt-4 text-[13px] text-secondary">
          节点 <span className="num text-primary">{summary.totalNodes}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          通过 <span className="num text-primary">{summary.passedNodes}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          问题 <span className="num text-primary">{summary.totalIssues}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          未关闭{" "}
          <span
            className={`num font-medium ${
              summary.openIssues > 0 ? "text-danger" : "text-primary"
            }`}
          >
            {summary.openIssues}
          </span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          影像：未接入
        </p>
      </header>

      <section>
        <h2 className="text-[15px] font-semibold">质量事件时间轴</h2>

        {events.length === 0 ? (
          /* 诚实空态：项目尚无任何质量记录（未完工则无节点） */
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">暂无质量记录</p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              项目尚未生成验收节点或质量问题；工序完工后自动生成验收节点，
              退回与整改事件将在此时间轴呈现。
            </p>
          </div>
        ) : (
          <ol className="mt-4">
            {events.map((e) => {
              const inner = (
                <div className="flex gap-3">
                  <div className="flex flex-col items-center" aria-hidden>
                    <span
                      className={`mt-2 h-2 w-2 shrink-0 rounded-full ${TONE_DOT_CLASS[e.tone]}`}
                    />
                    <span className="mt-1 w-px flex-1 bg-line" />
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="num text-[13px] text-secondary whitespace-nowrap">
                        {formatDateTime(e.date)}
                      </span>
                      <span className="text-[15px] font-medium text-primary">
                        {e.label}
                      </span>
                    </div>
                    {e.sub && (
                      <p className="mt-1 text-[13px] leading-relaxed text-secondary">
                        {e.sub}
                      </p>
                    )}
                  </div>
                </div>
              );
              return (
                <li key={e.key}>
                  {e.href ? (
                    <Link
                      href={e.href}
                      className="block transition-colors hover:bg-canvas"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
