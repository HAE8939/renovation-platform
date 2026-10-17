import Link from "next/link";
import { DocsPage, DocsSection, Prose, Muted, PointList, DocsTable, Note } from "./ui";

export default function DocsOverview() {
  return (
    <DocsPage
      eyebrow="平台说明 · 总览"
      title="装修经营全流程数字化管理平台"
      hero={{
        src: "/docs-overview-hero.jpg",
        alt: "住宅剖面线稿与装修图纸的插画：米纸底、细墨线、钴蓝单点色",
        width: 2138,
        height: 735,
      }}
      lead="面向中小型装修公司经营全流程的模块化单体平台：一个代码仓库、一套平台外壳、一份共享主数据、九个可插拔功能区。它替代的不是某个软件，而是「Excel 报价单 + 微信群里的现场照片 + 口头汇报的进度 + 月底对不上的账」这套组合。"
    >
      <DocsSection title="主脊链路" desc="平台的主脊已经打通并真实联动，一次签约即驱动后续全链：">
        <Prose>
          <p className="leading-relaxed">
            线索 → 签约建项 → 设计 → 报价与变更 → 工序排程 → 验收与整改 → 回款 → 经营看板。
          </p>
        </Prose>
        <Muted>这条链路不是概念图，而是同一事务与同一口径下逐段联动出来的，详见「业务闭环」一节。</Muted>
      </DocsSection>

      <DocsSection title="六条核心设计取向" desc="这几点决定了平台的性格，也是最值得先读的部分：">
        <PointList
          items={[
            { term: "模块化单体", desc: "新增能力长成平台里的一个功能区，共享同一份登录、主数据与视觉语言，不另起系统再拼门户。不做微前端、不做多系统拼门户。" },
            { term: "口径单点", desc: "全公司关于钱的算法只存在于一处纯函数文件，被独立预言机在整数分维度反复复算校验，消灭「两个页面同一个指标对不上」。" },
            { term: "派生值不落库", desc: "进度、风险灯、付款段解锁状态都由原始数据实时算出。少存一处，就少一处会腐烂的地方。" },
            { term: "钱按事实 · 事按可见性", desc: "归档不改变已发生的事实（收付、毛利、现金线含归档项目照算）；前瞻类（待收、待办、风险）排除归档。两族口径不同是有意为之，相关页面会自己把差异说出来。" },
            { term: "算不出就写算不出", desc: "面积未录则单方造价不显示；支出未录则毛利率降级为「不可算」而不给 100%。宁可缺一格，不造一个数。" },
            { term: "核心账籍无硬删除", desc: "报价、收支台账、验收节点只有归档与恢复，误操作可逆。" },
          ]}
        />
      </DocsSection>

      <DocsSection title="平台速览" desc="被问到「这是什么规模的东西」时，用这些事实回答：">
        <DocsTable
          numCols={[1]}
          head={["项", "数值", "说明"]}
          rows={[
            ["功能区", "9 个", "驾驶舱 / 线索 / 项目 / 设计 / 排程 / 质量 / 预算 / 财务 / 人员工控"],
            ["业务实体 / 迁移", "28 个 / 12 条", "每条迁移只加列或加表，历史数据零破坏"],
            ["验证脚本", "16 个", "11 纯函数门禁 + 5 隔离库集成门禁"],
            ["无头交互验收", "12 套件", "真实点击 → 落库 → 回读三方对账"],
            ["技术栈", "Next.js + Prisma + SQLite", "schema 保持可移植，便于一步迁 PostgreSQL"],
            ["视觉系统", "HAE Creator Design System V0.3", "纸感底、单点强调色、气声描边、默认无阴影"],
          ]}
        />
      </DocsSection>

      <DocsSection title="当前形态与边界" desc="一条在所有对外材料里都应保留的事实：">
        <Note tone="warning">
          当前形态是 <strong className="font-medium text-primary">免登录单用户内测</strong>，部署在公司内网 / NAS 的 Docker 环境，
          仅内网可达、未开放公网——不是多员工并发的生产环境。数据表与 11 个业务角色常量已预留，
          但权限收敛排在登录批次，现阶段「角色」是数据字段与看板视角，<strong className="font-medium text-primary">不是安全边界</strong>。
        </Note>
      </DocsSection>

      <DocsSection title="怎么读这套文档">
        <Prose>
          <p>
            第一次上手或教同事用平台，从
            <Link href="/docs/quickstart" className="mx-1 text-accent-ink hover:underline">快速上手</Link>与
            <Link href="/docs/manual" className="mx-1 text-accent-ink hover:underline">模块操作手册</Link>开始——前者按一单生意的时间顺序走主线，后者按模块查操作与边界。
            想了解平台解决什么问题看
            <Link href="/docs/background" className="mx-1 text-accent-ink hover:underline">建设背景</Link>；
            关心技术与质量看
            <Link href="/docs/architecture" className="mx-1 text-accent-ink hover:underline">整体架构</Link>；
            想看具体能力看
            <Link href="/docs/modules" className="mx-1 text-accent-ink hover:underline">功能模块</Link> 与
            <Link href="/docs/flow" className="mx-1 text-accent-ink hover:underline">业务闭环</Link>；
            被追问局限时，
            <Link href="/docs/notes" className="mx-1 text-accent-ink hover:underline">事实与边界</Link> 一节可直接照答。
          </p>
          <Muted>本文档所有能力描述以仓库当前代码为准（M1–M15 已合入并通过构建、类型、迁移与种子回归），未实现的能力一律不写成已有功能。</Muted>
        </Prose>
      </DocsSection>
    </DocsPage>
  );
}
