"use server";

import { revalidatePath } from "next/cache";
import {
  clearLogoFileRef,
  getPlatformSettings,
  setLogoFile,
  setThemeKey,
} from "@/core/domain/platformSettings";
import { removeLogoFile, saveLogoFile } from "@/core/domain/branding";
import { logAppError } from "@/core/domain/telemetry";

/**
 * 平台设置 Server Actions（M9-d）：主题切换 + Logo 最简版。
 * 路由层薄——校验口径在 core/domain（theme.ts 键名、branding.ts 类型/大小/命名），
 * 这里只搬运 FormData、调服务、清缓存。
 *
 * 主题与 Logo 都是外壳级事实（<html data-theme> + 侧栏品牌区），改完必须 revalidate 布局，
 * 才能让全站即时跟着换色/换标，而不只是本页刷新。
 */

export interface SettingsState {
  error?: string;
  ok?: boolean;
}

function revalidatePlatformSurfaces(): void {
  revalidatePath("/", "layout");
  revalidatePath("/settings");
}

export async function saveThemeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    await setThemeKey(formData.get("themeKey"));
    revalidatePlatformSurfaces();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error) return { error: e.message };
    logAppError("[saveThemeAction]", e);
    return { error: "保存失败，请稍后重试" };
  }
}

export async function uploadLogoAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const file = formData.get("file");
    const asFile = file instanceof File ? file : null;
    const { logoFile } = await getPlatformSettings();
    const saved = await saveLogoFile(asFile, logoFile);
    if ("error" in saved) return { error: saved.error };
    await setLogoFile(saved.filename);
    await removeLogoFile(saved.replaced); // 写库成功后清旧图（best-effort）
    revalidatePlatformSurfaces();
    return { ok: true };
  } catch (e) {
    logAppError("[uploadLogoAction]", e);
    return { error: "上传失败，请稍后重试" };
  }
}

export async function removeLogoAction(
  _prev?: SettingsState,
  _formData?: FormData,
): Promise<SettingsState> {
  try {
    const removed = await clearLogoFileRef();
    await removeLogoFile(removed);
    revalidatePlatformSurfaces();
    return { ok: true };
  } catch (e) {
    logAppError("[removeLogoAction]", e);
    return { error: "移除失败，请稍后重试" };
  }
}
