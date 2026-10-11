import Link from "next/link";
import { listCatalog } from "@/modules/budget/server/catalog";
import { CatalogEditor } from "./CatalogEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "科目库" };

/**
 * 科目库管理：工程科目与科目项模板的增删改与排序。
 * 服务端取数，编辑交互交给 CatalogEditor（客户端组件）。
 * 报价明细是模板的快照，改这里不回溯已生成的报价。
 */
export default async function CatalogPage() {
  const catalog = await listCatalog();

  return (
    <div className="space-y-8">
      <header className="border-b border-line pb-5">
        <h1 className="text-[20px] font-semibold">科目库</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary">
          维护工程科目与科目项模板：编号、单位、默认单价、材料与施工要求在此定稿，报价时选入即快照。
          修改模板不会影响已生成的报价明细。
        </p>
        <p className="mt-2 text-xs text-muted">
          <Link href="/budget" className="underline-offset-4 hover:text-accent-ink hover:underline">
            返回预算报价
          </Link>
        </p>
      </header>

      <CatalogEditor catalog={catalog} />
    </div>
  );
}
