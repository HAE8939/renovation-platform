"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Badge, Button, Drawer, Field, Textarea } from "@/core/ui";
import {
  ISSUE_SEVERITY_LABEL,
  ISSUE_STATUS_LABEL,
  issueSeverityTone,
  issueStatusTone,
} from "@/modules/quality/status";
import type { IssueRow } from "@/modules/quality/server/issues";
import {
  rectifyIssueAction,
  recheckIssueAction,
  type IssueActionFormState,
} from "@/app/quality/actions";

/** 日期时间（整改/复验/关闭时间精确到分钟）。 */
function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 仅日期（截止/报告时间用）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 基础信息单行：标签 + 值（仿 LeadDrawer InfoRow）。 */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">{label}</span>
      <span className="text-right text-[15px] text-primary break-words">
        {value ?? "—"}
      </span>
    </div>
  );
}

/** 区块标题（仿 LeadDrawer 的小节标题）。 */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
      {children}
    </h4>
  );
}

// ── 整改表单（status=open 时显示）──────────────────────────────

function RectifyForm({
  issueId,
  onDone,
}: {
  issueId: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "confirm">("idle");
  const [state, formAction] = useFormState<IssueActionFormState, FormData>(
    rectifyIssueAction,
    {}
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  if (state.ok) {
    return (
      <p className="text-[13px] text-success">已标记整改，页面正在刷新…</p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="issueId" value={issueId} />
      {mode === "idle" ? (
        <Button size="sm" onClick={() => setMode("confirm")}>
          标记已整改
        </Button>
      ) : (
        <div className="space-y-4">
          <Field label="整改说明" required>
            <Textarea
              name="rectifyNote"
              rows={3}
              required
              placeholder="说明已采取的整改措施、整改结果…"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <RectifySubmitButton />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setMode("idle")}
            >
              取消
            </Button>
          </div>
        </div>
      )}
      {state.error && (
        <p className="text-[13px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

function RectifySubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "提交中…" : "确认整改"}
    </Button>
  );
}

// ── 复验表单（status=rectified 时显示：通过·关闭 / 退回）────────

function RecheckForm({
  issueId,
  onDone,
}: {
  issueId: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "pass" | "fail">("idle");
  const [state, formAction] = useFormState<IssueActionFormState, FormData>(
    recheckIssueAction,
    {}
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  if (state.ok) {
    return (
      <p className="text-[13px] text-success">已处理复验，页面正在刷新…</p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="issueId" value={issueId} />
      <input
        type="hidden"
        name="pass"
        value={mode === "pass" ? "true" : "false"}
      />

      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary" size="sm" onClick={() => setMode("pass")}>
            复验通过·关闭
          </Button>
          <Button variant="danger" size="sm" onClick={() => setMode("fail")}>
            复验退回
          </Button>
        </div>
      )}

      {mode === "pass" && (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-primary">
            确认复验通过并关闭此问题？关闭后问题进入「已关闭」终态。
          </p>
          <Field label="复验意见" hint="选填">
            <Textarea
              name="recheckNote"
              rows={3}
              placeholder="可记录复验结论…"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <RecheckSubmitButton label="确认关闭" pendingLabel="处理中…" />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setMode("idle")}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {mode === "fail" && (
        <div className="space-y-4">
          <Field label="退回意见" required hint="必填，问题将退回待整改">
            <Textarea
              name="recheckNote"
              rows={3}
              required
              placeholder="说明复验未通过的具体原因、需进一步整改的要求…"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <RecheckSubmitButton label="确认退回" pendingLabel="处理中…" />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setMode("idle")}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {state.error && (
        <p className="text-[13px] text-danger">{state.error}</p>
      )}
    </form>
  );
}

function RecheckSubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * 问题详情抽屉（M7-c，复用 core/ui/Drawer）。
 *
 * 头部（Drawer title = 问题标题）→ 严重度/状态徽章 → 描述 → 基础信息
 * （项目 / 来源节点 / 报告人 / 报告时间 / 责任人 / 截止）→ 整改记录 → 复验记录
 * → 动作区（按状态门控）：open→[标记已整改]；rectified→[复验通过·关闭]+[复验退回]；
 * closed→「已关闭」静默文案。错误红字回显，成功关抽屉。
 *
 * issue 为 null 时（openId 未命中，不应发生）不渲染内容。
 */
export function IssueDrawer({
  issue,
  open,
  onClose,
}: {
  issue: IssueRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!issue) return null;

  const severityLabel =
    ISSUE_SEVERITY_LABEL[
      issue.severity as keyof typeof ISSUE_SEVERITY_LABEL
    ] ?? issue.severity;
  const statusLabel =
    ISSUE_STATUS_LABEL[issue.status as keyof typeof ISSUE_STATUS_LABEL] ??
    issue.status;

  return (
    <Drawer open={open} onClose={onClose} title={issue.title}>
      <div className="space-y-6">
        {/* 严重度 / 状态徽章 */}
        <div className="flex items-center gap-2">
          <Badge variant={issueSeverityTone(issue.severity)}>
            {severityLabel}
          </Badge>
          <Badge variant={issueStatusTone(issue.status)}>
            {statusLabel}
          </Badge>
        </div>

        {/* 描述 */}
        {issue.desc && (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-primary">
            {issue.desc}
          </p>
        )}

        {/* 基础信息 */}
        <section>
          <SectionTitle>基础信息</SectionTitle>
          <div className="mt-2 divide-y divide-line">
            <InfoRow label="项目" value={issue.projectName} />
            <InfoRow
              label="来源节点"
              value={
                issue.nodeId ? (
                  <Link
                    href={`/quality/nodes/${issue.nodeId}`}
                    className="text-accent-ink hover:underline"
                  >
                    {issue.nodeName ?? "查看节点"}
                  </Link>
                ) : (
                  "手工新建"
                )
              }
            />
            <InfoRow label="报告人" value={issue.reporterName} />
            <InfoRow label="报告时间" value={formatDate(issue.createdAt)} />
            <InfoRow label="责任人" value={issue.assigneeName} />
            <InfoRow
              label="截止"
              value={
                isOverdueDisplay(issue.dueDate, issue.status)
                  ? `${formatDate(issue.dueDate)}（已逾期）`
                  : formatDate(issue.dueDate)
              }
            />
          </div>
        </section>

        {/* 整改记录 */}
        <section>
          <SectionTitle>整改记录</SectionTitle>
          {issue.rectifyNote && issue.rectifiedAt ? (
            <div className="mt-2">
              <p className="text-[13px] text-secondary whitespace-nowrap">
                {formatDateTime(issue.rectifiedAt)}
              </p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-primary">
                {issue.rectifyNote}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-secondary">—</p>
          )}
        </section>

        {/* 复验记录 */}
        <section>
          <SectionTitle>复验记录</SectionTitle>
          {issue.recheckNote && (issue.closedAt || issue.status === "open") ? (
            <div className="mt-2">
              <p className="text-[13px] text-secondary whitespace-nowrap">
                {issue.status === "closed"
                  ? formatDateTime(issue.closedAt)
                  : "复验退回"}
              </p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-primary">
                {issue.recheckNote}
              </p>
            </div>
          ) : issue.closedAt ? (
            <p className="mt-2 text-[13px] text-secondary">
              {formatDateTime(issue.closedAt)} 关闭（无复验意见）
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-secondary">—</p>
          )}
        </section>

        {/* 动作区（按状态门控）*/}
        <section className="border-t border-line pt-4">
          <SectionTitle>操作</SectionTitle>
          <div className="mt-3">
            {issue.status === "open" && (
              <RectifyForm issueId={issue.id} onDone={onClose} />
            )}
            {issue.status === "rectified" && (
              <RecheckForm issueId={issue.id} onDone={onClose} />
            )}
            {issue.status === "closed" && (
              <p className="text-[13px] leading-relaxed text-secondary">
                该问题已关闭，无需进一步操作。
              </p>
            )}
          </div>
        </section>
      </div>
    </Drawer>
  );
}

/** 截止逾期提示（内部用，open/rectified 态才提示，closed 不提示）。 */
function isOverdueDisplay(due: Date | null, status: string): boolean {
  if (!due || status === "closed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due).getTime() < today.getTime();
}
