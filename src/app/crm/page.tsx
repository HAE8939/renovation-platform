import Link from "next/link";
import { Badge, Card, Table, Td, Th } from "@/core/ui";
import {
  nextStage,
  listLeads,
  LEAD_STAGE_ORDER,
  LEAD_STAGE_LABEL,
  type LeadStage,
} from "@/modules/crm/server/leads";
import { advanceStageAction } from "@/modules/crm/actions";
import { NewLeadForm } from "./NewLeadForm";
import { SignLeadButton } from "./SignLeadModal";

/** 阶段到达「已报价」及之后（且尚未签约建项）可发起签约。 */
const QUOTED_INDEX = LEAD_STAGE_ORDER.indexOf("quoted");
function canSign(stage: LeadStage): boolean {
  return LEAD_STAGE_ORDER.indexOf(stage) >= QUOTED_INDEX;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "商务线索" };

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

const STAGE_BADGE: Record<LeadStage, "neutral" | "accent" | "success" | "outline" | "warning"> = {
  leads: "outline",
  contacted: "neutral",
  confirmed: "accent",
  quoted: "accent",
  signed: "success",
};

/** 单行推进按钮（客户端调用 Server Action）。 */
async function AdvanceButton({
  leadId,
  stage,
  next,
}: {
  leadId: string;
  stage: LeadStage;
  next: LeadStage | null;
}) {
  if (!next) {
    return <span className="text-[13px] text-secondary">已到末态</span>;
  }
  return (
    <form action={advanceStageAction.bind(null, leadId, next)}>
      <button
        type="submit"
        className="inline-flex h-8 items-center justify-center rounded-inner border border-line bg-surface px-3 text-[13px] font-medium text-accent-ink whitespace-nowrap transition-colors hover:bg-accent-tint"
      >
        推进到「{LEAD_STAGE_LABEL[next]}」
      </button>
    </form>
  );
}

export default async function CrmListPage() {
  const leads = await listLeads();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold">商务线索</h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-secondary">
          从线索录入、跟进推进到签约建项的商务全链路。本页为线索列表，阶段推进先做按钮推进，
          看板与详情抽屉在后续单元实现。
        </p>
      </header>

      <NewLeadForm />

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">线索列表</h2>
          <span className="text-[13px] text-secondary">共 {leads.length} 条</span>
        </div>

        {leads.length === 0 ? (
          <Card className="mt-3 py-12 text-center text-[15px] text-secondary">
            还没有线索，先用上面的表单创建一条。
          </Card>
        ) : (
          <Card padded={false} className="mt-3">
            <Table>
              <thead>
                <tr>
                  <Th>编号</Th>
                  <Th>姓名</Th>
                  <Th>楼盘</Th>
                  <Th align="right">面积</Th>
                  <Th>阶段</Th>
                  <Th>负责人</Th>
                  <Th align="right">最后跟进</Th>
                  <Th align="right">推进</Th>
                  <Th align="right">签约 / 项目</Th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const next = nextStage(l.stage);
                  return (
                    <tr key={l.id} className="hover:bg-canvas">
                      <Td className="num text-[13px] text-secondary">{l.code}</Td>
                      <Td className="font-medium">{l.name}</Td>
                      <Td className="text-secondary">{l.estate ?? "—"}</Td>
                      <Td align="right" className="num text-secondary">
                        {l.area ? l.area.toFixed(1) : "—"}
                      </Td>
                      <Td>
                        <Badge variant={STAGE_BADGE[l.stage] ?? "neutral"}>
                          {LEAD_STAGE_LABEL[l.stage] ?? l.stage}
                        </Badge>
                      </Td>
                      <Td className="text-secondary">{l.assignee ?? "—"}</Td>
                      <Td align="right" className="text-[13px] text-secondary">
                        {formatDate(l.lastFollowAt)}
                      </Td>
                      <Td align="right">
                        <AdvanceButton leadId={l.id} stage={l.stage} next={next} />
                      </Td>
                      <Td align="right">
                        {l.projectId ? (
                          <Link
                            href={`/budget/${l.projectId}`}
                            className="text-[13px] font-medium text-accent-ink whitespace-nowrap hover:underline"
                          >
                            查看项目
                          </Link>
                        ) : canSign(l.stage) ? (
                          <SignLeadButton leadId={l.id} />
                        ) : (
                          <span className="text-[13px] text-secondary">—</span>
                        )}
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
