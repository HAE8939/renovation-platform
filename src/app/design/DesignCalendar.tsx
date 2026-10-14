import Link from "next/link";
import { statusBadgeTone } from "@/modules/design/status";
import {
  dayKey,
  groupByDay,
  monthDays,
  parseMonthParam,
  shiftMonth,
  type ParsedMonth,
} from "@/modules/design/calendar";
import type { DesignCalendarData, DesignCalendarTask } from "@/modules/design/server/tasks";

/**
 * 设计日历（M5-d，服务端组件）。
 * 周一起始（中文惯例：周一到周日为一周）。
 * 6×7 网格靠细线 border-line 分隔，无阴影、无圆角大卡（V0.3 §4/§5）。
 * 今日高亮 = 单点 accent 描边圆圈（非填色，守 V0.3 单点纪律）。
 * 375 适配：外层 overflow-x-auto 容器包 min-w 网格，容器不超视口（同看板做法）。
 */

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"]; // 周一起始
const MAX_CHIPS_PER_CELL = 3;

/** 状态色点（非 emoji）：逾期红；否则按 statusBadgeTone 语义色。 */
function statusDotClass(status: string, overdue: boolean): string {
  if (overdue) return "bg-danger";
  switch (statusBadgeTone(status)) {
    case "success":
      return "bg-success";
    case "danger":
      return "bg-danger";
    case "warning":
      return "bg-warning";
    default:
      return "bg-secondary";
  }
}

/** 单个色片：圆点 + 截断 title，整片可点进任务详情。 */
function TaskChip({ task }: { task: DesignCalendarTask }) {
  return (
    <Link
      href={`/design/${task.id}`}
      className="block rounded-inner px-2 py-1 transition-colors hover:bg-accent-tint"
      title={`${task.code} · ${task.title}`}
    >
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDotClass(
            task.status,
            task.overdue
          )}`}
        />
        <span className="truncate text-[12px] leading-tight text-primary">
          {task.title}
        </span>
      </span>
    </Link>
  );
}

export function DesignCalendar({
  data,
  parsed,
  now = new Date(),
}: {
  data: DesignCalendarData;
  parsed: ParsedMonth;
  now?: Date;
}) {
  const grid = monthDays(parsed.year, parsed.month);
  const byDay = groupByDay(data.tasks);
  const todayKey = dayKey(now);

  const monthTitle = `${parsed.year} 年 ${parsed.month + 1} 月`;
  const prevHref = `/design?view=calendar&month=${shiftMonth(parsed, -1)}`;
  const nextHref = `/design?view=calendar&month=${shiftMonth(parsed, +1)}`;
  const thisMonthHref = `/design?view=calendar&month=${parseMonthParam(undefined, now).label}`;

  const navBtnClass =
    "inline-flex h-8 items-center rounded-inner border border-line bg-surface px-3 text-[13px] text-secondary whitespace-nowrap transition-colors hover:text-primary hover:border-accent";

  return (
    <div className="mt-4">
      {/* 月标题 + 翻页深链 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold whitespace-nowrap">{monthTitle}</h3>
        <div className="flex items-center gap-2">
          <Link href={prevHref} className={navBtnClass}>
            上一月
          </Link>
          <Link href={thisMonthHref} className={navBtnClass}>
            回到本月
          </Link>
          <Link href={nextHref} className={navBtnClass}>
            下一月
          </Link>
        </div>
      </div>

      {/* 网格：375 横滚容器包 min-w 网格，容器不超视口（同看板做法） */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2">
        <div className="min-w-[640px]">
          {/* 表头：周一~周日 */}
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                className="px-2 py-2 text-center text-[12px] font-medium text-secondary whitespace-nowrap"
              >
                {w}
              </div>
            ))}
          </div>
          {/* 6 行 × 7 列 */}
          <div>
            {grid.map((row, ri) => (
              <div key={ri} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {row.map((cell) => {
                  const key = dayKey(cell.date);
                  const tasks = byDay.get(key) ?? [];
                  const isToday = key === todayKey;
                  const shown = tasks.slice(0, MAX_CHIPS_PER_CELL);
                  const more = tasks.length - shown.length;
                  return (
                    <div
                      key={key}
                      className={`min-h-[96px] border-r border-line px-2 py-2 last:border-r-0 ${
                        cell.inMonth ? "bg-surface" : "bg-canvas"
                      }`}
                    >
                      {/* 日号：今日单点 accent 描边圆圈（非填色） */}
                      <div className="flex justify-end">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center text-[12px] num ${
                            isToday
                              ? "rounded-full border-2 border-accent font-medium text-accent-ink"
                              : cell.inMonth
                              ? "text-secondary"
                              : "text-muted"
                          }`}
                        >
                          {cell.day}
                        </span>
                      </div>
                      {/* 色片 */}
                      {shown.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {shown.map((t) => (
                            <TaskChip key={t.id} task={t} />
                          ))}
                          {more > 0 && (
                            <p className="px-2 text-[12px] text-secondary whitespace-nowrap">
                              +{more} 更多
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 诚实提示：未排期任务不塞进网格造假 */}
      {data.undatedCount > 0 && (
        <p className="mt-4 text-[13px] text-secondary">
          另有 <span className="num text-primary">{data.undatedCount}</span> 个任务未设截止日期（未排期）
        </p>
      )}

      {/* 当月无任务空态引导 */}
      {data.tasks.length === 0 && (
        <div className="mt-4 rounded-card border border-line bg-surface px-8 py-8 text-center">
          <p className="text-[15px] font-medium text-primary">
            {monthTitle}暂无到期任务
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            为设计任务设置截止日期后，将在此按日排布；可在看板视图查看全部任务。
          </p>
          <Link
            href="/design?view=board"
            className="mt-4 inline-flex h-8 items-center rounded-inner bg-accent px-3 text-[13px] font-medium text-accent-fg whitespace-nowrap transition-colors hover:opacity-90"
          >
            切换到看板
          </Link>
        </div>
      )}
    </div>
  );
}
