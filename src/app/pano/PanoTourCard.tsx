import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/core/ui";
import type { PanoTourView } from "@/modules/pano/server/tours";

/**
 * 归纳页的导览卡片。整卡是一个链接（点哪儿都进导览），因此**卡内不放任何按钮**——
 * HTML 不允许在 <a> 里嵌表单，嵌了也会串成跳转（AGENTS §4.3 同一条纪律）。
 * 需要操作（上下架/排序/编辑）一律去登记管理页的表格里做。
 */

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function PanoTourCard({ tour, badge }: { tour: PanoTourView; badge?: ReactNode }) {
  const projectLine = tour.projectCode
    ? `${tour.projectCode} · ${tour.projectName ?? ""}${tour.clientName ? ` · ${tour.clientName}` : ""}`
    : "未关联项目";

  // 目录名过不了安全判据时不拼链接：宁可不给入口，也不给一个可能越界的地址。
  if (!tour.entryUrl) {
    return (
      <li>
        <div className="rounded-card border border-line bg-surface">
          <div className="flex aspect-[2/1] items-center justify-center rounded-t-card border-b border-line bg-sunken">
            <span className="text-[13px] text-muted">封面不可用</span>
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[15px] font-semibold leading-snug">{tour.title}</span>
              <Badge variant="danger">路径不受支持</Badge>
            </div>
            <p className="mt-2 truncate text-[13px] text-secondary">{projectLine}</p>
            <p className="mt-2 text-[13px] text-muted">
              目录「{tour.dirName}」的命名不被支持，请在服务器上改用不含路径分隔符的目录名后重新登记。
            </p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/pano/${tour.id}`}
        className="group block rounded-card border border-line bg-surface transition-colors hover:border-accent"
      >
        <div className="aspect-[2/1] overflow-hidden rounded-t-card border-b border-line bg-sunken">
          {tour.coverUrl ? (
            // 刻意用原生 <img>：内网 standalone 无 sharp，next/image 的服务端优化会在生产报错
            // （同 PlatformShell 的 Logo 口径）。封面由导览包自带 preview.jpg 取得，尺寸不可预知，
            // 交给容器按 2:1 裁切。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tour.coverUrl}
              alt=""
              aria-hidden
              width={800}
              height={400}
              className="h-full w-full object-cover transition-transform duration-[240ms] group-hover:brightness-95"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-[13px] text-muted">该导览未提供封面</span>
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-semibold leading-snug transition-colors group-hover:text-accent-ink">
              {tour.title}
            </span>
            {badge}
          </div>
          <p className="mt-2 truncate text-[13px] text-secondary">{projectLine}</p>
          <p className="num mt-2 text-[13px] text-muted">
            {tour.sceneCount > 0 ? `${tour.sceneCount} 个场景` : "场景数未记录"} · 更新于{" "}
            {formatDate(tour.updatedAt)}
          </p>
        </div>
      </Link>
    </li>
  );
}
