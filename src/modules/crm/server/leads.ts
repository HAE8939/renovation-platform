import prisma from "@/core/db";
import { createProject } from "@/core/domain/projects";
import { PROJECT_STATUS } from "@/core/domain/types";
import { normalizePhone, pickClientByPhone } from "./leadMatch";

/**
 * 商务线索服务（crm 模块 M3-a）。
 * 读写 M2-A 已建的 Lead 表（core 主数据），本服务不建/不改 schema。
 * 阶段推进先做按钮（非拖拽看板），口径与 TASK_M3_CRM 一致。
 */

/** Lead 阶段有序序列：推进按钮据此决定「下一阶段」。 */
export const LEAD_STAGE_ORDER = [
  "leads",
  "contacted",
  "confirmed",
  "quoted",
  "signed",
] as const;
export type LeadStage = (typeof LEAD_STAGE_ORDER)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  leads: "线索",
  contacted: "已联系",
  confirmed: "已确认",
  quoted: "已报价",
  signed: "已签约",
};

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

/** 计算下一阶段；已是末态返回 null（按钮禁用）。 */
export function nextStage(stage: LeadStage): LeadStage | null {
  const idx = LEAD_STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= LEAD_STAGE_ORDER.length - 1) return null;
  return LEAD_STAGE_ORDER[idx + 1];
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

    // c. 建项目（用归并到的 clientId，状态=筹备中）。
    const { id: projectId } = await createProject({
      clientId,
      clientName: lead.name,
      name: `${lead.name}·${lead.estate ?? "未知楼盘"}装修`,
      area: lead.area,
      style: lead.style ?? undefined,
      source: lead.source ?? undefined,
      contractAmount: contract.contractAmount,
      designer: contract.designer,
      pm: contract.pm,
      status: PROJECT_STATUS.draft,
    });

    // d. 回写 lead.projectId 与 stage=signed。
    await tx.lead.update({
      where: { id: leadId },
      data: { projectId, stage: "signed" },
    });

    return { projectId };
  });
}
