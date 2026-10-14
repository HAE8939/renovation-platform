import Link from "next/link";
import { Badge } from "@/core/ui";
import { PLATFORM } from "@/core/platform";
import { deferredModules, modules } from "@/modules/registry";
import { HeroSplash } from "./HeroSplash";

export const metadata = { title: "平台首页" };
// 外壳现在每次渲染读 PlatformSetting（主题/Logo，M9-d）；首页保持静态会把构建当时的插槽色
// 烘死、切主题后落地页不跟着变（违反「全站生效」）。转动态 → 与其它页一致，随库值现渲。
export const dynamic = "force-dynamic";

/**
 * 平台首页：已注册模块入口 + DEFERRED 占位卡。
 * 两个区块都从 registry 取数，不写死模块名。
 * 版式走"编辑式索引"而非等宽卡片网格 —— 避免千篇一律的圆角大卡片堆叠。
 */
export default function HomePage() {
  return (
    <>
      {/* 启动页首屏（M10-b · V0.3 成文例外，见 AGENTS §6.3）：fixed 覆盖层，滚轮/按钮/Esc 收起，
          收起后就是下面的模块索引原样——不改既有页面结构，零回归面。 */}
      <HeroSplash moduleNameCount={modules.length} />
      <ModuleIndex />
    </>
  );
}

function ModuleIndex() {
  return (
    <div>
      <header className="grid gap-8 border-b border-line pb-8 lg:grid-cols-[minmax(0,7fr)_minmax(280px,5fr)] lg:gap-16 lg:pb-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">
            平台工作台 · {modules.length} 个功能区
          </p>
          <h1 className="mt-3 max-w-3xl text-[28px] font-semibold leading-[1.3]">
            {PLATFORM.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-[1.85] text-secondary">
            从线索、报价到项目交付，所有经营信息在同一个工作台里衔接。选择一个功能区开始工作，
            也可以先进入数据驾驶舱查看当前全貌。
          </p>
        </div>
        <dl className="grid content-end gap-3 border-t border-line pt-6 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <MetaRow label="形态" value="模块化单体，共享项目主数据" />
          <MetaRow label="当前环境" value="SQLite · 内测先部署在公司 NAS" />
          <MetaRow label="正式部署" value="阿里云轻量服务器 + OSS" />
        </dl>
      </header>

      <section className="mt-8 lg:mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-secondary">现在可用</p>
            <h2 className="mt-2 text-[20px] font-semibold">选择一个工作入口</h2>
          </div>
          <span className="num text-[13px] text-muted">01 — {String(modules.length).padStart(2, "0")}</span>
        </div>
        <ul className="mt-6 grid gap-x-8 lg:grid-cols-2">
          {modules.map((m, i) => (
            <li key={m.id} className="border-t border-line">
              <Link href={m.entryPath} className="group flex min-h-28 items-start gap-4 py-6">
                <span className="num pt-1 text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold leading-snug transition-colors duration-[120ms] group-hover:text-accent-ink">
                    {m.name}
                  </span>
                  {m.description && (
                    <span className="mt-2 block max-w-md text-sm leading-relaxed text-secondary">
                      {m.description}
                    </span>
                  )}
                </span>
                <span aria-hidden className="num pt-1 text-sm text-muted transition-colors duration-[120ms] group-hover:text-accent-ink">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 grid gap-8 border-t border-line pt-8 lg:grid-cols-[minmax(0,7fr)_minmax(280px,5fr)] lg:gap-16">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-secondary">下一步</p>
          <h2 className="mt-2 text-[20px] font-semibold">正在建设的平台能力</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {deferredModules.map((d) => (
              <li key={d.id} className="flex items-start gap-4 py-4">
                <span className="pt-1 text-xs text-muted">—</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-secondary">{d.name}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{d.description}</span>
                </span>
                <Badge variant="outline">建设中</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-l-0 border-line lg:border-l lg:pl-6">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-secondary">平台说明</p>
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            这里是平台入口，不是另一个业务模块。业务页面进入后会恢复左侧模块导航；设置、通知和品牌配置属于平台工具，统一放在顶栏。
          </p>
          <Link href="/settings" className="mt-4 inline-block text-[13px] text-accent-ink hover:underline">
            打开平台设置 →
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <dt className="w-16 shrink-0 text-secondary">{label}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed">{value}</dd>
    </div>
  );
}
