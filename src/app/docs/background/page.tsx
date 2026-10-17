import { DocsPage, DocsSection, Prose, Muted, PointList, Note } from "../ui";

export default function DocsBackground() {
  return (
    <DocsPage
      eyebrow="平台说明 · 建设背景"
      title="要解决的是五处管理损耗"
      lead="装修经营的管理难度不在单点专业度，而在信息跨环节传递时持续失真。公司在手项目几十个，每个项目要穿甲方、房屋、设计、预算、施工、验收、收付款七类信息，一旦分散在不同载体上，就会固定产生五类损耗。"
    >
      <DocsSection title="五类固定损耗">
        <PointList
          items={[
            { term: "工期失控，且业主不透明", desc: "排期在设计师和项目经理各自的表里，工序先后靠人记。哪道工序晚了、会不会顶到合同完工日，通常等到延期已成事实才被发现。" },
            { term: "质量无据可查，纠纷举证难", desc: "验收结论往往是口头或微信里的一句「过了」。事后争议时，拿不出「哪天、按哪些检查项、由谁验收、当时现场什么样子」的成串证据。" },
            { term: "预算跑偏，成本黑箱", desc: "报价、变更、实际支出是三张分离的表。变更做了多少、是否顶穿合同额、还剩多少毛利，要有人月底手工拼一次，且口径每次都不太一样。" },
            { term: "人效低下，绩效无数据支撑", desc: "谁在做几个项目、承担什么责任、返修率高不高，全凭印象。" },
            { term: "线索流失，商务管理混乱", desc: "谈过的客户散落在销售的微信里，跟进断没断、报价了没、报完价签没签，公司层看不到。" },
          ]}
        />
      </DocsSection>

      <DocsSection title="平台的推进逻辑" desc="这五点是立项文档里的原始问题清单，不是事后总结。因此推进逻辑也很明确：">
        <Prose>
          <p>先修通「客户线索 → 项目 → 签约」这条主脊，随即投入执行链（设计 → 工程 → 质量）去治工期与质量失控，财务与绩效随后接上——而不是先做一个漂亮的数据大屏。</p>
        </Prose>
      </DocsSection>

      <DocsSection title="从表格到系统：一个更具体的由来">
        <Prose>
          <p>本平台的第一版并不是代码，而是一套无代码平台搭出来的多维表格原型。它把业务字段和表单跑通了，随后撞到四堵墙：</p>
        </Prose>
        <div className="mt-4">
          <PointList
            items={[
              { term: "公式列性能", desc: "计算性能随数据量下降。" },
              { term: "公开视图附件", desc: "公开视图不支持附件。" },
              { term: "外部登录", desc: "外部人员无法登录。" },
              { term: "自动打印", desc: "没有可用的自动打印能力。" },
            ]}
          />
        </div>
        <div className="mt-6">
          <Note tone="accent">
            这四堵墙得出了一个对项目边界很重要的结论：<strong className="font-medium text-primary">能填表和能管理是两件事</strong>，
            「资料」和「系统」之间差的正是跨表联动、口径一致与证据留存。自 2026-10-09 起，平台按这份蓝图重建为真实应用。
          </Note>
        </div>
      </DocsSection>
    </DocsPage>
  );
}
