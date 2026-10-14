"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, SectionTitle, type BadgeVariant } from "@/core/ui";
import { formatCny, formatPercent, formatSignedCny } from "@/core/domain/pricing";
import type { Light } from "@/core/domain/health";
import type { ProjectHub } from "@/modules/projects/server/projectDetail";
import { CustomFieldsForm } from "./CustomFieldsForm";

const TABS = [
  { key: "basic", label: "基础信息" },
  { key: "design", label: "设计进度" },
  { key: "schedule", label: "工期进度" },
  { key: "quality", label: "质量验收" },
  { key: "budget", label: "预算收支" },
  { key: "people", label: "人员分配" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** 项目六合一详情的 Tab 面板（M4-b + M6-e + M7-e）。只读聚合；工期/设计/质量接真数据。 */
export function ProjectTabs({ hub, initialTab }: { hub: ProjectHub; initialTab?: string }) {
  const valid = TABS.some((t) => t.key === initialTab);
  const [tab, setTab] = useState<TabKey>(valid ? (initialTab as TabKey) : "basic");
  return (
    <div className="mt-8">
      <div className="flex items-center gap-4 border-b border-line">
        <div className="flex min-w-0 flex-1 gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap border-b-2 pb-2 text-[15px] transition-colors duration-[120ms] ${
                tab === t.key
                  ? "border-accent font-medium text-primary"
                  : "border-transparent text-secondary hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link
          href={`/projects/${hub.id}/activity`}
          className="shrink-0 whitespace-nowrap pb-2 text-[13px] text-accent-ink hover:underline underline-offset-4"
        >
          项目动态
        </Link>
      </div>

      <div className="pt-6">
        {tab === "basic" && <BasicTab hub={hub} />}
        {tab === "design" && <DesignTab hub={hub} />}
        {tab === "schedule" && <ScheduleTab hub={hub} />}
        {tab === "quality" && <QualityTab hub={hub} />}
        {tab === "budget" && <BudgetTab hub={hub} />}
        {tab === "people" && <PeopleTab hub={hub} />}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  const v = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="flex gap-4 border-b border-line py-2 text-[13px] last:border-0">
      <dt className="w-24 shrink-0 text-secondary">{label}</dt>
      <dd className="min-w-0 flex-1">{v}</dd>
    </div>
  );
}

function BasicTab({ hub }: { hub: ProjectHub }) {
  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-surface p-5">
        <SectionTitle className="mb-2">客户与房屋</SectionTitle>
        <dl>
          <Row label="客户" value={hub.client?.name} />
          <Row label="联系电话" value={hub.client?.phone} />
          <Row label="地址" value={hub.address} />
          <Row label="建筑面积" value={hub.area > 0 ? `${hub.area} ㎡` : null} />
          <Row label="户型" value={hub.houseType} />
          <Row label="风格" value={hub.style} />
          <Row label="获客渠道" value={hub.source} />
        </dl>
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <SectionTitle className="mb-2">合同与工期</SectionTitle>
        <dl>
          <Row label="项目编号" value={hub.code} />
          <Row label="合同额" value={hub.contractAmount > 0 ? formatCny(hub.contractAmount) : "未录入"} />
          <Row label="开工日期" value={hub.startDate} />
          <Row label="计划完工" value={hub.endDate} />
          <Row label="实际完工" value={hub.actualEndDate} />
        </dl>
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <SectionTitle className="mb-3">项目健康度</SectionTitle>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
          <Light
            label="工期"
            tone={hub.schedule.hasSchedule ? hub.schedule.light : "gray"}
            text={
              hub.schedule.hasSchedule
                ? hub.schedule.light === "green"
                  ? "正常"
                  : hub.schedule.light === "yellow"
                    ? "预警"
                    : "超期"
                  : "未排程"
            }
          />
          <Light
            label="质量"
            tone={hub.quality.hasNodes ? hub.quality.light : "gray"}
            text={
              !hub.quality.hasNodes
                ? "暂无验收"
                : hub.quality.light === "green"
                  ? "正常"
                  : hub.quality.light === "yellow"
                    ? "待验收"
                    : "存在问题"
            }
          />
          <Light
            label="预算"
            tone={
              hub.finance.contractAmount > 0
                ? hub.finance.budgetLight
                : "gray"
            }
            text={
              hub.finance.contractAmount > 0
                ? `已收 ${formatPercent(hub.finance.paidPct ?? 0)}`
                : "未录入合同额"
            }
          />
          <span className="text-muted">
            整体进度：
            {hub.schedule.hasSchedule ? `${hub.schedule.progress}%` : "未排程"}
          </span>
        </div>
      </div>

      {/* 自定义字段（M9-c EAV）：值与控件形态由 core 口径给好，本文件不含校验逻辑 */}
      <CustomFieldsForm projectId={hub.id} rows={hub.customFields} />
    </div>
  );
}

function Light({
  label,
  tone,
  text,
}: {
  label: string;
  tone: Light | "gray";
  text: string;
}) {
  const dotCls =
    tone === "green"
      ? "bg-success"
      : tone === "yellow"
        ? "bg-warning"
        : tone === "red"
          ? "bg-danger"
          : "bg-sunken";
  return (
    <span className="flex items-center gap-2 text-secondary">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dotCls}`} />
      {label}：{text}
    </span>
  );
}

function MarginDot({ light }: { light: "green" | "yellow" | "red" | "neutral" }) {
  const cls =
    light === "green"
      ? "bg-success"
      : light === "yellow"
        ? "bg-warning"
        : light === "red"
          ? "bg-danger"
          : "bg-sunken";
  return (
    <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />
  );
}

/**
 * 毛利卡（M8-d）：毛利额 + 毛利率 + marginLight 色点 + 收支台账链。
 * 毛利依赖台账支出入账、不依赖报价，故置于 BudgetTab 顶部、q.exists 判断之外，
 * 无报价单也显示。marginRate==null（合同额未录入）→ 毛利率「—」+ 灰态提示，
 * 不造 0%。色点用语义色（success/warning/danger），neutral→bg-sunken。
 *
 * §4-16 收口（M9-e）：有合同额但**零支出**的项目，按公式毛利率恰得 100%——与驾驶舱决策 15
 * 「剔除无成本数据的 100%」同判定，这里也降级：毛利率显「—」、色点转灰、提示「未录入支出，
 * 毛利率不可算」。毛利额仍如实显示（它是台账真值，只是尚无支出可抵）。仅改显示层，
 * 不动 grossProfit/marginRate 口径函数（§4-17 负变更口径维持现状）。
 */
function GrossProfitCard({ hub }: { hub: ProjectHub }) {
  const f = hub.finance;
  const noExpenseData = f.marginRate !== null && f.expenseTotal === 0;
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <SectionTitle>毛利</SectionTitle>
        <MarginDot light={noExpenseData ? "neutral" : f.marginLight} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-secondary">毛利额</p>
          <p className="num mt-1.5 text-[20px] font-semibold text-primary whitespace-nowrap">
            {formatCny(f.grossProfit)}
          </p>
        </div>
        <div>
          <p className="text-xs text-secondary">毛利率</p>
          <p className="num mt-1.5 text-[17px] font-medium whitespace-nowrap">
            {f.marginRate === null || noExpenseData ? "—" : formatPercent(f.marginRate)}
          </p>
        </div>
      </div>
      {f.marginRate === null ? (
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          未录入合同额，不可算毛利率
        </p>
      ) : noExpenseData ? (
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          未录入支出，毛利率不可算
        </p>
      ) : null}
      <Link
        href={`/finance?projectId=${hub.id}`}
        className="mt-4 inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
      >
        打开收支台账 →
      </Link>

      {/* 累计变更行（M9-a）：毛利口径已含变更额，此处只展示。 */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[13px] text-secondary">累计变更</span>
          <span className="num whitespace-nowrap text-[15px] font-medium text-primary">
            {formatSignedCny(f.changeTotal)}
          </span>
        </div>
        {f.changeWarn && (
          <p className="mt-2 text-[13px] leading-relaxed text-warning">
            累计变更额已超合同额 5%，请关注
          </p>
        )}
        <Link
          href={`/budget/${hub.id}/changes`}
          className="mt-2 inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
        >
          变更单 →
        </Link>
      </div>
    </div>
  );
}

function BudgetTab({ hub }: { hub: ProjectHub }) {
  const q = hub.quote;
  return (
    <div className="space-y-6">
      {/* 毛利区块：依赖台账支出入账、不依赖报价，故置于 q.exists 判断之外 */}
      <GrossProfitCard hub={hub} />

      {!q || !q.exists ? (
        <EmptyTab
          title="该项目暂无报价单"
          note="在「装修预算报价」为该项目编制报价后，这里会显示直接费 / 税金 / 总价与分科目占比。"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="直接费" value={formatCny(q.directSubtotal)} />
            <Stat label={`税金 ${formatPercent(q.taxRate)}`} value={formatCny(q.tax)} />
            <Stat label="报价总价" value={formatCny(q.grand)} strong />
            <Stat label="单方造价" value={q.unitCost != null ? `${formatCny(q.unitCost)}/㎡` : "—"} />
          </div>

          <div className="rounded-card border border-line bg-surface p-5">
            <SectionTitle className="mb-4">分科目占比</SectionTitle>
            <div className="space-y-4">
              {q.categories.map((c) => (
                <div key={c.categoryName}>
                  <div className="flex items-baseline justify-between gap-4 text-[13px]">
                    <span className="whitespace-nowrap">{c.categoryName}</span>
                    <span className="whitespace-nowrap text-secondary">
                      {formatCny(c.subtotal)} · {formatPercent(c.pct)}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-inner bg-sunken"
                    aria-label={`${c.categoryName} 占比 ${formatPercent(c.pct)}`}
                  >
                    <div className="h-full bg-accent" style={{ width: `${Math.min(100, c.pct * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Link
            href={`/budget/${hub.id}`}
            className="inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
          >
            打开报价单 →
          </Link>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-xs text-secondary">{label}</p>
      <p className={`num mt-1.5 ${strong ? "text-[20px] font-semibold text-primary" : "text-[15px] font-medium"}`}>
        {value}
      </p>
    </div>
  );
}

function PeopleTab({ hub }: { hub: ProjectHub }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <SectionTitle className="mb-2">参与人员</SectionTitle>
      <dl>
        <Row label="项目设计师" value={hub.people.designer} />
        <Row label="项目经理" value={hub.people.pm} />
        <Row label="工程巡检" value={hub.people.inspector} />
        <Row label="预算员" value={hub.people.budgetAnalyst} />
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        绩效得分与考核维度将在「人员管控」模块上线后接入此处。
      </p>
    </div>
  );
}

/* ── 工期进度 Tab（M6-e）：排程聚合真数据；无排程诚实空态 ────────── */

function ScheduleStatusDot({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-success"
      : status === "in_progress"
        ? "bg-accent"
        : "bg-muted";
  return (
    <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />
  );
}

function ScheduleLightRow({ light }: { light: Light }) {
  const cfg =
    light === "green"
      ? { dot: "bg-success", label: "正常", note: "工期处于健康区间，按计划推进。" }
      : light === "yellow"
        ? { dot: "bg-warning", label: "预警", note: "距计划完工不足 7 天且进度低于 80%，需关注。" }
        : { dot: "bg-danger", label: "超期", note: "实际完工已超过计划工期，请尽快复盘。" };
  return (
    <span className="flex items-center gap-2 text-secondary">
      <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
      <span className="font-medium text-primary">{cfg.label}</span>
      <span className="text-muted">{cfg.note}</span>
    </span>
  );
}

function ScheduleTab({ hub }: { hub: ProjectHub }) {
  const s = hub.schedule;
  if (!s.hasSchedule) {
    return (
      <div className="rounded-card border border-line bg-surface px-5 py-12 text-center">
        <p className="text-[15px] font-medium text-secondary">该项目暂无排程</p>
        <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
          在「时间管控」按面积档一键生成排程后，这里会显示整体进度、工期预警与工序清单。
        </p>
        <Link
          href={`/schedule/${hub.id}`}
          className="mt-4 inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
        >
          去生成 →
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle>整体进度</SectionTitle>
          <span className="num text-[28px] font-semibold text-primary whitespace-nowrap">
            {s.progress}%
          </span>
        </div>
        <div
          className="mt-4 h-2 w-full overflow-hidden rounded-inner bg-sunken"
          aria-label={`整体进度 ${s.progress}%`}
        >
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, s.progress)}%` }} />
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <SectionTitle className="mb-3">工期状态</SectionTitle>
        <ScheduleLightRow light={s.light} />
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <SectionTitle className="mb-3">工序清单</SectionTitle>
        <ul className="divide-y divide-line">
          {s.tasks.map((t) => (
            <li key={t.order} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="num w-6 shrink-0 text-secondary">{t.order}.</span>
              <ScheduleStatusDot status={t.status} />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="num shrink-0 text-secondary whitespace-nowrap">{t.progress}%</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href={`/schedule/${hub.id}`}
        className="inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
      >
        打开甘特图 →
      </Link>
    </div>
  );
}

/* ── 设计进度 Tab（M6-e 补课）：设计聚合真数据；无任务诚实空态 ───── */

// 与 design 模块文案同源：跨模块禁引，故抄录；改文案须两处同步。
const DESIGN_STATUS_LABEL: Record<string, string> = {
  pending: "待分配",
  assigned: "进行中",
  submitted: "待审核",
  revisions: "待返修",
  approved: "已通过",
};

function DesignTab({ hub }: { hub: ProjectHub }) {
  const d = hub.design;
  if (d.total === 0) {
    return (
      <div className="rounded-card border border-line bg-surface px-5 py-12 text-center">
        <p className="text-[15px] font-medium text-secondary">该项目暂无设计任务</p>
        <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
          在「设计管理」为该项目分派设计任务后，这里会显示任务总量与各状态分布。
        </p>
      </div>
    );
  }
  const statuses: { status: string; variant: "neutral" | "warning" | "danger" | "success" }[] = [
    { status: "pending", variant: "neutral" },
    { status: "assigned", variant: "neutral" },
    { status: "submitted", variant: "warning" },
    { status: "revisions", variant: "danger" },
    { status: "approved", variant: "success" },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle>设计任务</SectionTitle>
          <span className="num text-[20px] font-semibold text-primary whitespace-nowrap">
            共 {d.total}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {statuses.map(({ status, variant }) => (
            <Badge key={status} variant={variant}>
              {DESIGN_STATUS_LABEL[status]}：{d.byStatus[status as keyof typeof d.byStatus]}
            </Badge>
          ))}
        </div>
      </div>
      <Link
        href="/design"
        className="inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
      >
        打开设计看板 →
      </Link>
    </div>
  );
}

/* ── 质量验收 Tab（M7-e）：验收节点/问题聚合真数据；无节点诚实空态 ───── */

// 与 quality 模块文案同源：跨模块禁引，故抄录；改文案须两处同步。
// 节点 4 态 + 问题严重度/状态 label / badge variant 映射（status.ts 同源）。
const NODE_STATUS_LABEL: Record<string, string> = {
  pending: "待提交",
  submitted: "待审核",
  returned: "已退回",
  passed: "已通过",
};

const NODE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  pending: "neutral",
  submitted: "accent",
  returned: "danger",
  passed: "success",
};

const ISSUE_SEVERITY_LABEL: Record<string, string> = {
  minor: "轻微",
  normal: "一般",
  major: "严重",
};

const ISSUE_SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  minor: "neutral",
  normal: "warning",
  major: "danger",
};

const ISSUE_STATUS_LABEL: Record<string, string> = {
  open: "待整改",
  rectified: "待复验",
  closed: "已关闭",
};

const ISSUE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: "danger",
  rectified: "warning",
  closed: "neutral",
};

function QualityTab({ hub }: { hub: ProjectHub }) {
  const q = hub.quality;
  if (!q.hasNodes) {
    return (
      <div className="rounded-card border border-line bg-surface px-5 py-12 text-center">
        <p className="text-[15px] font-medium text-secondary">暂无验收节点</p>
        <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
          工序完工后自动生成验收节点；排程推进到 100% 的工序将在此处出现。
        </p>
        <Link
          href={`/quality?projectId=${hub.id}`}
          className="mt-4 inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
        >
          打开质量管控 →
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle>验收节点</SectionTitle>
          <span className="num text-[20px] font-semibold text-primary whitespace-nowrap">
            共 {q.total}
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-secondary">
          节点 {q.total} · 通过 {q.passed} · 待审 {q.submitted} · 退回{" "}
          {q.returned} · 未关闭问题 {q.openIssues}
        </p>
        <ul className="mt-4 divide-y divide-line">
          {q.nodes.map((n) => (
            <li key={n.id} className="flex items-center gap-3 py-2 text-[13px]">
              <span className="num w-6 shrink-0 text-secondary">{n.order}.</span>
              <Link
                href={`/quality/nodes/${n.id}`}
                className="min-w-0 flex-1 truncate hover:underline underline-offset-4"
              >
                {n.name}
              </Link>
              <Badge variant={NODE_BADGE_VARIANT[n.status] ?? "neutral"}>
                {NODE_STATUS_LABEL[n.status] ?? n.status}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-card border border-line bg-surface p-5">
        <SectionTitle className="mb-3">未关闭问题</SectionTitle>
        {q.recentIssues.length === 0 ? (
          <p className="text-[13px] text-muted">无未关闭问题</p>
        ) : (
          <ul className="divide-y divide-line">
            {q.recentIssues.map((i) => (
              <li
                key={i.id}
                className="flex items-center gap-3 py-2 text-[13px]"
              >
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <Badge variant={ISSUE_SEVERITY_VARIANT[i.severity] ?? "neutral"}>
                  {ISSUE_SEVERITY_LABEL[i.severity] ?? i.severity}
                </Badge>
                <Badge variant={ISSUE_STATUS_VARIANT[i.status] ?? "neutral"}>
                  {ISSUE_STATUS_LABEL[i.status] ?? i.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/quality/issues?projectId=${hub.id}`}
          className="mt-4 inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
        >
          查看问题台账 →
        </Link>
      </div>

      <Link
        href={`/quality?projectId=${hub.id}`}
        className="inline-block whitespace-nowrap text-[13px] text-accent-ink hover:underline underline-offset-4"
      >
        打开质量管控 →
      </Link>
    </div>
  );
}

function EmptyTab({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-12 text-center">
      <p className="text-[15px] font-medium text-secondary">{title}</p>
      <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}
