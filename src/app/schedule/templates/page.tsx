import Link from "next/link";
import { listTemplateMatrix } from "@/modules/schedule/server/templates";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "工序模板库" };

/**
 * 工序模板库（M6-d）：11 工序 × 3 面积档的标准工期，行级编辑保存。
 * 服务端取数，编辑交互交给 TemplateEditor（客户端组件）。
 * 新建项目排程按面积档自动套用本模板；修改天数不回溯已生成的排程
 * （排程生成即快照，改模板只影响之后新建的排程）。
 */
export default async function ScheduleTemplatesPage() {
  const matrix = await listTemplateMatrix();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/schedule"
          className="whitespace-nowrap text-[13px] text-secondary transition-colors hover:text-accent-ink"
        >
          ← 返回时间管控
        </Link>
      </div>

      <header className="border-b border-line pb-6">
        <h1 className="text-[28px] font-semibold leading-tight">工序模板库</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
          11 道标准工序在三个面积档（90㎡以下 / 90-130㎡ / 130㎡以上）下的标准工期。
          新建项目排程按面积档自动套用；修改天数不回溯已生成的排程（排程生成即快照）。
        </p>
      </header>

      <TemplateEditor matrix={matrix} />
    </div>
  );
}
