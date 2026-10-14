"use server";

/**
 * 项目归档 / 恢复动作（M10-a 备料三 · 误操作可纠正）。
 *
 * 定位：这是平台给「录错了 / 这单不做了」留的**唯一**纠正入口。归档只翻 status，
 * 报价、台账、验收节点、付款段、流水一律原样留着——所以它可逆，也不需要二次输入确认，
 * 一句「确认归档？」足够。真正的破坏性操作（删除字段、清空排程）另有各自的守卫。
 *
 * 路由层薄：校验与状态口径在 core/domain/projects.setProjectArchived，这里只搬运 + 写流水 + 刷缓存。
 */
import { revalidatePath } from "next/cache";
import { setProjectArchived } from "@/core/domain/projects";
import { recordOperation } from "@/core/domain/operationLog";
import { logAppError } from "@/core/domain/telemetry";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/core/domain/types";
import prisma from "@/core/db";

export interface ArchiveState {
  error?: string;
  ok?: boolean;
}

/** 归档（作废）项目。FormData: projectId。 */
export async function archiveProjectAction(
  _prev: ArchiveState,
  formData: FormData
): Promise<ArchiveState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { code: true, name: true, status: true },
    });
    const r = await setProjectArchived(projectId, true);
    if (!r) return { error: "项目不存在，请刷新页面后重试" };
    revalidateList();
    // 无变化就不写流水。这条流水同时承担「恢复到哪一态」的唯一依据，
    // 写进一条 before="archived" 的记录会把恢复目标污染成 archived（M13 体检 M-2）。
    if (!r.noop) {
      await recordOperation({
        action: "project.archive",
        entity: "project",
        entityId: projectId,
        projectId,
        summary: `归档项目「${project?.name ?? projectId}」（${project?.code ?? ""}）——未闭环事项已移出全司视野，已发生的收支与毛利照常统计，可随时恢复；归档前状态：${PROJECT_STATUS_LABEL[r.before as ProjectStatus] ?? r.before}`,
        // before 存**机器值**（不是中文标签）：恢复动作要拿它回写 status。
        // 中文态名放 summary 里给人看——两个用途不能挤在同一格，否则恢复时会拿到
        // 「施工中」去校验 isProjectStatus 而静默回落 draft（本轮 s9 实测撞出）。
        before: r.before,
        after: "archived",
      });
    }
    return { ok: true };
  } catch (e) {
    logAppError("[archiveProjectAction]", e, { projectId });
    return { error: "归档失败，请稍后重试" };
  }
}

/**
 * 恢复项目到归档前的状态。
 * 归档前状态从流水里回读（project.archive 那条的 before），不另存列——
 * 多存一列就要多维护一处一致性，而流水本来就是这件事的账本。
 */
export async function restoreProjectAction(
  _prev: ArchiveState,
  formData: FormData
): Promise<ArchiveState> {
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (!projectId) return { error: "缺少项目标识，请刷新页面后重试" };
  try {
    // 回读「最近一次真正改变了状态的归档流水」。排除 before="archived" 是防历史脏数据：
    // 修复前重复点归档会留下这样一条记录，若不排除，恢复目标就变成 archived——
    // isProjectStatus 校验合法、执行无变化、还向用户报成功（体检 M-2）。
    const lastArchive = await prisma.operationLog.findFirst({
      where: { projectId, action: "project.archive", NOT: { before: "archived" } },
      orderBy: { at: "desc" },
      select: { before: true },
    });
    const restoreTo = lastArchive?.before ?? "draft";
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { code: true, name: true },
    });
    const r = await setProjectArchived(projectId, false, restoreTo);
    if (!r) return { error: "项目不存在，请刷新页面后重试" };
    revalidateList();
    // 与归档侧对称：状态没变就不写流水（否则流水里出现一条"恢复了但什么都没发生"）。
    if (!r.noop) {
      await recordOperation({
        action: "project.restore",
        entity: "project",
        entityId: projectId,
        projectId,
        summary: `恢复项目「${project?.name ?? projectId}」（${project?.code ?? ""}）→ ${PROJECT_STATUS_LABEL[r.after as ProjectStatus] ?? r.after}`,
        before: "archived",
        after: r.after,
      });
    }
    return { ok: true };
  } catch (e) {
    logAppError("[restoreProjectAction]", e, { projectId });
    return { error: "恢复失败，请稍后重试" };
  }
}

/**
 * 归档位一变，全站口径都要重算。注意两族口径不同但**都必须重算**：
 * 前瞻类（驾驶舱待办与健康度、质量、排程、付款计划）把已归档摘出去；
 * 事实类（已收 / 支出 / 毛利 / 现金线）仍含它，但页面上的「归档参与说明」要跟着出现或消失。
 */
function revalidateList(): void {
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/finance/payments");
  revalidatePath("/quality");
  revalidatePath("/quality/issues");
  revalidatePath("/quality/archive");
  revalidatePath("/schedule");
  revalidatePath("/budget");
  revalidatePath("/", "layout");
}
