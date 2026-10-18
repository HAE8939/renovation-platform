/**
 * 全景模块 · Server Actions（M15-a）
 *
 * 埋点纪律（AGENTS §4.4）：流水只在**动作层**记，服务函数里不记——服务函数将来可能被
 * 塞进事务，记流水失败会把业务写入一起滚掉。
 * 状态类操作只在状态真的变化时写流水（§4.3 M13 教训：一条“从已上架到已上架”的记录
 * 会把依赖流水的排查与恢复引到错方向）。
 * before / after 只承载**机器值**（status 原文、目录名），变化的人话一律进 summary。
 */
"use server";

import { revalidatePath } from "next/cache";
import { logAppError } from "@/core/domain/telemetry";
import { recordOperation } from "@/core/domain/operationLog";
import { PANO_STATUS, isPanoStatus } from "./types";
import {
  PanoError,
  movePanoTour,
  registerPanoTour,
  setPanoTourStatus,
  unregisterPanoTour,
  updatePanoTourProfile,
} from "./server/tours";

export interface PanoFormState {
  error?: string;
  ok?: boolean;
}

export interface PanoActionResult {
  error?: string;
}

/**
 * 一处收口：同一条导览同时出现在归纳页、管理页与项目详情的“全景导览”页签上，
 * 只刷一个的话，另外两处会停在旧数据上——这种不一致最难查。
 */
function revalidatePanoViews(projectId?: string | null): void {
  revalidatePath("/pano");
  revalidatePath("/pano/manage");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function panoFailure(tag: string, e: unknown, fallback: string): PanoFormState {
  if (e instanceof PanoError) return { error: e.message };
  logAppError(tag, e);
  return { error: fallback };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** 场景数的人话：0 不当成“没有场景”，而是“没记录”——托管版导出里没有 project.json。 */
function sceneLabel(n: number): string {
  return n > 0 ? `${n} 个场景` : "场景数未记录";
}

export async function registerPanoTourAction(
  _prev: PanoFormState,
  formData: FormData
): Promise<PanoFormState> {
  try {
    const dirName = text(formData, "dirName");
    if (!dirName) return { error: "请选择要登记的导览目录" };
    const projectId = text(formData, "projectId") || null;
    const view = await registerPanoTour({
      dirName,
      projectId,
      title: text(formData, "title") || null,
      note: text(formData, "note") || null,
    });
    await recordOperation({
      action: "pano.register",
      entity: "panoTour",
      entityId: view.id,
      projectId: view.projectId,
      summary: `登记全景导览“${view.title}”（目录 ${view.dirName}，${sceneLabel(view.sceneCount)}${
        view.projectCode ? `，挂在 ${view.projectCode} ${view.projectName ?? ""}` : "，未关联项目"
      }）`,
      after: view.dirName,
    });
    revalidatePanoViews(view.projectId);
    return { ok: true };
  } catch (e) {
    return panoFailure("[registerPanoTourAction]", e, "登记失败，请稍后重试");
  }
}

export async function updatePanoTourAction(
  _prev: PanoFormState,
  formData: FormData
): Promise<PanoFormState> {
  try {
    const id = text(formData, "id");
    if (!id) return { error: "缺少导览标识，请刷新页面后重试" };
    const projectIdRaw = formData.get("projectId");
    // 表单里“未关联”项的值是空串，与“这次没提交该字段”要分开：null=不动，""=解除关联。
    const projectId = projectIdRaw === null ? undefined : String(projectIdRaw).trim() || null;
    const sceneCountRaw = text(formData, "sceneCount");
    const { view, beforeTitle } = await updatePanoTourProfile(id, {
      title: text(formData, "title") || undefined,
      note: formData.get("note") === null ? undefined : text(formData, "note"),
      projectId,
      sceneCount: sceneCountRaw === "" ? undefined : Number(sceneCountRaw),
    });
    await recordOperation({
      action: "pano.update",
      entity: "panoTour",
      entityId: view.id,
      projectId: view.projectId,
      summary: `修改全景导览“${view.title}”（原“${beforeTitle}”，目录 ${view.dirName}${
        view.projectCode ? `，现挂在 ${view.projectCode}` : "，现为未关联项目"
      }）`,
      after: view.dirName,
    });
    revalidatePanoViews(view.projectId);
    return { ok: true };
  } catch (e) {
    return panoFailure("[updatePanoTourAction]", e, "保存失败，请稍后重试");
  }
}

/** 上架 / 下架。状态没变时不写流水，也不报错——幂等。 */
export async function setPanoTourStatusAction(formData: FormData): Promise<PanoActionResult> {
  const id = text(formData, "id");
  const status = text(formData, "status");
  try {
    if (!id || !isPanoStatus(status)) return { error: "参数不完整，请刷新页面后重试" };
    const { view, noop } = await setPanoTourStatus(id, status);
    if (!noop) {
      const publishing = status === PANO_STATUS.published;
      await recordOperation({
        action: publishing ? "pano.publish" : "pano.unpublish",
        entity: "panoTour",
        entityId: view.id,
        projectId: view.projectId,
        summary: `${publishing ? "上架" : "下架"}全景导览“${view.title}”（目录 ${view.dirName}${
          publishing ? "，已出现在项目归纳页" : "，已从项目归纳页撤下，文件保留"
        }）`,
        before: publishing ? PANO_STATUS.hidden : PANO_STATUS.published,
        after: status,
      });
    }
    revalidatePanoViews(view.projectId);
    return {};
  } catch (e) {
    if (e instanceof PanoError) return { error: e.message };
    logAppError("[setPanoTourStatusAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

export async function movePanoTourAction(formData: FormData): Promise<PanoActionResult> {
  const id = text(formData, "id");
  const direction = text(formData, "direction");
  try {
    if (!id || (direction !== "up" && direction !== "down")) {
      return { error: "参数不完整，请刷新页面后重试" };
    }
    const { view, noop } = await movePanoTour(id, direction);
    if (!noop) {
      await recordOperation({
        action: "pano.move",
        entity: "panoTour",
        entityId: view.id,
        projectId: view.projectId,
        summary: `调整全景导览“${view.title}”的展示次序（${direction === "up" ? "上移" : "下移"}一位）`,
        after: String(view.order),
      });
    }
    revalidatePanoViews(view.projectId);
    return {};
  } catch (e) {
    if (e instanceof PanoError) return { error: e.message };
    logAppError("[movePanoTourAction]", e);
    return { error: "操作失败，请稍后重试" };
  }
}

/**
 * 解除登记。**只摘库里的登记，磁盘目录与文件一个字节都不动**（§4.3 不硬删业务数据）。
 * 因此流水的措辞必须写清“文件保留”，否则日后看流水的人会以为成品被删了。
 */
export async function unregisterPanoTourAction(
  _prev: PanoFormState,
  formData: FormData
): Promise<PanoFormState> {
  const id = text(formData, "id");
  try {
    if (!id) return { error: "缺少导览标识，请刷新页面后重试" };
    const { view } = await unregisterPanoTour(id);
    await recordOperation({
      action: "pano.unregister",
      entity: "panoTour",
      entityId: view.id,
      projectId: view.projectId,
      summary: `解除全景导览“${view.title}”的登记（目录 ${view.dirName} 的文件保留在磁盘上，重新扫描即可再次登记）`,
      before: view.dirName,
    });
    revalidatePanoViews(view.projectId);
    return { ok: true };
  } catch (e) {
    return panoFailure("[unregisterPanoTourAction]", e, "操作失败，请稍后重试");
  }
}
