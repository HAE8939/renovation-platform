import prisma from "@/core/db";
import { createProject } from "@/core/domain/projects";
import { PROJECT_STATUS } from "@/core/domain/types";
import { normalizePhone, pickClientByPhone } from "./leadMatch";
import {
  LEAD_STAGE_ORDER,
  LEAD_STAGE_LABEL,
  nextStage,
} from "../stages";
import type { LeadStage } from "../stages";

/**
 * 商务线索服务（crm 模块 M3-a/M3-c）。
 * 读写 M2-A 已建的 Lead 表（core 主数据），本服务不建/不改 schema。
 * 阶段推进先做按钮（非拖拽看板），口径与 TASK_M3_CRM 一致。
 */

// 阶段常量/标签/nextStage 抽到纯模块（stages.ts），客户端 UI 可安全引用；
// 服务层与历史调用方仍从本文件 re-export，保持兼容。
export {
  LEAD_STAGE_ORDER,
  LEAD_STAGE_LABEL,
  nextStage,
};
export type { LeadStage };

export interface LeadListItem {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  estate: string | null;
  area: number;
  budgetRange: string | null;
  intentLevel: string;
  stage: LeadStage;
  assignee: string | null;
  lastFollowAt: Date | null;
  projectId: string | null;
  updatedAt: Date;
  /** 作废位（M10-a）：true = 不进漏斗/看板，可恢复 */
  archived: boolean;
}

/**
 * 列出线索（按更新时间倒序）。
 * M10-a 备料三：默认**不含已作废**——作废的语义就是"从漏斗与看板里摘出去"。
 * 要恢复必须能看到，故留 `includeArchived` 开关给「已作废」筛选用，不做隐式全量返回。
 */
export async function listLeads(opts?: { includeArchived?: boolean; onlyArchived?: boolean }): Promise<LeadListItem[]> {
  const leads = await prisma.lead.findMany({
    where: opts?.onlyArchived ? { archived: true } : opts?.includeArchived ? {} : { archived: false },
    orderBy: { updatedAt: "desc" },
  });

  return leads.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    phone: l.phone,
    estate: l.estate,
    area: l.area,
    budgetRange: l.budgetRange,
    intentLevel: l.intentLevel,
    stage: l.stage as LeadStage,
    assignee: l.assignee,
    archived: l.archived,
    lastFollowAt: l.lastFollowAt,
    projectId: l.projectId,
    updatedAt: l.updatedAt,
  }));
}

export interface CreateLeadInput {
  name: string;
  phone?: string;
  estate?: string;
  area?: number;
  assignee?: string;
}

export class LeadValidationError extends Error {}

/** 新建线索。code 由 LEAD-<年>-<3 位序号> 推算；姓名必填。 */
export async function createLead(input: CreateLeadInput): Promise<{ id: string; code: string }> {
  const name = input.name.trim();
  if (!name) throw new LeadValidationError("请填写客户姓名");

  const orgId = await getDefaultOrgId();
  const code = await suggestLeadCode();

  const lead = await prisma.lead.create({
    data: {
      orgId,
      code,
      name,
      phone: input.phone?.trim() || null,
      estate: input.estate?.trim() || null,
      area: Number.isFinite(Number(input.area)) ? Number(input.area) : 0,
      assignee: input.assignee?.trim() || null,
      stage: "leads",
    },
  });

  return { id: lead.id, code: lead.code };
}

/**
 * 推进线索阶段。非法/末态直接抛错，由调用方（Server Action）捕获回文案。
 * 非相邻目标（回退/跳阶）直接抛错——与 UI 的『仅向前相邻推进』对齐（M8.5）。
 */
export async function advanceStage(leadId: string, stage: LeadStage): Promise<void> {
  if (!LEAD_STAGE_ORDER.includes(stage)) {
    throw new LeadValidationError(`未知阶段：${stage}`);
  }
  // §4-14 收紧：signed 只能经「签约建项」（signLead：建项目 + 按手机号归并 Client + 回写 projectId）
  // 落定，通用推进不得直达——否则会出现「线索已签约却无项目」的悬空态（双路径语义重叠）。
  if (stage === "signed") {
    throw new LeadValidationError("已签约须经「签约建项」完成（会同时建项目并归并客户），不支持直接推进");
  }
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new LeadValidationError("线索不存在");
  const next = nextStage(lead.stage as LeadStage);
  if (next === null) {
    throw new LeadValidationError("该线索已到末态（已签约），无法继续推进");
  }
  if (stage !== next) {
    throw new LeadValidationError(`仅支持推进到下一阶段（下一阶段应为「${LEAD_STAGE_LABEL[next]}」）`);
  }
  await prisma.lead.update({
    where: { id: leadId },
    data: { stage, lastFollowAt: new Date() },
  });
}

async function getDefaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: "default" } });
  if (!org) throw new Error("默认组织未初始化，请先运行 prisma db seed");
  return org.id;
}

