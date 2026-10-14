import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/core/ui";
import { getProjectIdentity } from "@/core/domain/projects";
import { listOperations } from "@/core/domain/operationLog";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/core/domain/types";
import { LEAD_STAGE_LABEL } from "@/modules/crm/stages";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目动态" };

const ACTION_LABEL: Record<string, string> = {
  "project.archive": "项目归档",
  "project.restore": "项目恢复",
  "project.update": "项目更新",
  "quote.save": "报价保存",
  "change.create": "新增变更单",
  "change.update": "修改变更单",
  "change.delete": "删除变更单",
  "record.create": "新增收支",
  "record.update": "修改收支",
  "record.delete": "删除收支",
  "plan.generate": "生成付款计划",
  "plan.clear": "清空付款计划",
  "plan.markPaid": "标记付款",
  "plan.unmarkPaid": "撤销付款标记",
  "schedule.generate": "生成排程",
  "schedule.clear": "清空排程",
  "schedule.progress": "更新工序进度",
  "node.submit": "提交验收",
  "node.review": "审核验收",
  "issue.create": "新建问题",
  "issue.rectify": "问题整改",
  "issue.recheck": "问题复验",
  "customValues.save": "保存自定义字段",
};

const STATUS_LABEL: Record<string, string> = {
  // 线索阶段垫底、项目态覆盖在前：同名（signed）时以项目态为准，语义两者本就一致。
  ...LEAD_STAGE_LABEL,
  ...PROJECT_STATUS_LABEL,
  submitted: "待审核",
  returned: "已退回",
  passed: "已通过",
  open: "待整改",
  rectified: "待复验",
  closed: "已关闭",
  pending: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  archived: "已归档",
};

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readableValue(value: string | null, action: string): string | null {
  if (!value) return null;
  if (action.startsWith("project.")) return STATUS_LABEL[value] ?? null;
  if (action.startsWith("node.")) return STATUS_LABEL[value] ?? null;
  if (action.startsWith("issue.")) return STATUS_LABEL[value] ?? null;
  if (action.startsWith("schedule.")) return STATUS_LABEL[value] ?? null;
  // 线索流水的 before/after 存阶段机器值（§4.3），不映射就整条显示为空
  if (action.startsWith("lead.")) return STATUS_LABEL[value] ?? null;
  if (value === "active") return "启用";
  if (value === "inactive") return "停用";
  if (value === "true") return "是";
  if (value === "false") return "否";
  return null;
}

function ChangeNote({
  action,
  before,
  after,
}: {
  action: string;
  before: string | null;
  after: string | null;
}) {
  const oldValue = readableValue(before, action);
  const newValue = readableValue(after, action);
  if (oldValue || newValue) {
    return (
      <p className="mt-2 text-xs text-secondary">
        变更前后：{oldValue ?? "空"} → {newValue ?? "空"}
      </p>
    );
  }
  if (before || after) {
    return <p className="mt-2 text-xs text-muted">变更前后已记入流水，摘要已列出可读说明。</p>;
  }
  return null;
}

export default async function ProjectActivityPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { limit?: string };
}) {
  // 标题经 core/domain 取，页面不直查主数据表（§2 分层）；刻意不用 getProjectHub——
  // 取个页头标题不该付一次全站聚合的代价。
  const project = await getProjectIdentity(params.id);
  if (!project) notFound();

  const parsedLimit = Number.parseInt(searchParams?.limit ?? "50", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 50), 200) : 50;
  const operations = await listOperations({ projectId: project.id, limit });
  const hasMore = operations.length === limit && limit < 200;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/projects/${project.id}`}
          className="whitespace-nowrap text-[13px] text-secondary transition-colors duration-[120ms] hover:text-accent-ink"
        >
          ← 返回项目详情
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold">项目动态</h1>
          <Badge variant="outline">{project.code}</Badge>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-secondary">
          记录这个项目的关键改动，方便回看谁在什么时候做过什么操作。
        </p>
      </header>

      {operations.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-8 py-12 text-center">
          <p className="text-[15px] font-medium text-primary">这单还没有留档的改动</p>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            保存报价、台账、排程、验收或归档等操作后，会在这里留下可回看的记录。
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {operations.map((operation) => (
            <li key={operation.id} className="rounded-card border border-line bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[15px] font-medium text-primary">
                  {ACTION_LABEL[operation.action] ?? "项目操作"}
                </p>
                <time className="num text-xs text-secondary" dateTime={operation.at.toISOString()}>
                  {formatDateTime(operation.at)}
                </time>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-primary">{operation.summary}</p>
              <p className="mt-2 text-xs text-secondary">操作人：{operation.actorName}</p>
              <ChangeNote
                action={operation.action}
                before={operation.before}
                after={operation.after}
              />
              {operation.error ? (
                <p className="mt-2 text-xs text-danger">操作未完成：{operation.error}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {hasMore ? (
        <div className="text-center">
          <Link
            href={`/projects/${project.id}/activity?limit=${Math.min(limit + 50, 200)}`}
            className="inline-flex h-9 items-center rounded-inner border border-line bg-surface px-4 text-[13px] text-secondary transition-colors duration-[120ms] hover:text-primary"
          >
            加载更多
          </Link>
        </div>
      ) : null}
    </div>
  );
}
