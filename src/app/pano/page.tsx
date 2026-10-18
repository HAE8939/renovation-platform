import Link from "next/link";
import { Badge } from "@/core/ui";
import { listPanoToursForIndex, type PanoTourView } from "@/modules/pano/server/tours";
import { PanoTourCard } from "./PanoTourCard";

/**
 * 项目归纳页（M15-a）——全景模块的门面，也是给同事/客户演示时真正会被打开的那一页。
 *
 * 三处刻意的设计，都不是装饰：
 * ① **搜索用普通 GET 表单**，不写客户端组件：本仓红线是 DB 驱动、无 localStorage（§6.1），
 *    而搜索条件放进地址栏还能直接分享给同事；省一个组件也就少一处会漂移的状态。
 * ② **未关联项目的导览单独成组、照样列出**。它们在归纳页可见但没有项目上下文，
 *    若为了“干净”把它们藏起来，放文件的人会以为成品丢了（§4.3 同一条教训）。
 * ③ 页尾如实报“另有 N 条因下架/项目归档未列出”。沉默地少几个数字，比数字变小更糟。
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "全景管理" };

function matches(t: PanoTourView, needle: string): boolean {
  if (!needle) return true;
  const hay = [t.title, t.projectCode, t.projectName, t.clientName, t.dirName, t.note]
    .filter((v): v is string => !!v)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export default async function PanoIndexPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const needle = q.toLowerCase();
  const { visible, hiddenCount, archivedCount } = await listPanoToursForIndex();
  const hit = visible.filter((t) => matches(t, needle));
  const bound = hit.filter((t) => t.projectId);
  const unbound = hit.filter((t) => !t.projectId);
  const hiddenByFilter = q ? visible.length - hit.length : 0;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">
              PANORAMA INDEX
            </p>
            <h1 className="mt-3 max-w-3xl text-[28px] font-semibold leading-[1.3]">全景管理</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.85] text-secondary">
              已交付空间的 720° 全景导览，按项目归集。点任意一张卡片即可在浏览器里环视；
              导览本身在本地全景编辑器里制作，这里只管发布与浏览。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <form action="/pano" method="get" className="flex items-center gap-2">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="搜索标题、项目编号或客户"
                aria-label="搜索全景导览"
                className="h-9 w-64 rounded-inner border border-line bg-surface px-3 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="h-9 rounded-inner border border-line bg-surface px-3 text-sm text-secondary whitespace-nowrap transition-colors hover:bg-sunken hover:text-primary"
              >
                搜索
              </button>
            </form>
            <Link
              href="/pano/manage"
              className="h-9 inline-flex items-center rounded-inner border border-line bg-surface px-3 text-sm text-secondary whitespace-nowrap transition-colors hover:bg-sunken hover:text-primary"
            >
              登记管理
            </Link>
          </div>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary">还没有一条已上架的全景导览</p>
          <p className="mx-auto mt-2 max-w-3xl text-[13px] leading-relaxed text-secondary">
            先在本地全景编辑器里导出导览，把解压出来的整个目录放进服务器的{" "}
            <code className="rounded-inner bg-sunken px-2 py-1 font-mono text-[13px]">
              public/uploads/pano/
            </code>{" "}
            下，再到
            <Link href="/pano/manage" className="mx-1 text-accent-ink hover:underline">
              登记管理
            </Link>
            把它挂到对应项目上。
          </p>
        </div>
      ) : bound.length === 0 && unbound.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary">没有匹配“{q}”的导览</p>
          <p className="mt-2 text-[13px] text-secondary">
            换个关键词，或
            <Link href="/pano" className="mx-1 text-accent-ink hover:underline">
              清空搜索
            </Link>
            看全部。
          </p>
        </div>
      ) : (
        <>
          {bound.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-semibold">
                  {q ? `“${q}” 的结果` : "按项目浏览"}
                </h2>
                <span className="num whitespace-nowrap text-[13px] text-secondary">
                  {String(bound.length).padStart(2, "0")} 条
                </span>
              </div>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {bound.map((t) => (
                  <PanoTourCard key={t.id} tour={t} />
                ))}
              </ul>
            </section>
          )}

          {unbound.length > 0 && (
            <section className="border-t border-line pt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h2 className="text-[15px] font-semibold">未关联项目</h2>
                <span className="text-[13px] text-secondary whitespace-nowrap">
                  这些导览能打开，但在项目详情里看不到——
                  <Link href="/pano/manage" className="ml-1 text-accent-ink hover:underline">
                    去挂到项目上
                  </Link>
                </span>
              </div>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {unbound.map((t) => (
                  <PanoTourCard key={t.id} tour={t} badge={<Badge variant="warning">未关联项目</Badge>} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {(hiddenCount > 0 || archivedCount > 0 || hiddenByFilter > 0) && (
        <p className="border-t border-line pt-4 text-[13px] leading-relaxed text-secondary">
          {hiddenCount > 0 && `另有 ${hiddenCount} 条已下架，不在这里列出。`}
          {archivedCount > 0 && `另有 ${archivedCount} 条属于已归档项目——归档即经营事项已收场，故不进展示视野。`}
          {hiddenByFilter > 0 && `当前搜索另外过滤掉 ${hiddenByFilter} 条。`}
          <Link href="/pano/manage" className="ml-1 text-accent-ink hover:underline">
            全部登记与状态在“登记管理”
          </Link>
        </p>
      )}
    </div>
  );
}
