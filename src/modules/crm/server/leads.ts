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
  stage: LeadStage;
  assignee: string | null;
  lastFollowAt: Date | null;
  projectId: string | null;
  updatedAt: Date;
}

/** 列出全部线索（按更新时间倒序）。 */
export async function listLeads(): Promise<LeadListItem[]> {
  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return leads.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    phone: l.phone,
    estate: l.estate,
    area: l.area,
    stage: l.stage as LeadStage,
    assignee: l.assignee,
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

/** 推进线索阶段。非法/末态直接抛错，由调用方（Server Action）捕获回文案。 */
export async function advanceStage(leadId: string, stage: LeadStage): Promise<void> {
  if (!LEAD_STAGE_ORDER.includes(stage)) {
    throw new LeadValidationError(`未知阶段：${stage}`);
  }
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new LeadValidationError("线索不存在");
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
