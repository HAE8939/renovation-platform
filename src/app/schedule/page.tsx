import Link from "next/link";
import { Card } from "@/core/ui";
import { getScheduleOverview, type ScheduleOverviewRow } from "@/modules/schedule/server/overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "时间管控" };

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 色点（非 emoji）：red/yellow/green/gray 用 V0.3 状态色令牌。 */
function LightDot({ color }: { color: "red" | "yellow" | "green" | "gray" }) {
  const cls =
    color === "red"
      ? "bg-danger"
      : color === "yellow"
        ? "bg-warning"
        : color === "green"
          ? "bg-success"
          : "bg-muted";
  return (
    <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />
  );
}

/** 排程行：项目名 / 客户 / 计划完工 / 进度 / 超期或剩余天数 / 甘特链接。 */
function ScheduleRow({ row }: { row: ScheduleOverviewRow }) {
  const lightColor =
    row.light === "red" ? "red" : row.light === "yellow" ? "yellow" : "green";
  const dayLabel =
    row.light === "red"
      ? `超期 ${row.overdueDays ?? 0} 天`
      : row.light === "yellow"
        ? (row.daysLeft ?? 0) < 0
          ? `已超 ${-(row.daysLeft ?? 0)} 天未完工`
          : `剩余 ${row.daysLeft ?? 0} 天`
        : null;
  return (
    <Link
      href={`/schedule/${row.id}`}
      className="block rounded-card focus-visible:outline-none"
      title={`查看 ${row.code} 的甘特图`}
    >
      <Card padded className="transition-colors hover:border-accent">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <LightDot color={lightColor} />
            <span className="truncate text-[15px] font-medium text-primary">
              {row.name}
            </span>
          </div>
          <span className="shrink-0 text-[13px] num text-secondary whitespace-nowrap">
            {row.code}
          </span>
        </div>

        <div className="mt-2 space-y-1 text-[13px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">客户</span>
            <span className="truncate text-right text-primary" title={row.clientName ?? ""}>
              {row.clientName ?? "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">计划完工</span>
            <span className="text-right num text-primary whitespace-nowrap">
              {formatDate(row.endDate)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">当前进度</span>
            <span className="text-right num text-primary whitespace-nowrap">
              {row.progress}%
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">
              {row.light === "red" ? "超期" : row.light === "yellow" ? "紧迫度" : "状态"}
            </span>
            <span
              className={`text-right whitespace-nowrap ${
                row.light === "red"
                  ? "text-danger font-medium"
                  : row.light === "yellow"
                    ? "text-warning font-medium"
                    : "text-primary"
              }`}
            >
              {dayLabel ?? "正常"}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end">
          <span className="text-[13px] font-medium text-accent-ink whitespace-nowrap">
            甘特 →
          </span>
        </div>
      </Card>
    </Link>
  );
}

/** 分区：标题 + 色点 + 计数 + 行网格。空区不渲染。 */
function Zone({
  title,
  dot,
  rows,
}: {
  title: string;
  dot: "red" | "yellow" | "green" | "gray";
  rows: ScheduleOverviewRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <div className="flex items-center gap-2">
          <LightDot color={dot} />
          <h2 className="text-[15px] font-semibold text-primary whitespace-nowrap">
            {title}
          </h2>
        </div>
        <span className="text-[13px] text-secondary whitespace-nowrap num">
          共 {rows.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <ScheduleRow key={r.id} row={r} />
        ))}
      </div>
    </section>
  );
}

export default async function ScheduleBoardPage() {
  const overview = await getScheduleOverview();
  const totalScheduled =
    overview.red.length + overview.yellow.length + overview.green.length;
  const hasAny = totalScheduled + overview.unscheduled.length > 0;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">时间管控</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              全部在建项目的工期预警看板：已排程项目按工期灯分红/黄/绿三区，
              未排程项目单列灰区。点击卡片进入甘特图（M6-b 上线）。
            </p>
          </div>
        </div>

        <p className="mt-4 text-[13px] text-secondary">
          已排程 <span className="num text-primary">{totalScheduled}</span>
          <span className="mx-2" aria-hidden>·</span>
          红区{" "}
          <span className={`num ${overview.red.length > 0 ? "text-danger font-medium" : "text-primary"}`}>
            {overview.red.length}
          </span>
          <span className="mx-2" aria-hidden>·</span>
          黄区{" "}
          <span className={`num ${overview.yellow.length > 0 ? "text-warning font-medium" : "text-primary"}`}>
            {overview.yellow.length}
          </span>
          <span className="mx-2" aria-hidden>·</span>
          绿区 <span className="num text-primary">{overview.green.length}</span>
          <span className="mx-2" aria-hidden>·</span>
          未排程{" "}
          <span className={`num ${overview.unscheduled.length > 0 ? "text-secondary font-medium" : "text-primary"}`}>
            {overview.unscheduled.length}
          </span>
        </p>
      </header>

      {!hasAny ? (
        /* 诚实空态：无项目时不造假数据，气声描边引导 */
        <div className="rounded-card border border-line bg-surface px-8 py-12 text-center">
          <p className="text-[15px] font-medium text-primary">暂无项目</p>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            库里没有非归档项目。项目签约后会出现在此看板，按工期灯分三区预警。
          </p>
        </div>
      ) : (
        <>
          <Zone title="已逾期（超期）" dot="red" rows={overview.red} />
          <Zone title="预警（剩余不足）" dot="yellow" rows={overview.yellow} />
          <Zone title="正常" dot="green" rows={overview.green} />

          {overview.unscheduled.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <LightDot color="gray" />
                  <h2 className="text-[15px] font-semibold text-primary whitespace-nowrap">
                    未排程
                  </h2>
                </div>
                <span className="text-[13px] text-secondary whitespace-nowrap num">
                  共 {overview.unscheduled.length}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overview.unscheduled.map((r) => (
                  <Link
                    key={r.id}
                    href={`/schedule/${r.id}`}
                    className="block rounded-card focus-visible:outline-none"
                    title={`为 ${r.code} 生成排程`}
                  >
                    <Card padded className="transition-colors hover:border-accent">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <LightDot color="gray" />
                          <span className="truncate text-[15px] font-medium text-primary">
                            {r.name}
                          </span>
                        </div>
                        <span className="shrink-0 text-[13px] num text-secondary whitespace-nowrap">
                          {r.code}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[13px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-secondary whitespace-nowrap">面积</span>
                          <span className="text-right num text-primary whitespace-nowrap">
                            {r.area > 0 ? `${r.area} ㎡` : "—"}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-secondary whitespace-nowrap">计划开工</span>
                          <span className="text-right num text-primary whitespace-nowrap">
                            {formatDate(r.startDate)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-end">
                        <span className="text-[13px] font-medium text-accent-ink whitespace-nowrap">
                          去生成 →
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
