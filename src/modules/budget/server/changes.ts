/**
 * 变更单服务层（M9-a，仿 finance/server/records.ts 范式）。
 *
 * 跨模块读走 core/db prisma 直读，不 import 其他模块内部（AGENTS §2）。
 * 口径全走 core/domain/ledger.ts（changeTotal）与 budget/changes.ts（守卫）——
 * 页面/服务里不得出现第二处算式（TASK_M9 §3-2）。
 *
 * 范围红线（§3-4）：只写 ChangeOrder 表；不碰付款计划、不写台账、不写任何其他模块表。
 * 单用户无角色、录入即生效——不做审批流、不做变更单号、不做附件。
 * 硬删——单用户无回收站，同 M8-b finance record 范式。
 */
import prisma from "@/core/db";
import {
  CHANGE_KIND,
  CHANGE_KIND_LABEL,
  isChangeKind,
  isValidAmountForKind,
  type ChangeKind,
} from "../changes";
import { getBudgetUser } from "../currentUser";

/** 变更单业务错误：中文文案直达 UI（仿 FinanceRecordError）。 */
export class ChangeOrderError extends Error {}

/** 变更单视图行（供 /budget/[projectId]/changes 直接渲染）。 */
export interface ChangeOrderRow {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  amount: number;
  date: Date;
  note: string;
  createdByName: string | null;
  status: string;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  confirmNote: string;
  rejectReason: string | null;
  attachments: { id: string; originalName: string; storageKey: string; size: number }[];
}

/** 新建/编辑变更单的公共入参（全字段覆盖式编辑）。 */
export interface ChangeInput {
  kind: string;
  title: string;
  amount: number;
  dateIso: string;
  note?: string;
}

/**
 * 校验纯输入（开事务前）：kind 合法 / title 去空白必填 / amount 有限且按方向守卫 /
 * date 可解析 / note 去空白可空。返回可直接落库的归一化字段。
 * 错误文案照 §3-4（中文直达 UI）。
 */
function validateChangeInput(input: ChangeInput): {
  kind: ChangeKind;
  title: string;
  amount: number;
  date: Date;
  note: string;
} {
  if (!isChangeKind(input.kind)) {
    throw new ChangeOrderError(`未知变更类型：${input.kind}`);
  }
  const kind = input.kind as ChangeKind;

  const title = (input.title ?? "").trim();
  if (!title) {
    throw new ChangeOrderError("变更描述不能为空");
  }

  // amount 有限 + 按方向守卫
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) {
    throw new ChangeOrderError("变更金额需为数字");
  }
  if (amount === 0) {
    throw new ChangeOrderError("变更金额不能为 0");
  }
  if (!isValidAmountForKind(kind, amount)) {
    // 按方向给出更精准的文案
    if (kind === CHANGE_KIND.deduct) {
      throw new ChangeOrderError("减项金额应为负数");
    }
    if (kind === CHANGE_KIND.add) {
      throw new ChangeOrderError("增项金额应为正数");
    }
    // upgrade / process 走到这里说明 amount===0，已被上面拦掉，不会到这
    throw new ChangeOrderError("变更金额不能为 0");
  }

  // dateIso 可解析为有效日期
  const d = new Date(input.dateIso);
  if (isNaN(d.getTime())) {
    throw new ChangeOrderError("日期格式非法");
  }

  const note = (input.note ?? "").trim();

  return { kind, title, amount, date: d, note };
}

/**
 * 列变更单（视图模型）。
 * - 按 date 倒序、同日 createdAt 倒序（最近的变更在前）。
 * - join quote→project 链路锁定项目：返回该项目唯一报价单下的全部变更。
 * - createdBy → name（无 @relation，按 userId 批量取名字）。
 */
export async function listChanges(
  projectId: string
): Promise<ChangeOrderRow[]> {
  // 经 projectId 找 quoteId（一项目一报价，M1a 约束）
  const quote = await prisma.budgetQuote.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!quote) return [];

  const rows = await prisma.changeOrder.findMany({
    where: { quoteId: quote.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const assets = await prisma.fileAsset.findMany({ where: { ownerType: "change_order", ownerId: { in: rows.map((r) => r.id) } }, orderBy: { createdAt: "asc" } });
  const assetsByOwner = new Map<string, typeof assets>();
  for (const a of assets) assetsByOwner.set(a.ownerId, [...(assetsByOwner.get(a.ownerId) ?? []), a]);

  const userIds = Array.from(
    new Set(rows.map((r) => r.createdBy).filter((v): v is string => v !== null))
  );
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
  const userNameById = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: CHANGE_KIND_LABEL[r.kind as ChangeKind] ?? r.kind,
    title: r.title,
    amount: r.amount,
    date: r.date,
    note: r.note,
    createdByName: r.createdBy ? userNameById.get(r.createdBy) ?? null : null,
    status: r.status,
    submittedAt: r.submittedAt,
    confirmedAt: r.confirmedAt,
    confirmNote: r.confirmNote,
    rejectReason: r.rejectReason,
    attachments: (assetsByOwner.get(r.id) ?? []).map((a) => ({ id: a.id, originalName: a.originalName, storageKey: a.storageKey, size: a.size })),
  }));
}

