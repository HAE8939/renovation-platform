import Link from "next/link";
import { Badge, Card } from "@/core/ui";
import { getPlaceholderUser } from "@/modules/design/currentUser";
import {
  DESIGN_TASK_STATUS_ORDER,
  DESIGN_TASK_STATUS_LABEL,
  isOverdue,
  type DesignTaskStatus,
} from "@/modules/design/status";
import { DESIGN_TASK_TYPE_LABEL, type DesignTaskType } from "@/modules/design/types";
import {
  getDesignTaskCount,
  listDesignTasks,
  listDesignTasksForCalendar,
  type DesignTaskListItem,
} from "@/modules/design/server/tasks";
import { parseMonthParam } from "@/modules/design/calendar";
import { DesignCalendar } from "./DesignCalendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "设计管理" };

type Scope = "all" | "mine";
type ViewMode = "board" | "calendar";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 单张任务卡片（整卡可点，进 /design/[id]）。 */
function TaskCard({ task }: { task: DesignTaskListItem }) {
  const typeLabel = DESIGN_TASK_TYPE_LABEL[task.type as DesignTaskType] ?? task.type;
  return (
    <Link
      href={`/design/${task.id}`}
      className="block rounded-card focus-visible:outline-none"
      title={`查看任务 ${task.code}`}
    >
      <Card padded className="transition-colors hover:border-accent">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-medium text-primary">{task.title}</span>
          <span className="shrink-0 text-[13px] num text-secondary whitespace-nowrap">
            {task.code}
          </span>
        </div>

        <div className="mt-2 space-y-1 text-[13px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">类型</span>
            <span className="text-right text-primary whitespace-nowrap">{typeLabel}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">项目</span>
            <span className="truncate text-right text-primary" title={task.projectName}>
              {task.projectCode}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">负责人</span>
            <span className="text-right text-primary whitespace-nowrap">
              {task.assigneeName ?? "待分配"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">截止</span>
            {/* 逾期：状态色点 + 危险色日期（色点非 emoji，V0.3 §5） */}
            <span
              className={`inline-flex items-center gap-2 text-right num whitespace-nowrap ${
                task.overdue ? "font-medium text-danger" : "text-primary"
              }`}
            >
              {task.overdue && (
                <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-danger" />
              )}
              {formatDate(task.deadline)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/** 双视角切换：?scope= 深链（仿 crm ?view=），服务端渲染、无客户端状态。 */
function ScopeToggle({ scope }: { scope: Scope }) {
  const itemClass = (active: boolean) =>
    `inline-flex h-8 items-center rounded-inner px-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
      active ? "bg-accent-tint text-accent-ink" : "text-secondary hover:text-primary"
    }`;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">视角</span>
      <div className="flex items-center rounded-inner border border-line bg-surface p-1">
        <Link href="/design" className={itemClass(scope === "all")}>
          设计任务池
        </Link>
        <Link href="/design?scope=mine" className={itemClass(scope === "mine")}>
          指派给我
        </Link>
      </div>
    </div>
  );
}

/**
 * 视图切换：?view=board|calendar 深链（默认 board，保留现有 ?scope=）。
 * board↔calendar 互相带上对方的 scope 参数（日历不用 scope，但切回看板要保留）。
 * 服务端渲染、无客户端状态（仿 ScopeToggle 思路，不引客户端状态库）。
 */
function ViewModeToggle({ view, scope }: { view: ViewMode; scope: Scope }) {
  const itemClass = (active: boolean) =>
    `inline-flex h-8 items-center rounded-inner px-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
      active ? "bg-accent-tint text-accent-ink" : "text-secondary hover:text-primary"
    }`;
  const scopeQ = scope === "mine" ? "&scope=mine" : "";
  const boardHref = `/design?view=board${scopeQ}`;
  const calHref = `/design?view=calendar${scopeQ}`;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">视图</span>
      <div className="flex items-center rounded-inner border border-line bg-surface p-1">
        <Link href={boardHref} className={itemClass(view === "board")}>
          看板
        </Link>
        <Link href={calHref} className={itemClass(view === "calendar")}>
          日历
        </Link>
      </div>
    </div>
  );
}

export default async function DesignBoardPage({
  searchParams,
}: {
  searchParams: { scope?: string; view?: string; month?: string };
}) {
  const scope: Scope = searchParams?.scope === "mine" ? "mine" : "all";
  const view: ViewMode = searchParams?.view === "calendar" ? "calendar" : "board";
  const now = new Date();

  // 日历视图：按 ?month= 取当月有 deadline 的任务，渲染 DesignCalendar。
  // 日历不分 scope（mine/all），故隐藏 ScopeToggle；scope 参数仍由 ViewModeToggle 保留，
  // 切回看板时不丢视角。
  if (view === "calendar") {
    const parsed = parseMonthParam(searchParams?.month, now);
    const data = await listDesignTasksForCalendar(parsed.year, parsed.month);
    return (
      <div className="space-y-8">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-semibold">设计管理</h1>
              <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
                按任务截止日期排布的月度日历：逾期任务标红，点击色片进入任务详情。
                未设截止日期的任务不塞进网格，在下方诚实提示。
              </p>
            </div>
            <ViewModeToggle view={view} scope={scope} />
          </div>
        </header>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">设计日历</h2>
            <span className="text-[13px] text-secondary whitespace-nowrap">
              本月到期 <span className="num text-primary">{data.tasks.length}</span>
            </span>
          </div>
          <DesignCalendar data={data} parsed={parsed} now={now} />
        </section>
      </div>
    );
  }

  // 看板视图（默认）：按状态分列推进，逾期标红。
  // 统计与看板分两次取数：统计永远看全量（任务池口径），看板按当前视角过滤。
  const [allTasks, tasks, totalCount, placeholder] = await Promise.all([
    listDesignTasks({ scope: "all" }),
    listDesignTasks({ scope }),
    getDesignTaskCount(),
    getPlaceholderUser(),
  ]);
  const reviewCount = allTasks.filter((t) => t.status === "submitted").length;
  const overdueCount = allTasks.filter((t) => isOverdue(t.deadline, t.status, now)).length;

  // 按状态分组成列（未知状态不显示，保底列序以纯常量为准）。
  const byStatus = new Map<DesignTaskStatus, DesignTaskListItem[]>();
  for (const s of DESIGN_TASK_STATUS_ORDER) byStatus.set(s, []);
  for (const t of tasks) {
    const list = byStatus.get(t.status as DesignTaskStatus);
    if (list) list.push(t);
  }

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">设计管理</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              设计任务的派单、执行与审核看板：按状态分列推进，逾期任务标红提示。
              点击卡片进入任务详情（提交与审核在详情页进行）。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ScopeToggle scope={scope} />
            <ViewModeToggle view={view} scope={scope} />
          </div>
        </div>

        {/* 页头统计：全量口径，数字来自服务（DB 真值，非常量） */}
        <p className="mt-4 text-[13px] text-secondary">
          任务 <span className="num text-primary">{totalCount}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          待审核 <span className="num text-primary">{reviewCount}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          逾期{" "}
          <span className={`num font-medium ${overdueCount > 0 ? "text-danger" : "text-primary"}`}>
            {overdueCount}
          </span>
        </p>
        {scope === "mine" && (
          <p className="mt-2 text-[13px] text-secondary">
            当前视角「指派给我」
            {placeholder ? (
              <>
                ：占位当前用户 <span className="font-medium text-primary">{placeholder.name}</span>
                （P4 接登录后自动切换为登录人）
              </>
            ) : (
              "：未找到设计师用户，列表为空（先运行 seed 或在用户表录入 designer 角色用户）"
            )}
          </p>
        )}
      </header>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">
            {scope === "all" ? "设计任务池（全部）" : "指派给我"}
          </h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">共 {tasks.length} 条</span>
        </div>

        {tasks.length === 0 ? (
          /* 诚实空态：气声描边、无阴影、单点钴蓝引导，不造假数据 */
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">
              {scope === "mine" ? "当前视角下暂无任务" : "暂无设计任务"}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              {scope === "mine"
                ? "该用户名下没有指派的设计任务；切换「设计任务池」可查看全部任务。"
                : "设计任务在项目详情或签约后创建；录入任务后将在此按状态分列展示。"}
            </p>
            {scope === "mine" && (
              <Link
                href="/design"
                className="mt-4 inline-flex h-8 items-center rounded-inner bg-accent px-3 text-[13px] font-medium text-accent-fg whitespace-nowrap transition-colors hover:opacity-90"
              >
                查看全部任务
              </Link>
            )}
          </div>
        ) : (
          /* 看板：M10-a UI-8 由「横向滚动 + 固定 280px 列」改为响应式网格（HAE 意见 8） */
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="contents">
              {DESIGN_TASK_STATUS_ORDER.map((status) => {
                const items = byStatus.get(status) ?? [];
                return (
                  <div key={status} className="flex min-w-0 flex-col">
                    {/* 列头：状态名 + 计数 */}
                    <div className="flex items-center justify-between border-b-2 border-line px-1 pb-2">
                      <span className="text-[13px] font-semibold text-primary whitespace-nowrap">
                        {DESIGN_TASK_STATUS_LABEL[status]}
                      </span>
                      <Badge variant="neutral">{items.length}</Badge>
                    </div>
                    {/* 列体：卡片堆 */}
                    <div className="mt-3 flex min-h-[48px] flex-col gap-3 p-1">
                      {items.length === 0 ? (
                        <p className="py-4 text-center text-[13px] text-secondary">暂无任务</p>
                      ) : (
                        items.map((t) => <TaskCard key={t.id} task={t} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
