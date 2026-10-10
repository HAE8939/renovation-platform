import { notFound } from "next/navigation";
import { PROJECT_STATUS_LABEL } from "@/core/domain/types";
import { Th, Td } from "@/core/ui";
import { getProjectArchive } from "@/modules/quality/server/archive";
import { buildTimeline } from "@/modules/quality/timeline";
import { PrintButton } from "./PrintButton";
import "./print.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "质量档案打印" };

interface PageProps {
  params: { projectId: string };
}

/** 仅日期（区间用）。 */
function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** 日期时间：YYYY/MM/DD HH:mm（与时间轴页同一格式）。 */
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dt = new Date(d);
  return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(
    dt.getDate()
  )} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** 封面字段：标签（次字、不折行）+ 值（主字、中字重）。 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="whitespace-nowrap text-[13px] text-secondary">{label}</span>
      <span className="text-[15px] font-medium text-primary">{value}</span>
    </div>
  );
}

/**
 * A4 打印视图（M7-d）：独立 Server Component，仿 budget print 抄结构换内容。
 * 取数走 server/archive（不跨模块引 budget 组件）；事件组装走 timeline 纯函数。
 * print 页不放导航——屏幕态沿用外壳，打印态由 print.css 的 @media print 隐藏
 * aside/header/nav/footer（与 budget print 同一做法）。
 */
export default async function QualityArchivePrintPage({ params }: PageProps) {
  const archive = await getProjectArchive(params.projectId);
  if (!archive) notFound();

  const events = buildTimeline(archive.nodes, archive.issues);
  const { project, summary } = archive;
  const endDate = project.actualEndDate ?? new Date();
  const range = `${formatDate(project.startDate)} → ${formatDate(endDate)}`;
  const statusLabel =
    PROJECT_STATUS_LABEL[
      project.status as keyof typeof PROJECT_STATUS_LABEL
    ] ?? project.status;
  const generatedAt = new Date();

  return (
    <div className="print-sheet">
      <PrintButton />

      {/* 表头 */}
      <section className="mb-6">
        <h1 className="mb-6 text-[28px] font-semibold leading-snug text-primary">
          装修经营管理数字化平台 / 质量档案
        </h1>
        <div className="grid grid-cols-2 gap-x-12 gap-y-4">
          <Field label="项目名称" value={project.name} />
          <Field label="项目编号" value={project.code} />
          <Field label="项目状态" value={statusLabel} />
          <Field label="区间" value={range} />
        </div>
      </section>

      {/* 摘要行 */}
      <section className="mb-6">
        <h2 className="mb-4 text-[20px] font-semibold text-primary">档案摘要</h2>
        <p className="text-[15px] text-secondary">
          节点 <span className="num text-primary">{summary.totalNodes}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          通过 <span className="num text-primary">{summary.passedNodes}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          问题 <span className="num text-primary">{summary.totalIssues}</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          未关闭{" "}
          <span className="num text-primary">{summary.openIssues}</span>
        </p>
      </section>

      {/* 时间轴明细列表 */}
      <section className="mb-6">
        <h2 className="mb-4 text-[20px] font-semibold text-primary">
          质量事件时间轴
        </h2>
        {events.length === 0 ? (
          <p className="text-[15px] text-secondary">暂无质量记录</p>
        ) : (
          <table className="w-full border-collapse detail-table">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "48%" }} />
            </colgroup>
            <thead>
              <tr>
                <Th className="whitespace-nowrap">日期</Th>
                <Th className="whitespace-nowrap">事件</Th>
                <Th>说明</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.key}>
                  <Td className="num whitespace-nowrap">{formatDateTime(e.date)}</Td>
                  <Td className="whitespace-nowrap">{e.label}</Td>
                  <Td className="text-[13px] text-secondary whitespace-pre-line">
                    {e.sub ?? "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 页脚 */}
      <footer className="border-t border-line pt-4">
        <p className="text-[13px] text-secondary">
          生成时间：{formatDateTime(generatedAt)}
          <span className="mx-2" aria-hidden>
            ·
          </span>
          本档案由系统生成
        </p>
      </footer>
    </div>
  );
}
