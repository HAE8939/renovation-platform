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
  searchParams: { view?: string; archived?: string };
}) {
  // M10-a 备料三：默认只看在用线索；?archived=1 切到“已作废”视图，用来恢复误作废的单子。
  const onlyArchived = searchParams?.archived === "1";
  const leads = await listLeads(onlyArchived ? { onlyArchived: true } : undefined);
  const view: ViewMode = searchParams?.view === "list" ? "list" : "board";

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold">商务线索</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
              从线索录入、跟进推进到签约建项的商务全链路。点击任意线索卡片可打开详情抽屉，
              查看基础信息、跟进时间线与添加跟进；超 3 天未跟进的线索在“最后跟进”标红提示。
            </p>
          </div>
          <ViewToggle view={view} />
        </div>
      </header>

      <NewLeadForm />

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold">
            {onlyArchived ? "已作废线索" : view === "board" ? "线索看板" : "线索列表"}
          </h2>
          <div className="flex items-baseline gap-4">
            <span className="text-[13px] text-secondary">共 {leads.length} 条</span>
            <a
              href={onlyArchived ? "/crm" : "/crm?view=list&archived=1"}
              className="text-[13px] text-accent-ink hover:underline underline-offset-4 whitespace-nowrap"
            >
              {onlyArchived ? "返回在用线索" : "查看已作废"}
            </a>
          </div>
        </div>

        {leads.length === 0 ? (
          <p className="mt-3 text-[15px] text-secondary">
            {onlyArchived
              ? "没有已作废的线索。作废一条后会出现在这里，可随时恢复。"
              : "还没有线索，先用上面的表单创建一条。"}
          </p>
        ) : view === "board" ? (
          <LeadBoard leads={leads} />
        ) : (
          <LeadsTable leads={leads} />
        )}
      </section>
    </div>
  );
}
