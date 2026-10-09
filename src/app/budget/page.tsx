import Link from "next/link";
import { Badge, Card, Table, Td, Th } from "@/core/ui";
import { PROJECT_STATUS_LABEL } from "@/core/domain/types";
import type { ProjectStatus } from "@/core/domain/types";
import {
  listProjects,
  suggestProjectCode,
} from "@/core/domain/projects";
import { formatQty } from "@/modules/budget/lib/quote";
import { CreateProjectForm } from "./CreateProjectForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "装修预算报价" };

const STATUS_BADGE: Record<ProjectStatus, "neutral" | "accent" | "success" | "outline"> = {
  draft: "outline",
  design: "accent",
  in_progress: "accent",
  acceptance: "neutral",
  completed: "success",
  archived: "neutral",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function BudgetListPage() {
  const [projects, suggestedCode] = await Promise.all([listProjects(), suggestProjectCode()]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[22px] font-semibold">装修预算报价</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary">
          按工程科目编制报价明细，实时汇总直接费、税金与单方造价。项目与报价挂在主数据
          Project 下，后续的设计与项目管理模块沿用同一套客户与项目。
        </p>
      </header>

      <CreateProjectForm suggestedCode={suggestedCode} />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">项目列表</h2>
          <span className="text-xs text-secondary">共 {projects.length} 个</span>
        </div>

        {projects.length === 0 ? (
          <Card className="mt-3 py-10 text-center text-sm text-secondary">
            还没有项目，先用上面的表单创建一个。
          </Card>
        ) : (
          <Card padded={false} className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>编号</Th>
                  <Th>项目名称</Th>
                  <Th>客户</Th>
                  <Th align="right">面积</Th>
                  <Th>状态</Th>
                  <Th align="right">报价条目</Th>
                  <Th align="right">最近更新</Th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="group hover:bg-canvas">
                    <Td className="num text-xs text-secondary">{p.code}</Td>
                    <Td className="font-medium">
                      <Link
                        href={`/budget/${p.id}`}
                        className="text-primary underline-offset-4 hover:text-accent-ink hover:underline"
                      >
                        {p.name}
                      </Link>
                    </Td>
                    <Td className="text-secondary">{p.clientName}</Td>
                    <Td align="right" className="num text-secondary">
                      {formatQty(p.area)}
                    </Td>
                    <Td>
                      <Badge variant={STATUS_BADGE[p.status as ProjectStatus] ?? "neutral"}>
                        {PROJECT_STATUS_LABEL[p.status as ProjectStatus] ?? p.status}
                      </Badge>
                    </Td>
                    <Td align="right" className="num">
                      {p.itemCount}
                    </Td>
                    <Td align="right" className="text-xs text-secondary">
                      {formatDate(p.updatedAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
