import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/core/ui";
import { getPanoTourById } from "@/modules/pano/server/tours";
import { PanoFrame } from "./PanoFrame";

/**
 * 单条导览的承载页（M15-a）。
 *
 * 为什么用 iframe 而不是把导览搬进平台页面：导览包是 MT-Pano 编辑器的**构建产物**
 * （index.html + app.js + style.css + marzipano.js + tiles/…，几百个文件），
 * 它自带品牌主题与运行时，搬进来等于把别人的构建产物纳入本仓的编译与视觉约束，
 * 每次重新导出都要重来一遍。整包挂在 /uploads/pano/<目录>/ 下、由这里包一层平台外壳，
 * 才是既能跟着平台导航走、又不互相污染的形状。
 *
 * 外壳给的是平台该有的东西：返回路径、项目上下文、状态提示（已下架/项目已归档/文件不在），
 * 这些都不是导览自己能说清的。
 */
export const dynamic = "force-dynamic";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const tour = await getPanoTourById(params.id);
  return { title: tour ? tour.title : "全景导览" };
}

export default async function PanoViewerPage({ params }: { params: { id: string } }) {
  const tour = await getPanoTourById(params.id);
  if (!tour) notFound();

  const notes: string[] = [];
  if (!tour.entryUrl) notes.push("目录命名不被支持，无法拼出可访问的地址。请在服务器上改用合规目录名后重新登记。");
  if (tour.hiddenReason) notes.push(`这条导览当前${tour.hiddenReason}，只从登记管理或项目详情进入才能看到。`);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">
              PANORAMA
            </p>
            <h1 className="mt-3 max-w-3xl text-[28px] font-semibold leading-[1.3]">{tour.title}</h1>
            <p className="mt-4 text-[13px] leading-relaxed text-secondary">
              {tour.projectCode ? (
                <Link href={`/projects/${tour.projectId}`} className="text-accent-ink hover:underline">
                  {tour.projectCode} · {tour.projectName}
                </Link>
              ) : (
                <span className="text-muted">未关联项目</span>
              )}
              {tour.clientName ? ` · ${tour.clientName}` : ""}
              <span className="mx-2 text-muted">/</span>
              <Link href="/pano" className="text-accent-ink hover:underline">
                返回项目归纳
              </Link>
            </p>
          </div>
          <Badge variant={tour.status === "published" ? "success" : "neutral"}>{tour.statusLabel}</Badge>
        </div>
      </header>

      {notes.map((n) => (
        <div
          key={n}
          className="max-w-3xl border-l-[3px] border-warning bg-surface px-6 py-3 text-[13px] leading-relaxed text-secondary"
        >
          {n}
        </div>
      ))}

      {tour.entryUrl ? (
        <PanoFrame src={tour.entryUrl} title={tour.title} />
      ) : (
        <div className="rounded-card border border-line bg-surface px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-primary">这条导览暂时打不开</p>
          <p className="mt-2 text-[13px] text-secondary">请核对磁盘上的目录与入口文件，或重新登记一次。</p>
        </div>
      )}

      <dl className="divide-y divide-line border-y border-line">
        {[
          ["磁盘目录", `public/uploads/pano/${tour.dirName}`],
          ["场景数", tour.sceneCount > 0 ? `${tour.sceneCount} 个` : "未记录（托管版导出包里没有 project.json）"],
          ["封面", tour.coverUrl ? "取自导览包第一幕的 preview.jpg" : "导览包未提供可用封面"],
          ["登记时间", formatDate(tour.createdAt)],
          ["最近更新", formatDate(tour.updatedAt)],
          ...(tour.note ? [["备注", tour.note]] : []),
        ].map(([term, desc]) => (
          <div key={term} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,144px)_minmax(0,1fr)]">
            <dt className="text-[13px] text-muted">{term}</dt>
            <dd className="break-all text-[13px] leading-relaxed text-secondary">{desc}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
