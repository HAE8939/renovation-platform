import Link from "next/link";
import { Badge, Card, Table, Td, Th } from "@/core/ui";
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
} from "@/core/domain/types";
import type { ProjectStatus } from "@/core/domain/types";
import {
  listProjectsForManagement,
  type ProjectManagementItem,
} from "@/modules/projects/server/projects";
import { formatCny, formatQty } from "@/modules/budget/lib/quote";
import { buildFiltersFromParams, listDefs } from "@/core/domain/customFieldRepo";
import { describeFilter } from "@/core/domain/customField";
import { ViewToggle } from "./ViewToggle";
import { StatusFilter } from "./StatusFilter";
import { ArchiveButton } from "./ArchiveButton";
import { CustomFieldFilter } from "./CustomFieldFilter";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目管理" };

type ViewMode = "card" | "table";

const STATUS_BADGE: Record<ProjectStatus, "neutral" | "accent" | "success" | "outline"> = {
  draft: "outline",
  design: "accent",
  in_progress: "accent",
  acceptance: "neutral",
  completed: "success",
  archived: "neutral",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 进度：有排程显 {n}%；无排程显灰色「未排程」（撤掉恒「未接入」文案）。 */
function ProgressCell({ progress }: { progress: number | null }) {
  if (progress == null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-sunken" />
        未排程
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-primary whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      <span className="num">{progress}%</span>
    </span>
  );
}

/** 单张项目卡片（卡片视图）。整卡链到详情页。 */
function ProjectCard({ p }: { p: ProjectManagementItem }) {
  return (
    <Link href={`/projects/${p.id}`} className="group block">
      <Card className="h-full transition-colors hover:border-accent">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-medium text-primary whitespace-nowrap truncate">
            {p.name}
          </span>
          <Badge variant={STATUS_BADGE[p.status as ProjectStatus] ?? "neutral"} className="shrink-0">
            {PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status}
          </Badge>
        </div>

        <div className="mt-2 space-y-1 text-[13px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">编号</span>
            <span className="text-right text-primary num">{p.code}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">客户</span>
            <span className="text-right text-primary break-words">{p.clientName}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">面积</span>
            <span className="text-right text-primary num">
              {formatQty(p.area)} ㎡
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">合同额</span>
            <span className="text-right text-primary num">{formatCny(p.contractAmount)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">报价总价</span>
            <span className="text-right text-accent-ink num font-medium">
              {formatCny(p.quoteGrand)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary whitespace-nowrap">设计 / 项目经理</span>
            <span className="text-right text-primary break-words">
              {[p.designer, p.pm].filter(Boolean).join(" · ") || "—"}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <ProgressCell progress={p.progress} />
          <span className="text-[13px] text-accent-ink whitespace-nowrap group-hover:underline underline-offset-4">
            项目详情 →
          </span>
        </div>
      </Card>
    </Link>
  );
}

export default async function ProjectsListPage({
  searchParams,
}: {
  searchParams: {
    view?: string;
    status?: string;
    /** 自定义字段条件下界或唯一值：`?cfv=<key>:<值>`（可多条） */
    cfv?: string | string[];
    /** 自定义字段条件上界：`?cfvto=<key>:<值>`（可多条） */
    cfvto?: string | string[];
  };
}) {
  const view: ViewMode = searchParams?.view === "table" ? "table" : "card";
  const status = searchParams?.status;
  const asArray = (v: string | string[] | undefined): string[] =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  // 自定义字段筛选（M9-c c-2）：类型真值从定义表取，URL 只带 key 与值
  const fieldDefs = await listDefs();
  const cfvFilters = buildFiltersFromParams(
    fieldDefs,
    asArray(searchParams?.cfv),
    asArray(searchParams?.cfvto),
  );
  const projects = await listProjectsForManagement({ status, cfv: cfvFilters });
  const applied = cfvFilters
    .map((f) => {
      const def = fieldDefs.find((d) => d.id === f.fieldId);
      return def ? describeFilter({ label: def.label, type: def.type }, f) : null;
    })
    .filter((x): x is string => x !== null);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">项目管理</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              签约后的项目汇聚成一个统一全貌：按生命周期状态筛选，查看客户、面积、合同额、
              报价汇总与关键人员。点任意项目进入详情。
            </p>
          </div>
          <ViewToggle view={view} />
        </div>
      </header>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">项目列表</h2>
          <div className="flex items-center gap-3">
            <StatusFilter value={status} />
            <span className="text-[13px] text-secondary whitespace-nowrap">
              共 {projects.length} 个
            </span>
          </div>
        </div>

        {fieldDefs.length > 0 && <CustomFieldFilter defs={fieldDefs} />}

        {applied.length > 0 && (
          <p className="mt-3 text-[13px] text-secondary">
            已按自定义字段筛选：<span className="text-primary">{applied.join(" · ")}</span>
            <a href="/projects" className="ml-3 text-accent-ink hover:underline">
              清除条件
            </a>
          </p>
        )}

        {projects.length === 0 ? (
          <Card className="mt-3 py-10 text-center text-[15px] text-secondary">
            没有符合条件的项目。
          </Card>
        ) : view === "card" ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <Card padded={false} className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>编号</Th>
                  <Th>项目名称</Th>
                  <Th>客户</Th>
                  <Th>状态</Th>
                  <Th align="right">面积</Th>
                  <Th align="right">合同额</Th>
                  <Th align="right">报价总价</Th>
                  <Th>设计师</Th>
                  <Th>项目经理</Th>
                  <Th>进度</Th>
                  <Th align="right">最近更新</Th>
                  <Th>详情</Th>
                  <Th align="right">操作</Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="group hover:bg-canvas">
                    <Td className="num text-[13px] text-secondary">{p.code}</Td>
                    <Td className="font-medium">
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-primary underline-offset-4 hover:text-accent-ink hover:underline"
                      >
                        {p.name}
                      </Link>
                    </Td>
                    <Td className="text-secondary">{p.clientName}</Td>
                    <Td>
                      <Badge variant={STATUS_BADGE[p.status as ProjectStatus] ?? "neutral"}>
                        {PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status}
                      </Badge>
                    </Td>
                    <Td align="right" className="num text-secondary">
                      {formatQty(p.area)}
                    </Td>
                    <Td align="right" className="num">
                      {formatCny(p.contractAmount)}
                    </Td>
                    <Td align="right" className="num text-accent-ink font-medium">
                      {formatCny(p.quoteGrand)}
                    </Td>
                    <Td className="text-secondary">{p.designer ?? "—"}</Td>
                    <Td className="text-secondary">{p.pm ?? "—"}</Td>
                    <Td>
                      <ProgressCell progress={p.progress} />
                    </Td>
                    <Td align="right" className="text-[13px] text-secondary">
                      {formatDate(p.updatedAt)}
                    </Td>
                    <Td>
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-[13px] text-accent-ink whitespace-nowrap hover:underline underline-offset-4"
                      >
                        查看 →
                      </Link>
                    </Td>
                    {/* M10-a 备料三：归档＝从全司口径摘出去（可恢复），不是删数据 */}
                    <Td align="right">
                      <ArchiveButton
                        projectId={p.id}
                        projectName={p.name}
                        archived={p.status === "archived"}
                        unclosed={p.unclosed}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
