import Link from "next/link";
import { Badge, Card, Table, Td, Th } from "@/core/ui";
import { listProjects } from "@/core/domain/projects";
import { reconcilePanoRoot } from "@/modules/pano/server/tours";
import { formatBytes } from "@/modules/pano/server/scan";
import { PANO_STATUS } from "@/modules/pano/types";
import { RegisterForm } from "./RegisterForm";
import { RescanButton } from "./RescanButton";
import { TourRowActions } from "./TourRowActions";

/**
 * 登记管理（M15-a）——全景模块唯一的工作台，也是排障现场。
 *
 * 这里刻意把「磁盘」和「库里」两边都摆出来、并分出四堆，而不是只给一张漂亮的登记表：
 *   ① 未登记的目录 —— 放进来但还没挂上项目，最容易漏；
 *   ② 已登记且磁盘在 —— 正常态，给全部管理动作；
 *   ③ 库里有但磁盘找不到 —— 一定是出过事（目录被移走/改名/挂卷没挂上），
 *      这一堆若不说，界面上只会表现为“点进去 404”，没人知道为什么；
 *   ④ 磁盘上有但打不开 —— 多半只放了 zip 没解压，这是新同学最常踩的一步。
 * 只报②③ 会给人“扫描很聪明”的错觉，四堆都在，人才敢信这个页面。
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "全景登记管理" };

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function PanoManagePage() {
  const [recon, projects] = await Promise.all([reconcilePanoRoot(), listProjects()]);
  const projectOptions = projects.map((p) => ({
    id: p.id,
    label: `${p.code} ${p.name}${p.status === "archived" ? "（已归档）" : ""}`,
  }));
  const dirOptions = recon.unregistered.map((d) => ({
    value: d.dirName,
    label: `${d.meta.titleFromPack || d.dirName}（${d.meta.sceneCount > 0 ? `${d.meta.sceneCount} 景` : "场景数未记录"}）`,
  }));
  const registered = [...recon.matched.map((m) => m.view), ...recon.missingOnDisk];

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">
              PANORAMA REGISTRY
            </p>
            <h1 className="mt-3 text-[28px] font-semibold leading-[1.3]">登记管理</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-[1.85] text-secondary">
              把本地全景编辑器导出的整个目录放进服务器上的
              <code className="mx-1 break-all rounded-inner bg-sunken px-2 py-1 font-mono text-[13px]">
                {recon.root}
              </code>
              ，回到这里登记并挂到项目上。放完记得重新扫描一次。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/pano"
              className="inline-flex h-9 items-center rounded-inner border border-line bg-surface px-3 text-sm text-secondary whitespace-nowrap transition-colors hover:bg-sunken hover:text-primary"
            >
              项目归纳页
            </Link>
            <RescanButton />
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["已登记", String(registered.length), "库里的导览条数"],
          ["未登记", String(recon.unregistered.length), "磁盘有目录、库里没有"],
          ["打不开", String(recon.broken.length), "缺入口文件或目录名不合规"],
          ["磁盘占用", formatBytes(recon.diskBytes), "uploads/pano 下全部导览"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-card border border-line bg-surface px-4 py-4">
            <p className="text-[13px] text-secondary">{label}</p>
            <p className="num mt-2 text-[20px] font-semibold leading-none">{value}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{note}</p>
          </div>
        ))}
      </div>

      {!recon.rootExists && (
        <div className="rounded-card border border-line border-l-[3px] border-warning bg-surface px-6 py-4">
          <p className="text-[15px] font-medium text-primary">全景目录还不存在</p>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-secondary">
            服务器上的 <code className="break-all font-mono text-[13px]">{recon.root}</code>{" "}
            还没有创建或还没有挂进容器。放第一个导览之前，请确认部署时的 uploads 挂卷已经生效
            （compose 与 NAS 部署脚本都把 <code className="font-mono text-[13px]">/app/public/uploads</code>{" "}
            挂在卷上，容器重建不丢文件）。{recon.rootError ? `现场提示：${recon.rootError}` : ""}
          </p>
        </div>
      )}

      {recon.missingOnDisk.length > 0 && (
        <section className="border-t border-line pt-8">
          <h2 className="text-[15px] font-semibold">库里有登记，但磁盘上找不到</h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-secondary">
            这些不会出现在项目归纳页（避免点进去是坏的）。要么是目录被改名或移走，要么是挂卷没挂上。
            把目录放回原位并重新扫描即可恢复；确认不再需要，就到下面解除登记（解除登记不会删文件）。
          </p>
          <ul className="mt-4 space-y-2">
            {recon.missingOnDisk.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
              >
                <span className="text-[13px] text-primary">
                  {t.title}
                  <span className="num ml-2 text-muted">uploads/pano/{t.dirName}</span>
                </span>
                <Badge variant="danger">文件不在</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recon.broken.length > 0 && (
        <section className="border-t border-line pt-8">
          <h2 className="text-[15px] font-semibold">磁盘上有目录，但打不开</h2>
          <ul className="mt-4 space-y-2">
            {recon.broken.map((d) => (
              <li
                key={d.dirName}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
              >
                <span className="min-w-0 text-[13px] text-primary">
                  <code className="break-all font-mono text-[13px]">{d.dirName}</code>
                  <span className="ml-2 text-secondary">{d.problem}</span>
                </span>
                <span className="num text-[13px] text-muted">
                  {d.fileCount} 个文件 · {formatBytes(d.totalBytes)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-line pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold">待登记</h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            {recon.unregistered.length === 0
              ? "磁盘上没有未登记的导览目录"
              : `发现 ${recon.unregistered.length} 个新目录`}
          </span>
        </div>

        {recon.unregistered.length > 0 && (
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>目录</Th>
                <Th>包内标题</Th>
                <Th align="right">场景</Th>
                <Th align="right">体积</Th>
                <Th align="right">导出时间</Th>
              </tr>
            </thead>
            <tbody>
              {recon.unregistered.map((d) => (
                <tr key={d.dirName}>
                  <Td className="font-mono text-[13px] break-all">{d.dirName}</Td>
                  <Td className="text-[13px]">{d.meta.titleFromPack ?? "包里没写"}</Td>
                  <Td align="right" className="num text-[13px]">
                    {d.meta.sceneCount > 0 ? d.meta.sceneCount : "—"}
                  </Td>
                  <Td align="right" className="num text-[13px]">
                    {formatBytes(d.totalBytes)}
                  </Td>
                  <Td align="right" className="num text-[13px]">
                    {formatDate(d.packedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <Card className="mt-6">
          <h3 className="text-[15px] font-semibold">登记一条导览</h3>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-secondary">
            标题留空时自动取导览包里写的标题，再取不到就用目录名。可以先不选项目，
            但那样它会归到归纳页的“未关联项目”里，项目详情页看不到。
          </p>
          <div className="mt-4">
            <RegisterForm
              dirs={dirOptions}
              projects={projectOptions}
              dirsEmpty={recon.unregistered.length === 0}
            />
          </div>
        </Card>
      </section>

      <section className="border-t border-line pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold">已登记的导览</h2>
          <span className="num text-[13px] text-secondary">
            {String(registered.length).padStart(2, "0")} 条
          </span>
        </div>

        {registered.length === 0 ? (
          <p className="mt-4 text-[13px] text-secondary">还没有登记任何导览。</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {registered.map((t) => (
              <li
                key={t.id}
                className="rounded-card border border-line bg-surface px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={t.entryUrl ? `/pano/${t.id}` : "#"}
                        className="text-[15px] font-medium text-primary hover:text-accent-ink"
                      >
                        {t.title}
                      </Link>
                      <Badge variant={t.status === PANO_STATUS.published ? "success" : "neutral"}>
                        {t.statusLabel}
                      </Badge>
                      {t.hiddenReason && <Badge variant="outline">{t.hiddenReason}</Badge>}
                    </div>
                    <p className="mt-2 text-[13px] text-secondary">
                      {t.projectCode ? `${t.projectCode} · ${t.projectName}` : "未关联项目"}
                      <span className="num mx-2 text-muted">/</span>
                      {t.sceneCount > 0 ? `${t.sceneCount} 个场景` : "场景数未记录"}
                      <span className="num mx-2 text-muted">/</span>
                      次序 {t.order + 1}
                    </p>
                    <p className="num mt-2 break-all font-mono text-[12px] text-muted">
                      uploads/pano/{t.dirName}
                    </p>
                    {t.note && (
                      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-secondary">{t.note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.coverUrl ? (
                      // 刻意用原生 <img>：与归纳页同一口径（内网 standalone 无 sharp）。
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.coverUrl}
                        alt=""
                        aria-hidden
                        width={120}
                        height={60}
                        className="h-[60px] w-[120px] rounded-inner border border-line bg-sunken object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-[60px] w-[120px] items-center justify-center rounded-inner border border-line bg-sunken text-[12px] text-muted">
                        无封面
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <TourRowActions tour={t} projects={projectOptions} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="border-t border-line pt-4 text-[13px] leading-relaxed text-secondary">
        口径说明：下架与解除登记都**不会删除磁盘文件**（AGENTS §4.3 不硬删业务数据）；
        下架只是从项目归纳页撤下，解除登记只是摘掉库里这一行，重新扫描就又能登记回来。
        归属项目被归档的导览同样不进归纳页。要真正腾出磁盘空间，需在服务器上人工删除目录。
      </p>
    </div>
  );
}
