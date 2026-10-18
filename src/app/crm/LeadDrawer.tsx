"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Badge, Button, Card, Drawer, Field, Input, Table, Td, Textarea, Th } from "@/core/ui";
import { LeadArchiveButton } from "./LeadArchiveButton";
import {
  addFollowUpAction,
  getLeadDetailAction,
  type FollowUpFormState,
} from "@/modules/crm/actions";
import {
  LEAD_STAGE_ORDER,
  LEAD_STAGE_LABEL,
  nextStage,
  canGenericAdvance,
  type LeadStage,
} from "@/modules/crm/stages";
import type { LeadListItem } from "@/modules/crm/server/leads";
import { SignLeadButton } from "./SignLeadModal";
import { AdvanceStageForm } from "./AdvanceStageForm";

export { isStale, canSign, STAGE_BADGE };

type LeadDetailData = Awaited<ReturnType<typeof getLeadDetailAction>>;

/** 阶段到达“已报价”及之后（且尚未签约建项）可发起签约。 */
const QUOTED_INDEX = LEAD_STAGE_ORDER.indexOf("quoted");
function canSign(stage: LeadStage): boolean {
  return LEAD_STAGE_ORDER.indexOf(stage) >= QUOTED_INDEX;
}

const STAGE_BADGE: Record<LeadStage, "neutral" | "accent" | "success" | "outline" | "warning"> = {
  leads: "outline",
  contacted: "neutral",
  confirmed: "accent",
  quoted: "accent",
  signed: "success",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 是否“超 3 天未跟进”：未签约且（从未跟进 或 距最后跟进 > 3 天）。 */
function isStale(lead: LeadListItem): boolean {
  if (lead.projectId) return false;
  if (!lead.lastFollowAt) return true;
  const diff = Date.now() - new Date(lead.lastFollowAt).getTime();
  return diff > 3 * 24 * 60 * 60 * 1000;
}

/** 基础信息单行：标签 + 值。 */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[13px] text-secondary whitespace-nowrap">{label}</span>
      <span className="text-right text-[15px] text-primary break-words">{value ?? "—"}</span>
    </div>
  );
}

/** 抽屉内“添加跟进”表单：提交后通知父级刷新时间线。 */
function AddFollowUpForm({
  leadId,
  onAdded,
}: {
  leadId: string;
  onAdded: () => void;
}) {
  const initial: FollowUpFormState = {};
  const [state, formAction] = useFormState<FollowUpFormState, FormData>(
    addFollowUpAction.bind(null, leadId),
    initial
  );

  useEffect(() => {
    if (state.ok) onAdded();
  }, [state.ok, onAdded]);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="跟进内容" required>
        <Textarea name="content" rows={3} placeholder="记录本次沟通要点、客户反馈…" required />
      </Field>
      <Field label="下次跟进日期" hint="选填">
        <Input name="nextFollowAt" type="date" />
      </Field>

      {state.error && <p className="text-[13px] text-danger">{state.error}</p>}

      <div className="flex items-center gap-4">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "添加跟进"}
    </Button>
  );
}

