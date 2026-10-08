import Link from "next/link";
import { Badge } from "@/core/ui";
import { PLATFORM } from "@/core/platform";
import { deferredModules, modules } from "@/modules/registry";

export const metadata = { title: "平台首页" };

/**
 * 平台首页：已注册模块入口 + DEFERRED 占位卡。
 * 两个区块都从 registry 取数，不写死模块名。
 * 版式走"编辑式索引"而非等宽卡片网格 —— 避免千篇一律的圆角大卡片堆叠。
 */
export default function HomePage() {
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
                    {m.icon && <span className="num text-sm text-accent-ink">{m.icon}</span>}
                    <span className="transition-colors duration-150 group-hover:text-accent-ink">
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
                  className="num pt-0.5 text-sm text-muted transition-colors duration-150 group-hover:text-accent-ink"
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
