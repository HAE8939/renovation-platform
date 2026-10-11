import { brandingUrl } from "@/core/domain/branding";
import { getPlatformSettings } from "@/core/domain/platformSettings";
import { SettingsPanels } from "./SettingsPanels";

/**
 * 平台设置（M9-d）：主题切换 + 品牌 Logo。server component 取数，交互在 SettingsPanels（client）。
 *
 * 它是**平台工具页、不是业务模块**：不进 registry、不出现在侧栏导航与首页卡片，
 * 唯一入口是顶栏「设置」链（决策 7「顶栏入口」）。这样「可插拔业务模块」与「平台自身配置」
 * 两条线不混——侧栏永远只列功能区。
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "平台设置" };

export default async function SettingsPage() {
  const { themeKey, logoFile } = await getPlatformSettings();
  const logoUrl = brandingUrl(logoFile);

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[28px] font-semibold leading-[1.3]">平台设置</h1>
        <p className="mt-2 text-xs text-secondary">
          强调色主题与品牌标识 · 改动全站生效 · 单用户免登录（P4 接入登录后归管理员）
        </p>
      </section>

      <SettingsPanels themeKey={themeKey} logoFile={logoFile} logoUrl={logoUrl} />
    </div>
  );
}
