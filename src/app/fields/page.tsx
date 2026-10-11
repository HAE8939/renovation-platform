import { listDefs } from "@/core/domain/customFieldRepo";
import { FieldsAdmin } from "./FieldsAdmin";

/**
 * 自定义字段定义管理（M9-c）。server component 取数，交互面在 FieldsAdmin（client）。
 * 含停用定义（includeInactive），并带每个定义已填值数——停用不丢历史值，这里要看得见。
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "自定义字段" };

export default async function FieldsPage() {
  const defs = await listDefs({ includeInactive: true, includeValueCount: true });

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-[28px] font-semibold leading-[1.3]">自定义字段</h1>
        <p className="mt-2 text-xs text-secondary">
          全司共享的项目扩展属性 · 五种类型（单行文本 / 多行文本 / 数字 / 日期 / 单选）·
          停用只隐藏录入与筛选，历史值原样保留
        </p>
      </section>

      <FieldsAdmin defs={defs} />
    </div>
  );
}
