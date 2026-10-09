import prisma from "@/core/db";
import { PROJECT_STATUS } from "@/core/domain/types";
import type { QuoteItemRow } from "../types";

/**
 * 预算模块的数据访问层。
 * 路由层（src/app/budget/**）保持薄，只调用这里的函数。
 */

const DEFAULT_ORG_SLUG = "default";

async function getDefaultOrgId(): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } });
  if (!org) throw new Error("默认组织未初始化，请先运行 prisma db seed");
  return org.id;
}

/** 项目编号：RP-<年>-<3 位序号>。序号按已存在项目数推算。 */
export async function suggestProjectCode(): Promise<string> {
  const count = await prisma.project.count();
  return `RP-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
}

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  area: number;
  status: string;
  clientName: string;
  itemCount: number;
  quoteStatus: string | null;
  updatedAt: Date;
}

/** /budget 列表：项目 + 客户名 + 报价条目数。 */
export async function listProjects(): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    include: {
      client: { select: { name: true } },
      quotes: {
        select: {
          status: true,
          _count: { select: { items: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    area: p.area,
    status: p.status,
    clientName: p.client.name,
    itemCount: p.quotes[0]?._count?.items ?? 0,
    quoteStatus: p.quotes[0]?.status ?? null,
    updatedAt: p.updatedAt,
  }));
}

export interface ProjectDetail {
  id: string;
  code: string;
  name: string;
  address: string | null;
  area: number;
  status: string;
  designer: string | null;
  pm: string | null;
  clientName: string;
  clientPhone: string | null;
  startDate: Date | null;
  endDate: Date | null;
  taxRate: number;
  quoteStatus: string;
  items: QuoteItemRow[];
}

/**
 * /budget/[projectId] 详情：项目信息 + 唯一报价单 + 明细分组顺序。
 * 一项目一报价（M1a 约束，多版本留 M1b）。
 */
export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { name: true, phone: true } },
      quotes: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!project) return null;

  const quote = project.quotes[0];
  let items: QuoteItemRow[] = [];
  if (quote) {
    const rows = await prisma.quoteItem.findMany({
      where: { quoteId: quote.id },
      orderBy: { order: "asc" },
    });
    items = rows.map((r) => ({
      id: r.id,
      categoryName: r.categoryName,
      code: r.code,
      name: r.name,
      unit: r.unit,
      unitPrice: r.unitPrice,
      quantity: r.quantity,
      materials: r.materials,
      sop: r.sop,
      order: r.order,
    }));
  }

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    address: project.address,
    area: project.area,
    status: project.status,
    designer: project.designer,
    pm: project.pm,
    clientName: project.client.name,
    clientPhone: project.client.phone,
    startDate: project.startDate,
    endDate: project.endDate,
    taxRate: quote?.taxRate ?? 0.03,
    quoteStatus: quote?.status ?? "draft",
    items,
  };
}

export interface CreateProjectInput {
  name: string;
  code: string;
  clientName: string;
  area: number;
  address?: string;
  designer?: string;
  pm?: string;
  status?: string;
}

export interface CreateProjectResult {
  id: string;
  code: string;
}

/** 项目设置页可改字段。日期用 "YYYY-MM-DD" 或空串；空 = 清除。 */
export interface UpdateProjectInput {
  name: string;
  code: string;
  clientName: string;
  clientPhone?: string;
  area: number;
  address?: string;
  designer?: string;
  pm?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * "YYYY-MM-DD" → 本地零点 Date；空 / 非法 → null。
 * 用 "T00:00:00" 构造本地时间，规避 UTC 零点在负时区被 toLocaleDateString 往前推一天。
 */
function parseDateInput(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class ValidationError extends Error {}

/** 新建项目（Server Action 落库）。code 为空时自动生成。 */
export async function createProject(
  input: CreateProjectInput
): Promise<CreateProjectResult> {
  const name = input.name.trim();
  const clientName = input.clientName.trim();
  if (!name) throw new ValidationError("请填写项目名称");
  if (!clientName) throw new ValidationError("请填写客户名称");

  const area = Number(input.area);
  if (!Number.isFinite(area) || area < 0) throw new ValidationError("建筑面积需为非负数字");

  const code = input.code.trim() || (await suggestProjectCode());
  const exists = await prisma.project.findUnique({ where: { code } });
  if (exists) throw new ValidationError(`项目编号 ${code} 已存在，请更换`);

  const orgId = await getDefaultOrgId();

  return prisma.$transaction(async (tx) => {
    // Client 表无 (orgId, name) 复合唯一约束，用 findFirst/create 代替 upsert
    const client = (await tx.client.findFirst({ where: { orgId, name: clientName } })) ?? (
      await tx.client.create({ data: { orgId, name: clientName } })
    );

    const project = await tx.project.create({
      data: {
        code,
        name,
        address: input.address?.trim() || null,
        area,
        clientId: client.id,
        designer: input.designer?.trim() || null,
        pm: input.pm?.trim() || null,
        status: input.status ?? PROJECT_STATUS.draft,
      },
    });

    // 建项目即建一张草稿报价单，报价明细后续在 M1b 的编辑器里补
    await tx.budgetQuote.create({
      data: { projectId: project.id, taxRate: 0.03, status: "draft" },
    });

    return { id: project.id, code: project.code };
  });
}

/**
 * 编辑项目基础信息（M1b-B3）。校验口径与 createProject 一致，
 * 但 code 唯一性需排除自身：留空则沿用原编号（等同不改编号）。
 * 客户名/电话就地更新到当前 Client（编辑非重建，保持 clientId 不变）。
 */
export async function updateProject(
  projectId: string,
  input: UpdateProjectInput
): Promise<void> {
  const name = input.name.trim();
  const clientName = input.clientName.trim();
  if (!name) throw new ValidationError("请填写项目名称");
  if (!clientName) throw new ValidationError("请填写客户名称");

  const area = Number(input.area);
  if (!Number.isFinite(area) || area < 0) throw new ValidationError("建筑面积需为非负数字");

  const code = input.code.trim();
  if (!code) throw new ValidationError("请填写项目编号");

  const status = input.status ?? PROJECT_STATUS.draft;

  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });
    if (!project) throw new ValidationError("项目不存在");

    // 编号唯一性排除自身；只有编号真正变更时才查重
    if (code !== project.code) {
      const exists = await tx.project.findFirst({
        where: { code, NOT: { id: projectId } },
      });
      if (exists) throw new ValidationError(`项目编号 ${code} 已存在，请更换`);
    }

    await tx.client.update({
      where: { id: project.clientId },
      data: { name: clientName, phone: input.clientPhone?.trim() || null },
    });

    await tx.project.update({
      where: { id: projectId },
      data: {
        code,
        name,
        address: input.address?.trim() || null,
        area,
        designer: input.designer?.trim() || null,
        pm: input.pm?.trim() || null,
        status,
        startDate: parseDateInput(input.startDate),
        endDate: parseDateInput(input.endDate),
      },
    });
  });
}
