import Link from "next/link";
import { Card, Table, Th, Td } from "@/core/ui";
import { getArchiveIndex } from "@/modules/quality/server/archive";

export const dynamic = "force-dynamic";
export const metadata = { title: "质量档案" };

/**
 * 质量档案索引页（M7-d，TASK_M7 §4-M7-d）。
 * 每项目一行：项目 / 编号 / 节点（通过 x · 未通过 y，分母 0 显“—”）/
 * 未关闭问题（0 显“—”）/ “打开档案 →”。
 * 空态诚实文案（无项目时不造假）。读前 syncAcceptanceNodes 兜底自愈。
 */
export default async function QualityArchivePage() {
  const projects = await getArchiveIndex();
  const total = projects.length;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href="/quality"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回质量管控
        </Link>
        <div className="mt-3">
          <h1 className="text-[28px] font-semibold">质量档案</h1>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
            按项目汇总验收节点与质量问题，提供全事件时间轴与 A4 打印导出。
          </p>
        </div>
      </header>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">项目档案</h2>
          <span className="text-[13px] text-secondary whitespace-nowrap">
            共 {total} 个项目
          </span>
        </div>

        {total === 0 ? (
          /* 诚实空态：无非归档项目时不造假 */
          <div className="mt-3 rounded-card border border-line bg-surface px-8 py-12 text-center">
            <p className="text-[15px] font-medium text-primary">暂无项目档案</p>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              非归档项目将在此列出，提供节点与质量问题的全事件时间轴与打印档案。
            </p>
          </div>
        ) : (
          <Card padded={false} className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>项目</Th>
                  <Th>编号</Th>
                  <Th>节点</Th>
                  <Th align="right">未关闭问题</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const unpassed = p.totalNodes - p.passedNodes;
                  const nodeLabel =
                    p.totalNodes === 0
                      ? "—"
                      : `通过 ${p.passedNodes} · 未通过 ${unpassed}`;
                  const issueLabel =
                    p.openIssues === 0 ? "—" : String(p.openIssues);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-canvas"
                    >
                      <Td>
                        <Link
                          href={`/quality/archive/${p.id}`}
                          className="font-medium text-primary hover:text-accent-ink"
                          title={p.name}
                        >
                          {p.name}
                        </Link>
                      </Td>
                      <Td className="num text-secondary whitespace-nowrap">
                        {p.code}
                      </Td>
                      <Td
                        className={`num whitespace-nowrap ${
                          unpassed > 0
                            ? "text-warning font-medium"
                            : "text-secondary"
                        }`}
                      >
                        {nodeLabel}
                      </Td>
                      <Td
                        align="right"
                        className={`num whitespace-nowrap ${
                          p.openIssues > 0
                            ? "text-danger font-medium"
                            : "text-secondary"
                        }`}
                      >
                        {issueLabel}
                      </Td>
                      <Td>
                        <Link
                          href={`/quality/archive/${p.id}`}
                          className="whitespace-nowrap text-accent-ink transition-colors hover:underline"
                        >
                          打开档案 →
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
