import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Table, Th, Td } from "@/core/ui";
import { nodeStatusTone } from "@/modules/quality/status";
import {
  listNodes,
  resolveTaskNode,
} from "@/modules/quality/server/nodes";
import { ProjectSearchFilter } from "./ProjectSearchFilter";

export const dynamic = "force-dynamic";
export const metadata = { title: "质量管控" };

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function QualityListPage({
  searchParams,
}: {
  searchParams: { projectId?: string; taskId?: string };
}) {
  // ?taskId= 深链解析（M7-e 入口，本单元先支持跳转目标）：
  //   节点存在 → redirect 节点详情；任务存在但无节点 → redirect 项目筛选；
  //   任务不存在 → 不跳转，走列表。
  if (searchParams?.taskId) {
    const resolved = await resolveTaskNode(searchParams.taskId);
    if (resolved && "nodeId" in resolved) {
      redirect(`/quality/nodes/${resolved.nodeId}`);
    }
    if (resolved && "projectId" in resolved) {
      redirect(`/quality?projectId=${resolved.projectId}`);
    }
    // resolved === null：任务不存在，不跳转，显示全量列表
  }

  const projectId = searchParams?.projectId || null;
  const data = await listNodes({ projectId: projectId ?? undefined });

  // 页头统计：全量口径（不受筛选影响，DB 真值）
  const total = data.nodes.length;
  const reviewCount = data.nodes.filter((n) => n.status === "submitted").length;
  const returnedCount = data.nodes.filter((n) => n.status === "returned").length;
  const passedCount = data.nodes.filter((n) => n.status === "passed").length;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">质量管控</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              工序完工后自动生成验收节点，巡检按 SOP 检查项逐项验收，退回自动建问题，
              整改复验闭环。节点详情、问题台账与质量档案均已上线。
            </p>
          </div>
          <ProjectSearchFilter
            projects={data.projects}
            selectedId={projectId}
            basePath="/quality"
          />
        </div>

        <p className="mt-4 text-[13px] text-secondary">
          节点 <span className="num text-primary">{total}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          待审核 <span className="num text-primary">{reviewCount}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          已退回{" "}
          <span className={`num font-medium ${returnedCount > 0 ? "text-danger" : "text-primary"}`}>
            {returnedCount}
          </span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          已通过 <span className="num text-primary">{passedCount}</span>
        </p>
      </header>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">验收节点</h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            共 {total} 条
          </span>
        </div>

        {total === 0 ? (
          /* 诚实空态：无节点不造假数据，引导去排程完工 */
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">
              暂无验收节点——工序完工后自动生成
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              排程工序进度到 100% 即在本页生成对应验收节点，并按 SOP 检查项清单逐项验收。
            </p>
            <Link
              href="/schedule"
              className="mt-4 inline-flex h-8 items-center rounded-inner bg-accent px-3 text-[13px] font-medium text-accent-fg whitespace-nowrap transition-colors hover:opacity-90"
            >
              去排程看板
            </Link>
          </div>
        ) : (
          <Card padded={false} className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>验收节点</Th>
                  <Th>项目</Th>
                  <Th>状态</Th>
                  <Th>提交人</Th>
                  <Th align="right">提交时间</Th>
                  <Th align="right">检查</Th>
                  <Th align="right">问题</Th>
                </tr>
              </thead>
              <tbody>
                {data.nodes.map((n) => {
                  const checkLabel =
                    n.checkTotal === 0
                      ? "—"
                      : `${n.checkPassed}/${n.checkTotal}`;
                  const issueLabel = n.openIssueCount === 0 ? "—" : String(n.openIssueCount);
                  return (
                    <tr
                      key={n.id}
                      className="cursor-pointer transition-colors hover:bg-canvas"
                    >
                      <Td>
                        <Link
                          href={`/quality/nodes/${n.id}`}
                          className="font-medium text-primary hover:text-accent-ink"
                          title={`查看「${n.name}」验收节点`}
                        >
                          {n.name}
                        </Link>
                      </Td>
                      <Td className="text-secondary">
                        <Link
                          href={`/quality?projectId=${n.projectId}`}
                          className="hover:text-primary"
                          title={n.projectName}
                        >
                          {n.projectName}
                        </Link>
                      </Td>
                      <Td>
                        <Badge variant={nodeStatusTone(n.status)}>
                          {n.displayLabel}
                        </Badge>
                      </Td>
                      <Td className="text-secondary">{n.submitterName ?? "—"}</Td>
                      <Td align="right" className="num text-secondary whitespace-nowrap">
                        {formatDate(n.submittedAt)}
                      </Td>
                      <Td align="right" className="num text-secondary whitespace-nowrap">
                        {checkLabel}
                      </Td>
                      <Td
                        align="right"
                        className={`num whitespace-nowrap ${
                          n.openIssueCount > 0 ? "text-danger font-medium" : "text-secondary"
                        }`}
                      >
                        {issueLabel}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
