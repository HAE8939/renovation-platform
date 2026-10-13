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
    <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      {/* 左：定位 */}
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">
          M1a · 平台地基
        </p>
        <h1 className="mt-3 text-[28px] font-semibold leading-[1.3]">
          {PLATFORM.tagline}
        </h1>
        <p className="mt-4 max-w-prose text-[15px] leading-[1.85] text-secondary">
          一个仓库、可插拔模块的装修经营管理数字化平台。模块共享登录、主数据与视觉语言，
          每个功能都是平台里的一块功能区，而不是独立系统。
        </p>

        <dl className="mt-8 max-w-prose space-y-3 border-t border-line pt-6">
          <MetaRow label="形态" value="模块化单体，不做微前端" />
          <MetaRow label="数据" value="SQLite 起步，P5 迁 PostgreSQL" />
          <MetaRow label="预算口径" value="直接费 + 税金 = 总价，按面积算单方造价" />
        </dl>
      </section>

      {/* 右：模块索引 */}
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-secondary">
          已上线模块 · {modules.length}
        </p>
        <ul className="mt-4">
          {modules.map((m, i) => (
            <li key={m.id} className="border-t border-line">
              <Link
                href={m.entryPath}
                className="group flex items-start gap-4 py-5 last:border-b"
              >
                <span className="num pt-0.5 text-xs text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-base font-semibold leading-snug">
                    {/* M10-a UI-3：图标列去掉——原来是「舱/线/目/笔/期…」汉字与符号混排，
                        形态不统一反而添噪（HAE 2026-10-13 意见 3）。编号 + 名称已足够定位。 */}
                    <span className="transition-colors duration-[120ms] group-hover:text-accent-ink">
                      {m.name}
                    </span>
                  </span>
                  {m.description && (
                    <span className="mt-1 block text-sm leading-relaxed text-secondary">
                      {m.description}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className="num pt-0.5 text-sm text-muted transition-colors duration-[120ms] group-hover:text-accent-ink"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-secondary">
          规划中
        </p>
        <ul className="mt-4">
          {deferredModules.map((d) => (
            <li key={d.id} className="border-t border-line last:border-b">
              <div className="flex items-start gap-4 py-5" aria-disabled="true">
                <span className="pt-0.5 text-xs text-muted">—</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium leading-snug text-secondary">
                    {d.name}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">
                    {d.description}
                  </span>
                </span>
                <Badge variant="outline">即将上线</Badge>
              </div>
            </li>
          ))}
        </ul>
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