/** 抽屉内容：基础信息 + 跟进时间线 + 添加表单。 */
function DrawerBody({ leadId, onAdded }: { leadId: string; onAdded: () => void }) {
  const [detail, setDetail] = useState<LeadDetailData>(null);

  useEffect(() => {
    let active = true;
    getLeadDetailAction(leadId).then((d) => {
      if (active) setDetail(d);
    });
    return () => {
      active = false;
    };
  }, [leadId, onAdded]);

  if (!detail) {
    return <p className="text-[13px] text-secondary">加载中…</p>;
  }

  return (
    <div className="space-y-6">
      {/* 基础信息 */}
      <section>
        <h4 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          基础信息
        </h4>
        <div className="mt-2 divide-y divide-line">
          <InfoRow label="编号" value={detail.code} />
          <InfoRow label="姓名" value={detail.name} />
          <InfoRow label="电话" value={detail.phone} />
          <InfoRow label="楼盘" value={detail.estate} />
          <InfoRow label="面积" value={detail.area ? `${detail.area.toFixed(1)} ㎡` : "—"} />
          <InfoRow label="风格" value={detail.style} />
          <InfoRow label="预算区间" value={detail.budgetRange} />
          <InfoRow label="来源" value={detail.source} />
          <InfoRow
            label="阶段"
            value={<Badge variant={STAGE_BADGE[detail.stage] ?? "neutral"}>{LEAD_STAGE_LABEL[detail.stage] ?? detail.stage}</Badge>}
          />
          <InfoRow label="负责人" value={detail.assignee} />
          <InfoRow label="最后跟进" value={formatDate(detail.lastFollowAt)} />
          <InfoRow label="下次跟进" value={formatDate(detail.nextFollowAt)} />
        </div>
      </section>

      {/* 跟进时间线（最新在上） */}
      <section>
        <h4 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          跟进时间线
        </h4>
        {detail.followUps.length === 0 ? (
          <p className="mt-2 text-[13px] text-secondary">暂无跟进记录，添加第一条吧。</p>
        ) : (
          <ol className="mt-2 space-y-4">
            {detail.followUps.map((f) => (
              <li key={f.id} className="border-l border-line pl-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-secondary">{formatDate(f.date)}</span>
                  {f.nextFollowAt && (
                    <span className="text-[13px] text-accent-ink whitespace-nowrap">
                      下次：{formatDate(f.nextFollowAt)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[15px] leading-relaxed text-primary break-words">
                  {f.content}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 添加跟进 */}
      <section className="border-t border-line pt-4">
        <h4 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
          添加跟进
        </h4>
        <div className="mt-3">
          <AddFollowUpForm leadId={leadId} onAdded={onAdded} />
        </div>
      </section>

      {/* 签约入口：方案报价及之后、且尚未签约建项时显示 */}
      {detail.stage !== "signed" && canSign(detail.stage) && (
        <section className="border-t border-line pt-4">
          <h4 className="text-[13px] font-medium uppercase tracking-[0.08em] text-secondary">
            签约建项
          </h4>
          <div className="mt-3">
            <SignLeadButton leadId={leadId} />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * 可复用的线索详情抽屉（M3-c 抽屉本体 + 外层 Drawer 壳）。
 * 表格与看板共用同一抽屉，避免复制逻辑。
 */
export function LeadDrawer({
  leadId,
  open,
  onClose,
  onAdded,
  name,
}: {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
  name?: string;
}) {
  if (!leadId) return null;
  const safeOnAdded = onAdded ?? (() => {});
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`线索详情 · ${name ?? ""}`}
    >
      <DrawerBody key={leadId} leadId={leadId} onAdded={safeOnAdded} />
    </Drawer>
  );
}

/**
 * 可点开详情抽屉的线索表格（客户端）。
 * 整表放在客户端：行点击打开右侧抽屉；推进/签约等交互单元格阻止冒泡，
 * 不触发抽屉。保留 M3-d2 的“签约”按钮/列。Drawer 与 table 同级，避免非法嵌套。
 */
export function LeadsTable({ leads }: { leads: LeadListItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const handleAdded = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <>
      <Card padded={false} className="mt-3">
        <Table>
          <thead>
              <tr>
                <Th>编号</Th>
                <Th>姓名</Th>
                <Th>楼盘</Th>
                <Th align="right">面积</Th>
                <Th>阶段</Th>
                <Th>负责人</Th>
                <Th align="right">最后跟进</Th>
                <Th align="right">推进</Th>
                <Th align="right">签约 / 项目</Th>
                <Th align="right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const next = nextStage(l.stage);
                const stale = isStale(l);
                const open = openId === l.id;
                return (
                  <tr
                    key={l.id}
                    onClick={() => setOpenId(l.id)}
                    className="cursor-pointer hover:bg-canvas"
                  >
                    <Td className="num text-[13px] text-secondary">{l.code}</Td>
                    <Td className="font-medium">{l.name}</Td>
                    <Td className="text-secondary">{l.estate ?? "—"}</Td>
                    <Td align="right" className="num text-secondary">
                      {l.area ? l.area.toFixed(1) : "—"}
                    </Td>
                    <Td>
                      <Badge variant={STAGE_BADGE[l.stage] ?? "neutral"}>
                        {LEAD_STAGE_LABEL[l.stage] ?? l.stage}
                      </Badge>
                    </Td>
                    <Td className="text-secondary">{l.assignee ?? "—"}</Td>
                    <Td
                      align="right"
                      className={`text-[13px] ${stale ? "text-danger font-medium" : "text-secondary"}`}
                    >
                      {formatDate(l.lastFollowAt)}
                    </Td>
                    <Td align="right" onClick={(e) => e.stopPropagation()}>
                      {canGenericAdvance(l.stage) && next ? (
                        <AdvanceStageForm leadId={l.id} stage={next} />
                      ) : l.stage === "quoted" ? (
                        // §4-14：quoted→signed 只走右侧“签约建项”，不给通用推进
                        <span className="text-[13px] text-muted">走“签约”→</span>
                      ) : (
                        <span className="text-[13px] text-secondary">已到末态</span>
                      )}
                    </Td>
                    <Td align="right" onClick={(e) => e.stopPropagation()}>
                      {l.projectId ? (
                        <a
                          href={`/budget/${l.projectId}`}
                          className="text-[13px] font-medium text-accent-ink whitespace-nowrap hover:underline"
                        >
                          查看项目
                        </a>
                      ) : canSign(l.stage) ? (
                        <SignLeadButton leadId={l.id} />
                      ) : (
                        <span className="text-[13px] text-secondary">—</span>
                      )}
                    </Td>
                    {/* M10-a 备料三：作废＝从漏斗/看板/签约率摘出去，可恢复；已签约的走项目归档 */}
                    <Td align="right" onClick={(e) => e.stopPropagation()}>
                      <LeadArchiveButton
                        leadId={l.id}
                        leadName={l.name}
                        archived={l.archived}
                        signed={l.stage === "signed"}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
      </Card>

      <LeadDrawer
        leadId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onAdded={handleAdded}
        name={openId ? leads.find((l) => l.id === openId)?.name : undefined}
      />
    </>
  );
}