/** 线索编号：LEAD-<年>-<3 位序号>。序号按已存在线索数推算。 */
export async function suggestLeadCode(): Promise<string> {
  const count = await prisma.lead.count();
  return `LEAD-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
}

/** 签约合同输入（来自 M3-d2 弹窗表单）。 */
export interface SignLeadContract {
  contractAmount: number;
  designer?: string;
  pm?: string;
  startDate?: string;
}

export interface SignLeadResult {
  projectId: string;
}

/**
 * 签约 → 按手机号归并 Client + 建项目 + 回写 Lead（M3-d1）。
 * 事务内执行；幂等：若 lead 已签约（projectId 存在）直接返回不重复建。
 *
 * 归并口径（TASK_M3_CRM §4，用户 2026-10-09 拍板）：
 *  - 归并键 = 手机号，有意取代旧「按客户名 upsert」，避免同名不同人被并。
 *  - 命中既有 Client → 复用、不覆盖其 name（保守，防串改共享主数据）。
 *  - 未命中 → 新建 Client（name=lead.name, phone=lead.phone）。
 */
export async function signLead(
  leadId: string,
  contract: SignLeadContract
): Promise<SignLeadResult> {
  return prisma.$transaction(async (tx) => {
    // a. 读 lead；幂等：已签约直接返回，不重复建。
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new LeadValidationError("线索不存在");
    if (lead.projectId) return { projectId: lead.projectId };

    // b. 按手机号在本 org 的 Client 里归并。
    const phone = normalizePhone(lead.phone);
    const clients = await tx.client.findMany({
      where: { orgId: lead.orgId },
      select: { id: true, phone: true },
    });
    const matched = pickClientByPhone(clients, phone);
    const clientId = matched
      ? matched.id // 命中复用，不覆盖 name
      : (
          await tx.client.create({
            data: { orgId: lead.orgId, name: lead.name, phone: lead.phone },
          })
        ).id;

    // c. 建项目（用归并到的 clientId，状态=筹备中）。传 tx 让 createProject 复用同一事务，
    //    否则 createProject 自开独立事务、看不见本事务刚建的 Client（SQLite 隔离）。
    const { id: projectId } = await createProject(
      {
        clientId,
        clientName: lead.name,
        name: `${lead.name}·${lead.estate ?? "未知楼盘"}装修`,
        area: lead.area,
        style: lead.style ?? undefined,
        source: lead.source ?? undefined,
        contractAmount: contract.contractAmount,
        designer: contract.designer,
        pm: contract.pm,
        startDate: contract.startDate,
        status: PROJECT_STATUS.draft,
      },
      tx
    );

    // d. 回写 lead.projectId 与 stage=signed。
    await tx.lead.update({
      where: { id: leadId },
      data: { projectId, stage: "signed" },
    });

    return { projectId };
  });
}

/** 单条跟进记录（快照自 FollowUp 表）。 */
export interface FollowUpItem {
  id: string;
  date: Date;
  content: string;
  nextFollowAt: Date | null;
}

/** 线索详情：基础信息 + 其跟进时间线（按 date 倒序，最新在上）。 */
export interface LeadDetail {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  estate: string | null;
  area: number;
  style: string | null;
  budgetRange: string | null;
  source: string | null;
  stage: LeadStage;
  assignee: string | null;
  lastFollowAt: Date | null;
  nextFollowAt: Date | null;
  projectId: string | null;
  followUps: FollowUpItem[];
}

/** 取线索详情（含倒序跟进）。线索不存在返回 null。 */
export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { followUps: { orderBy: { date: "desc" } } },
  });
  if (!lead) return null;

  return {
    id: lead.id,
    code: lead.code,
    name: lead.name,
    phone: lead.phone,
    estate: lead.estate,
    area: lead.area,
    style: lead.style,
    budgetRange: lead.budgetRange,
    source: lead.source,
    stage: lead.stage as LeadStage,
    assignee: lead.assignee,
    lastFollowAt: lead.lastFollowAt,
    nextFollowAt: lead.nextFollowAt,
    projectId: lead.projectId,
    followUps: lead.followUps.map((f) => ({
      id: f.id,
      date: f.date,
      content: f.content,
      nextFollowAt: f.nextFollowAt,
    })),
  };
}

export interface AddFollowUpInput {
  content: string;
  nextFollowAt?: Date | null;
}

/**
 * 新增一条跟进，并同步回写 Lead：lastFollowAt=当前时间、nextFollowAt=传入值（若有）。
 * content 为空抛 LeadValidationError，由调用方（Server Action）捕获回中文文案。
 */
export async function addFollowUp(leadId: string, input: AddFollowUpInput): Promise<void> {
  const content = (input.content ?? "").trim();
  if (!content) throw new LeadValidationError("请填写跟进内容");

  await prisma.$transaction(async (tx) => {
    await tx.followUp.create({
      data: {
        leadId,
        content,
        nextFollowAt: input.nextFollowAt ?? null,
        date: new Date(),
      },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: {
        lastFollowAt: new Date(),
        nextFollowAt: input.nextFollowAt ?? null,
      },
    });
  });
}

/**
 * 作废 / 恢复线索（M10-a 备料三）。
 *
 * 为什么需要：签约不可逆（建出客户 + 项目 + 草稿报价单），而误建的线索会永久污染
 * 商务漏斗的阶段存量与签约率——平台此前**没有任何**摘出去的手段。
 * 为什么不做硬删：Lead.projectId 是项目↔线索的 1-1 溯源（AGENTS §4.1），删线索会把
 * 已签约项目的来源查不到；且 SQLite 无回收站。故只置位、可恢复。
 *
 * 已签约（stage=signed 且已回写 projectId）的线索**不允许只作废线索**——那会让项目失去来源，
 * 要清掉得走「项目归档」，两边状态保持一致。这条守卫是本函数唯一的业务规则。
 */
export async function setLeadArchived(
  leadId: string,
  archived: boolean
): Promise<{ ok: true } | { error: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, stage: true, projectId: true, archived: true },
  });
  if (!lead) return { error: "线索不存在，请刷新页面后重试" };
  if (archived && lead.stage === "signed") {
    return { error: "该线索已签约，不能只作废线索——请到项目中心归档对应项目（否则项目会失去来源）" };
  }
  if (lead.archived === archived) return { ok: true };
  await prisma.lead.update({
    where: { id: leadId },
    data: { archived, archivedAt: archived ? new Date() : null },
  });
  return { ok: true };
}
