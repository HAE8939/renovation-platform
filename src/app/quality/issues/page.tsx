import Link from "next/link";
import {
  ISSUE_SEVERITY_LABEL,
  ISSUE_SEVERITY_ORDER,
  ISSUE_STATUS_LABEL,
  ISSUE_STATUS_ORDER,
} from "@/modules/quality/status";
import { listIssues } from "@/modules/quality/server/issues";
import { IssueLedger } from "./IssueLedger";
import { NewIssueModal } from "./NewIssueModal";

export const dynamic = "force-dynamic";
export const metadata = { title: "问题台账" };

/** 仅日期（截止 / 报告时间用）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 截止日期是否逾期（早于今天且未关闭）。 */
function isOverdue(due: Date | null, status: string): boolean {
  if (!due || status === "closed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due).getTime() < today.getTime();
}

/**
 * 问题台账页（M7-c）：筛选行（项目/状态/严重度，GET form 直链）+ [新建问题] +
 * 表格（问题/项目/严重度/状态/责任人/截止/报告时间）+ 行点击开抽屉。
 *
 * 筛选走服务端 GET form（无客户端状态），选中值回填 select。空态分两态：
 * 无任何问题 → 引导；筛选无结果 → 「无符合条件的问题」。
 */
export default async function QualityIssuesPage({
  searchParams,
}: {
  searchParams: { projectId?: string; status?: string; severity?: string };
}) {
  const projectId = searchParams?.projectId || undefined;
  const status = searchParams?.status || undefined;
  const severity = searchParams?.severity || undefined;
  const data = await listIssues({ projectId, status, severity });

  const hasAnyIssue = data.issues.length > 0;
  // 是否存在筛选条件（决定显示哪种空态文案）
  const filtering = !!(projectId || status || severity);

  // 当前筛选项目名（新建 Modal 默认项目用）
  const currentProject = projectId
    ? data.projects.find((p) => p.id === projectId) ?? null
    : null;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/quality"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回质量管控
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">问题台账</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              验收退回自动建问题，亦支持手工新建。逐条整改、复验闭环；
              按项目、状态、严重度筛选定位。
            </p>
          </div>
          <NewIssueModal
            projects={data.projects}
            users={data.users}
            defaultProjectId={currentProject?.id ?? null}
          />
        </div>
      </header>

      {/* 筛选行：服务端 GET form（仿 design ScopeToggle 的直链思路，无客户端状态） */}
      <form className="flex flex-wrap items-end gap-3" method="get" action="/quality/issues">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-secondary">项目</span>
          <select
            name="projectId"
            defaultValue={projectId ?? ""}
            className="block w-full rounded-inner border border-line bg-surface px-3 py-2 pr-8 text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value="">全部项目</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-secondary">状态</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="block w-full rounded-inner border border-line bg-surface px-3 py-2 pr-8 text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value="">全部状态</option>
            {ISSUE_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {ISSUE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-secondary">严重度</span>
          <select
            name="severity"
            defaultValue={severity ?? ""}
            className="block w-full rounded-inner border border-line bg-surface px-3 py-2 pr-8 text-sm text-primary focus:outline-none focus:border-accent"
          >
            <option value="">全部严重度</option>
            {ISSUE_SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>
                {ISSUE_SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-inner bg-accent px-4 text-sm font-medium text-white whitespace-nowrap transition-colors hover:brightness-95"
          >
            筛选
          </button>
          <Link
            href="/quality/issues"
            className="inline-flex h-9 items-center justify-center rounded-inner border border-line bg-surface px-4 text-sm text-secondary whitespace-nowrap transition-colors hover:text-primary"
          >
            清除
          </Link>
        </div>
      </form>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">问题列表</h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            共 {data.issues.length} 条
          </span>
        </div>

        {hasAnyIssue ? (
          <IssueLedger issues={data.issues} />
        ) : filtering ? (
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">无符合条件的问题</p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              调整筛选条件或清除筛选查看全部问题。
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">
              暂无问题——验收退回自动建问题，也可手工新建
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              审核退回验收节点时会自动建立关联问题；如需记录巡检发现的其他问题，点击右上角「+ 新建问题」。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
