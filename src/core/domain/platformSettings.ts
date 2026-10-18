import prisma from "@/core/db";
import { DEFAULT_THEME, isThemeKey, normalizeThemeKey, type ThemeKey } from "./theme";

/**
 * 平台设置读写（M9-d）—— prisma 服务，只碰 PlatformSetting 单例。
 *
 * 落 `core/domain`：主题是外壳（layout）级的全局事实，Logo 是品牌区的展示事实，
 * 二者都不属于任何业务模块（AGENTS §2“主数据/平台能力归 core”）。业务模块不 import 这里，
 * 只有外壳与 /settings 平台页用。
 *
 * 单用户免登录 → 全平台一行（固定 id "platform"）。get 时缺行即建（首次访问自动补齐），
 * 不必依赖 seed。所有对外读出的 themeKey 一律过 normalizeThemeKey，脏值/未知键回落默认，
 * 保证外壳永远只渲染四套已验证过对比度的插槽之一。
 */

const SINGLETON_ID = "platform";

export interface PlatformSettings {
  themeKey: ThemeKey;
  logoFile: string | null;
}

/** 取平台设置（缺行自动建默认；themeKey 已归一为合法插槽）。 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSetting.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, themeKey: DEFAULT_THEME },
    select: { themeKey: true, logoFile: true },
  });
  return { themeKey: normalizeThemeKey(row.themeKey), logoFile: row.logoFile ?? null };
}

/**
 * 改主题：只认四套插槽键（isThemeKey）。非法键抛中文错——设置页正常提交不会走到，
 * 这是“不在设置页开取色器、绝不落自由色值”这条红线的服务端闸门。
 */
export async function setThemeKey(key: unknown): Promise<ThemeKey> {
  if (!isThemeKey(key)) {
    throw new Error("未知的主题：请选择四套内置配色之一");
  }
  await prisma.platformSetting.upsert({
    where: { id: SINGLETON_ID },
    update: { themeKey: key },
    create: { id: SINGLETON_ID, themeKey: key },
  });
  return key;
}

/** 记录 Logo 文件名（文件本体由 core/domain/branding 落盘/清理，这里只存事实）。 */
export async function setLogoFile(filename: string): Promise<void> {
  await prisma.platformSetting.upsert({
    where: { id: SINGLETON_ID },
    update: { logoFile: filename },
    create: { id: SINGLETON_ID, themeKey: DEFAULT_THEME, logoFile: filename },
  });
}

/** 清除 Logo 引用（返回被清除的文件名，供调用方删盘上旧文件）。 */
export async function clearLogoFileRef(): Promise<string | null> {
  const row = await prisma.platformSetting.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, themeKey: DEFAULT_THEME },
    select: { logoFile: true },
  });
  await prisma.platformSetting.update({ where: { id: SINGLETON_ID }, data: { logoFile: null } });
  return row.logoFile ?? null;
}
