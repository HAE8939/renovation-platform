import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/core/ui";
import { getProjectSchedule } from "@/modules/schedule/server/tasks";
import { GanttChart } from "./GanttChart";
import { ClearScheduleButton } from "./ClearScheduleButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "排程甘特" };

/** UTC 日期格式（与图体刻度同源，避免时区偏移）。 */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * 排程甘特页（M6-b）：顶部项目信息 + 右侧清空排程（有任务时）+
 * 空态（可生成预览 / 不可生成诚实说明）或图体（双轨 SVG + 依赖连线 + 今日线）。
 */
export default async function ScheduleProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const data = await getProjectSchedule(params.projectId);
  if (!data) notFound();

  const hasTasks = data.tasks.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/schedule"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回时间管控
        </Link>
      </div>

      <header className="border-b border-line pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] num text-secondary">{data.project.code}</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight">
              {data.project.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">
                {data.tier ? data.tierLabel : "未定档"}
              </Badge>
              <span className="text-[13px] text-secondary whitespace-nowrap">
                面积
                <span className="num text-primary">
                  {" "}
                  {data.project.area > 0 ? `${data.project.area} ㎡` : "—"}
                </span>
              </span>
              <span className="text-[13px] text-secondary whitespace-nowrap">
                计划开工
                <span className="num text-primary"> {fmtDate(data.project.startDate)} </span>
              </span>
              <span className="text-[13px] text-secondary whitespace-nowrap">
                计划完工
                <span className="num text-primary"> {fmtDate(data.project.endDate)} </span>
              </span>
            </div>
            <Link
              href={`/projects/${data.project.id}`}
              className="mt-3 inline-flex text-[13px] text-accent-ink whitespace-nowrap underline-offset-4 hover:underline"
            >
              项目详情 →
            </Link>
          </div>

          {hasTasks && <ClearScheduleButton projectId={data.project.id} />}
        </div>
      </header>

      <GanttChart data={data} />
    </div>
  );
}
