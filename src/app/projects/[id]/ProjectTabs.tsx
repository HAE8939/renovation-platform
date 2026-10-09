"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionTitle } from "@/core/ui";
import { formatCny, formatPercent } from "@/core/domain/pricing";
import type { ProjectHub } from "@/modules/projects/server/projectDetail";

const TABS = [
  { key: "basic", label: "基础信息" },
  { key: "design", label: "设计进度" },
  { key: "schedule", label: "工期进度" },
  { key: "quality", label: "质量验收" },
  { key: "budget", label: "预算收支" },
  { key: "people", label: "人员分配" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/** 项目六合一详情的 Tab 面板（M4-b）。只读聚合；设计/工期/质量数据源未建 → 诚实空状态。 */
export function ProjectTabs({ hub, initialTab }: { hub: ProjectHub; initialTab?: string }) {
  const valid = TABS.some((t) => t.key === initialTab);
  const [tab, setTab] = useState<TabKey>(valid ? (initialTab as TabKey) : "basic");
  return (
    <div className="mt-8">
      <div className="flex gap-6 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap border-b-2 pb-2 text-[15px] transition-colors duration-150 ${
              tab === t.key
                ? "border-accent font-medium text-primary"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-6">
        {tab === "basic" && <BasicTab hub={hub} />}
        {tab === "design" && (
          <EmptyTab title="设计管理模块开发中" note="方案版本、任务分派与图纸协同将在 M5 上线。" />
        )}
        {tab === "schedule" && (
          <EmptyTab title="时间管控模块开发中" note="工序排程与甘特图将在 M6 上线。" />
        )}
        {tab === "quality" && (
          <EmptyTab title="质量管控模块开发中" note="验收节点与问题台账将在 M7 上线。" />
        )}
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
          <Light label="工期" />
          <Light label="质量" />
          <Light label="预算" />
          <span className="text-muted">整体进度：未接入（工期数据 M6 起）</span>
        </div>
      </div>
    </div>
  );
}

function Light({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-secondary">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-surface-sunken" />
      {label}：未接入
    </span>
  );
}

function BudgetTab({ hub }: { hub: ProjectHub }) {
  const q = hub.quote;
  if (!q || !q.exists) {
    return (
      <EmptyTab
        title="该项目暂无报价单"
        note="在「装修预算报价」为该项目编制报价后，这里会显示直接费 / 税金 / 总价与分科目占比。"
      />
    );
  }
  return (
    <div className="space-y-6">
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
                className="mt-2 h-2 w-full overflow-hidden rounded-inner bg-surface-sunken"
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

function EmptyTab({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-12 text-center">
      <p className="text-[15px] font-medium text-secondary">{title}</p>
      <p className="mx-auto mt-2 max-w-prose text-[13px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}
