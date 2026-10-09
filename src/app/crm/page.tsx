import { listLeads } from "@/modules/crm/server/leads";
import { NewLeadForm } from "./NewLeadForm";
import { LeadsTable } from "./LeadDrawer";
import { LeadBoard } from "./LeadBoard";
import { ViewToggle } from "./ViewToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "商务线索" };

type ViewMode = "board" | "list";

export default async function CrmListPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const leads = await listLeads();
  const view: ViewMode = searchParams?.view === "list" ? "list" : "board";

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">商务线索</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              从线索录入、跟进推进到签约建项的商务全链路。点击任意线索卡片可打开详情抽屉，
              查看基础信息、跟进时间线与添加跟进；超 3 天未跟进的线索在「最后跟进」标红提示。
            </p>
          </div>
          <ViewToggle view={view} />
        </div>
      </header>

      <NewLeadForm />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">
            {view === "board" ? "线索看板" : "线索列表"}
          </h2>
          <span className="text-[13px] text-secondary">共 {leads.length} 条</span>
        </div>

        {leads.length === 0 ? (
          <p className="mt-3 text-[15px] text-secondary">还没有线索，先用上面的表单创建一条。</p>
        ) : view === "board" ? (
          <LeadBoard leads={leads} />
        ) : (
          <LeadsTable leads={leads} />
        )}
      </section>
    </div>
  );
}
