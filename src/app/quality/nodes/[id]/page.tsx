import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Table, Th, Td } from "@/core/ui";
import { syncAcceptanceNodes } from "@/core/domain/acceptance";
import { getPlaceholderUser } from "@/modules/quality/currentUser";
import {
  canResubmitAfterReturn,
  canSubmitNode,
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  issueSeverityTone,
  issueStatusTone,
  nodeStatusTone,
} from "@/modules/quality/status";
import { getNodeDetail } from "@/modules/quality/server/nodes";
import { SubmitChecksForm } from "./SubmitChecksForm";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";

/** 提交/审核时间精确到分钟（仿 design/[id] formatDateTime）。 */
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

/** 仅日期（计划起止/实际起止用）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 检查项结果徽章（只读模式）。 */
function CheckResultBadge({ result }: { result: string | null }) {
  if (result === "pass") return <Badge variant="success">通过</Badge>;
  if (result === "fail") return <Badge variant="danger">不通过</Badge>;
  return <Badge variant="neutral">未检</Badge>;
}

/**
 * 验收节点详情（M7-b）：基础信息 + 检查项清单（提交/只读）+ 影像占位 +
 * 关联问题 + 审核区。仿 design/[id] 结构：内联展开、必填校验、错误回显。
 *
 * 页开头先 getNodeDetail 拿 projectId → syncAcceptanceNodes 兜底（调用点②）。
 * 节点不存在 → notFound()。门控走 status.ts 纯函数，不在页面硬编码状态。
 */
