/**
 * operationLog.ts —— 操作流水唯一写入口（M10-a 备料二 · core 平台原语）
 *
 * 一句话：回答“这个数是谁、什么时候、从什么改成了什么”。
 *
 * 三条硬纪律（对应 schema 里 OperationLog 的注释，改动前先读那段）：
 * ① **best-effort**：记流水失败绝不把业务写入带下水——内部 try/catch 全包，异常转 telemetry。
 *    业务返回值与抛错语义与本模块完全无关。
 * ② **唯一入口**：全仓只有这里 insert。模块与页面一律经 `recordOperation()` 埋点，
 *    不得 `prisma.operationLog.create()` 自行写——埋点散开必然漏，漏了就等于没有。
 * ③ **写人话**：summary/before/after 是给业务同事读的中文，不是给程序解析的 JSON。
 *    要结构化就加列，别往文本里塞花括号。
 *
 * 不做的事（守住 §3 红线：不过度设计）：不是审批流、不是回收站、不做字段级 diff、
 * 不做权限过滤（P4 接登录后再谈谁能看）。归档/作废的账本位在这里，实体状态在各自表上。
 */

import prisma from "@/core/db";
import { USER_ROLE } from "@/core/domain/types";
import { logAppError } from "@/core/domain/telemetry";
import { headers } from "next/headers";
import { GATE_USER_HEADER, readGateUser } from "@/core/domain/accessGate";

/** 无登录态时的兜底操作人（P4 接登录后由 session 取代，本行随之失效）。 */
export const FALLBACK_ACTOR = "user-local";

/**
 * 内测期真人识别（M13-c 最小访问保护）：反代 basic auth 通过后注入
 * X-Platform-User，这里按 User.name 匹配到真实账号，让流水第一次能回答“是谁改的”。
 *
 * 信任链见 core/domain/accessGate.ts 顶部注释——应用只绑回环，该头由 Caddy 覆盖式注入。
 * 拿不到头、或 next/headers 在非请求上下文抛错（集成门禁走 tsx、构建期静态生成）
 * 一律返回 null 落回占位口径，因此**旧行为逐字不变**；P4 接真登录后整段换成 session。
 */
async function resolveGateActor(): Promise<{ id: string; name: string } | null> {
  try {
    const hdrs = await headers();
    const name = readGateUser(hdrs.get(GATE_USER_HEADER));
    if (!name) return null;
    return await prisma.user.findFirst({
      where: { name },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
  } catch {
    // best-effort：身份解析受损不该波及流水，更不该波及业务
    return null;
  }
}

export interface OperationInput {
  /** 机器名，建议 `域.动作`：quote.save / record.create / plan.markPaid / lead.sign / node.review / project.archive */
  action: string;
  /** 实体类型：project / quote / financeRecord / paymentNode / lead / node / issue / fieldDef / schedule / settings */
  entity: string;
  entityId?: string | null;
  projectId?: string | null;
  /** 中文一句话，业务同事看得懂 */
  summary: string;
  before?: string | null;
  after?: string | null;
  /** 失败的写操作同样留档（例如被守卫挡下），此时传 error */
  error?: string | null;
  /** 覆盖默认操作人（例如以某角色视角代录）；一般不传 */
  actor?: { id: string; name: string } | null;
}

/**
 * 取操作人，三级优先：反代认证过的真人 → 占位 boss → 占位任意用户 → 兜底常量。
 * 前两级是 M13-c 加的；后两级是 P4 之前的既有口径（接登录 session 后两处一并删）。
 */
export async function resolveActor(): Promise<{ id: string; name: string }> {
  const gated = await resolveGateActor();
  if (gated) return gated;
  try {
    const select = { id: true, name: true } as const;
    const boss = await prisma.user.findFirst({
      where: { role: USER_ROLE.boss },
      orderBy: { createdAt: "asc" },
      select,
    });
    if (boss) return boss;
    const any = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select });
    if (any) return any;
  } catch (e) {
    logAppError("[resolveActor]", e);
  }
  return { id: FALLBACK_ACTOR, name: "本机用户" };
}

/**
 * 记一条操作流水。**永不抛错、永不返回失败**——业务代码可以放心 await 它。
 * 返回 true/false 仅供测试断言用，不作为业务分支依据。
 */
export async function recordOperation(input: OperationInput): Promise<boolean> {
  try {
    const actor = input.actor ?? (await resolveActor());
    await prisma.operationLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        projectId: input.projectId ?? null,
        summary: String(input.summary ?? "").slice(0, 500) || "(无摘要)",
        before: input.before ? String(input.before).slice(0, 500) : null,
        after: input.after ? String(input.after).slice(0, 500) : null,
        actor: actor.id,
        actorName: actor.name,
        error: input.error ? String(input.error).slice(0, 500) : null,
      },
    });
    return true;
  } catch (e) {
    // 流水写失败 = 观测能力受损，不是业务失败：留现场后安静返回。
    logAppError("[recordOperation]", e, {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
    });
    return false;
  }
}

export interface ListOperationFilter {
  projectId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  limit?: number;
}

/** 读流水（倒序）。页面与项目档案用；不鉴权（P4 再谈可见范围）。 */
export async function listOperations(filter: ListOperationFilter = {}) {
  const take = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const rows = await prisma.operationLog.findMany({
    where: {
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    },
    orderBy: { at: "desc" },
    take,
    select: {
      id: true,
      at: true,
      action: true,
      entity: true,
      entityId: true,
      projectId: true,
      summary: true,
      before: true,
      after: true,
      actor: true,
      actorName: true,
      error: true,
    },
  });
  return rows;
}

/* ── 摘要拼装小工具：让埋点处不写字符串拼接细节，口径统一 ───────── */

/** 金额转“¥1,234.56”文本（流水里存文本，不做数值比较）。 */
export function moneyText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return "¥" + Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** “字段：旧 → 新”一行；只拼真变了的项，全没变返回“（无字段变化）”。 */
export function diffText(pairs: Array<[label: string, before: unknown, after: unknown]>): string {
  const changed = pairs.filter(([, b, a]) => String(b ?? "") !== String(a ?? ""));
  if (!changed.length) return "（无字段变化）";
  return changed.map(([l, b, a]) => `${l}：${fmtVal(b)} → ${fmtVal(a)}`).join("；");
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "空";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}