/**
 * 新建变更单。
 * 守卫（纯输入校验在开事务前，存在性校验在事务内，仿 createRecord/createIssue）：
 * - kind ∈ CHANGE_KIND（「未知变更类型：X」）
 * - title 去空白必填（「变更描述不能为空」）
 * - amount 有限且按方向守卫（「减项金额应为负数」/「增项金额应为正数」/「变更金额不能为 0」）
 * - dateIso 可解析（「日期格式非法」）
 * - 占位录入人 getBudgetUser()，null → 「未找到录入人，请先运行 seed 初始化用户」
 * - note 去空白、可空（存 ""）
 * 事务内：经 projectId 查 BudgetQuote（一项目一报价）；不存在 → 「未找到报价单，请先在报价编辑器保存」。
 * 写 createdBy=占位用户 id。
 */
export async function createChange(
  projectId: string,
  input: ChangeInput
): Promise<{ id: string }> {
  const { kind, title, amount, date, note } = validateChangeInput(input);

  const me = await getBudgetUser();
  if (!me) {
    throw new ChangeOrderError("未找到录入人，请先运行 seed 初始化用户");
  }

  return prisma.$transaction(async (tx) => {
    const quote = await tx.budgetQuote.findUnique({
      where: { projectId },
      select: { id: true, status: true },
    });
    if (!quote) {
      throw new ChangeOrderError("未找到报价单，请先在报价编辑器保存");
    }

    const created = await tx.changeOrder.create({
      data: {
        quoteId: quote.id,
        kind,
        title,
        amount,
        date,
        note,
        createdBy: me.id,
      },
      select: { id: true },
    });
    return { id: created.id };
  });
}

/**
 * 编辑变更单（全字段覆盖式编辑）。
 * 守卫同 createChange；额外：id 不存在 → 「变更单不存在」。
 * 不改 createdBy（保留原录入人=创建者）；updatedAt 由 @updatedAt 自动。
 * projectId 用于二次校验归属（防止跨项目改）：变更单 quoteId 必须属于该 projectId。
 */
export async function updateChange(
  changeId: string,
  projectId: string,
  input: ChangeInput
): Promise<void> {
  const { kind, title, amount, date, note } = validateChangeInput(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.changeOrder.findUnique({
      where: { id: changeId },
      select: { id: true, quoteId: true, status: true },
    });
    if (!existing) throw new ChangeOrderError("变更单不存在");
    if (existing.status === "client_confirmed") throw new ChangeOrderError("客户已确认的变更不能直接编辑");

    // 归属校验：quoteId 必须指向该 projectId 的报价单
    const quote = await tx.budgetQuote.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (!quote || quote.id !== existing.quoteId) {
      throw new ChangeOrderError("变更单不存在");
    }

    await tx.changeOrder.update({
      where: { id: changeId },
      data: {
        kind,
        title,
        amount,
        date,
        note,
        // createdBy 保留原值（不改录入人）
      },
    });
  });
}

export async function setChangeStatus(changeId: string, status: "pending" | "client_confirmed" | "rejected", note = "") {
  const me = await getBudgetUser();
  if (!me) throw new ChangeOrderError("未找到操作人，请先运行 seed 初始化用户");
  const row = await prisma.changeOrder.findUnique({ where: { id: changeId } });
  if (!row) throw new ChangeOrderError("变更单不存在");
  if (status === "pending" && row.status !== "draft" && row.status !== "rejected") throw new ChangeOrderError("当前状态不能提交确认");
  if (status === "client_confirmed" && row.status !== "pending") throw new ChangeOrderError("只有待确认的变更才能确认");
  if (status === "rejected" && row.status !== "pending") throw new ChangeOrderError("只有待确认的变更才能驳回");
  return prisma.changeOrder.update({ where: { id: changeId }, data: status === "pending" ? { status, submittedAt: new Date(), submittedBy: me.id, rejectReason: null } : status === "client_confirmed" ? { status, confirmedAt: new Date(), confirmedBy: me.id, confirmNote: note.trim(), rejectReason: null } : { status, rejectReason: note.trim() || "客户未确认" } });
}

/**
 * 删除变更单（硬删——单用户无回收站，TASK §4-M9-a）。
 * id 不存在 → 「变更单不存在」。删除不需要 getBudgetUser。
 * 不做归属校验：changeId 唯一且经 actions bind projectId 路径进来，
 * 跨项目删需先 listChanges 看到才点得到，无现实风险。
 */
export async function deleteChange(changeId: string): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.changeOrder.findUnique({
      where: { id: changeId },
      select: { id: true, status: true },
    });
    if (!existing) throw new ChangeOrderError("变更单不存在");
    if (existing.status === "client_confirmed") throw new ChangeOrderError("客户已确认的变更不能删除");

    await tx.changeOrder.delete({ where: { id: changeId } });
  });
}