export default async function NodeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await getNodeDetail(params.id);
  if (!detail) notFound();

  // 调用点②：读前同步该节点所属项目（兜底自愈）
  await syncAcceptanceNodes(detail.projectId);

  // 占位用户：提交人（inspector，缺则 pm）/ 审核人（pm，缺则 inspector）
  const [submitUser, reviewUser] = await Promise.all([
    getPlaceholderUser("submit"),
    getPlaceholderUser("review"),
  ]);

  // 提交模式门控：canSubmitNode 且（returned 时）canResubmitAfterReturn
  const issuesProj = detail.issues.map((i) => ({ status: i.status }));
  const submitMode =
    canSubmitNode(detail.status) &&
    (detail.status !== "returned" || canResubmitAfterReturn(issuesProj));

  // 审核区门控：仅 submitted 且占位审核用户存在
  const reviewMode = detail.status === "submitted" && !!reviewUser;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/quality"
          className="text-[13px] text-secondary whitespace-nowrap transition-colors hover:text-primary"
        >
          ← 返回质量管控
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] num text-secondary">{detail.projectCode}</p>
            <h1 className="mt-1 text-[28px] font-semibold">{detail.name}</h1>
          </div>
          <Badge variant={nodeStatusTone(detail.status)}>{detail.displayLabel}</Badge>
        </div>
        <p className="mt-2 text-[13px] text-secondary">
          所属项目：
          <Link
            href={`/quality?projectId=${detail.projectId}`}
            className="text-primary hover:text-accent-ink"
          >
            {detail.projectName}
          </Link>
        </p>
      </header>

      {/* 退回原因横幅（returned 置顶，danger 调）*/}
      {detail.status === "returned" && detail.returnReason && (
        <div className="rounded-card border border-danger bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-6">
          <p className="text-[13px] font-medium text-danger">退回原因</p>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-primary">
            {detail.returnReason}
          </p>
          {detail.hasOpenIssues && (
            <p className="mt-3 text-[13px] leading-relaxed text-danger">
              关联问题整改完成后可重新提交。
            </p>
          )}
        </div>
      )}

      {/* 通过横幅（passed）+ 付款联动说明 */}
      {detail.status === "passed" && (
        <div className="rounded-card border border-line bg-[color-mix(in_srgb,var(--success)_8%,var(--surface))] p-6">
          <p className="text-[15px] font-medium text-success">该节点已通过验收</p>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            财务模块已上线：本节点通过即作为付款段解锁依据。
            <Link
              href={`/finance/payments?projectId=${detail.projectId}`}
              className="ml-1 text-accent-ink hover:underline underline-offset-4 whitespace-nowrap"
            >
              查看付款计划 →
            </Link>
          </p>
        </div>
      )}

      {/* 基础信息 */}
      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-[15px] font-semibold">基础信息</h2>
        <div className="mt-4 space-y-2 text-[13px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-secondary whitespace-nowrap">关联工序</span>
            <span className="text-right text-primary break-words">
              {detail.task?.name ?? detail.name}
            </span>
          </div>
          {detail.task && (
            <>
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-secondary whitespace-nowrap">计划起止</span>
                <span className="text-right num text-primary whitespace-nowrap">
                  {formatDate(detail.task.startDate)} 至 {formatDate(detail.task.endDate)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-secondary whitespace-nowrap">实际起止</span>
                <span className="text-right num text-primary whitespace-nowrap">
                  {formatDate(detail.task.actualStart)} 至 {formatDate(detail.task.actualEnd)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-secondary whitespace-nowrap">负责人</span>
                <span className="text-right text-primary break-words">
                  {detail.task.ownerName ?? "—"}
                </span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-secondary whitespace-nowrap">提交人</span>
            <span className="text-right text-primary break-words">
              {detail.submittedByName ?? "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-secondary whitespace-nowrap">提交时间</span>
            <span className="text-right num text-primary whitespace-nowrap">
              {formatDateTime(detail.submittedAt)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-secondary whitespace-nowrap">审核人</span>
            <span className="text-right text-primary break-words">
              {detail.reviewedByName ?? "—"}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="shrink-0 text-secondary whitespace-nowrap">审核时间</span>
            <span className="text-right num text-primary whitespace-nowrap">
              {formatDateTime(detail.reviewedAt)}
            </span>
          </div>
        </div>
        {detail.submitNote && (
          <>
            <h3 className="mt-6 text-[15px] font-semibold">提交说明</h3>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-primary">
              {detail.submitNote}
            </p>
          </>
        )}
      </section>

      {/* 检查项清单：提交模式 / 只读模式 */}
      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-[15px] font-semibold">检查项</h2>
        {submitMode ? (
          <div className="mt-4">
            <SubmitChecksForm
              nodeId={detail.id}
              checks={detail.checks.map((c) => ({
                id: c.id,
                name: c.name,
                standard: c.standard,
                order: c.order,
                result: c.result,
                note: c.note,
              }))}
              placeholderUserName={submitUser?.name ?? null}
            />
          </div>
        ) : detail.checks.length === 0 ? (
          <p className="mt-4 text-[13px] leading-relaxed text-secondary">
            该工序暂无检查项。
          </p>
        ) : (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <Th>检查项</Th>
                  <Th>标准</Th>
                  <Th>结果</Th>
                  <Th>备注</Th>
                </tr>
              </thead>
              <tbody>
                {detail.checks.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium text-primary whitespace-nowrap">{c.name}</Td>
                    <Td className="text-secondary text-[13px]">{c.standard}</Td>
                    <Td>
                      <CheckResultBadge result={c.result} />
                    </Td>
                    <Td className="text-secondary text-[13px] break-words">
                      {c.note || "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      {/* 影像占位说明条（DEFERRED，诚实空态）*/}
      <p className="text-[13px] leading-relaxed text-secondary">
        现场影像本期未接入（规划中）。
      </p>

      {/* 关联问题 */}
      <section className="rounded-card border border-line bg-surface p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold">关联问题</h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            <Link
              href={`/quality/issues?projectId=${detail.projectId}`}
              className="text-accent-ink hover:underline"
            >
              打开问题台账 →
            </Link>
          </span>
        </div>
        {detail.issues.length === 0 ? (
          <p className="mt-4 text-[13px] leading-relaxed text-secondary">无关联问题。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {detail.issues.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-b-0 last:pb-0"
              >
                <span className="text-[13px] font-medium text-primary break-words">
                  {i.title}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={issueSeverityTone(i.severity)}>
                    {ISSUE_SEVERITY_LABEL[i.severity as keyof typeof ISSUE_SEVERITY_LABEL] ?? i.severity}
                  </Badge>
                  <Badge variant={issueStatusTone(i.status)}>
                    {ISSUE_STATUS_LABEL[i.status as keyof typeof ISSUE_STATUS_LABEL] ?? i.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 审核区：仅 submitted 且占位审核用户存在 */}
      {reviewMode && (
        <section className="rounded-card border border-line bg-surface p-6">
          <h2 className="text-[15px] font-semibold">审核</h2>
          <ReviewForm
            nodeId={detail.id}
            placeholderUserName={reviewUser?.name ?? null}
          />
        </section>
      )}

      {/* returned 且未达重提门控：提示（提交模式已禁用，此处再补一句可读说明）*/}
      {detail.status === "returned" && detail.hasOpenIssues && !submitMode && (
        <p className="text-[13px] leading-relaxed text-secondary">
          当前存在未整改问题，提交验收已禁用；关联问题整改完成后可重新提交。
        </p>
      )}
    </div>
  );
}
