import { DocsPage, DocsSection, Prose, Muted, PointList, DocsTable, Code, Note } from "../ui";

export default function DocsArchitecture() {
  return (
    <DocsPage
      eyebrow="平台说明 · 整体架构"
      title="分层、选型、数据模型与质量工程"
      lead="一个要被交付使用的管理系统，可信度来自架构约束与验证手段。这一节讲清平台怎么分层、为什么这么选、数据怎么组织、以及靠什么保证正确。"
    >
      <DocsSection title="分层结构">
        <DocsTable
          head={["层", "位置", "职责", "约束"]}
          rows={[
            ["路由层", "src/app/**", "页面渲染、参数解析、表单提交入口", "刻意做薄，不写业务逻辑"],
            ["模块层", "src/modules/<id>/", "单个功能区的业务逻辑与私有数据访问", "只经 core 与注册表协作，不互相 import 内部实现"],
            ["共享核心", "src/core/", "domain 主数据与全局口径 / ui 基础组件 / db 连接单例", "跨模块唯一通路"],
            ["数据层", "prisma/", "schema、迁移、演示数据", "schema 保持可移植，便于一步迁 PostgreSQL"],
          ]}
        />
        <div className="mt-6">
          <Muted>
            可插拔机制：每个功能区在自己目录下导出一个 <Code>ModuleManifest</Code>，<Code>src/modules/registry.ts</Code> 汇总成唯一清单，
            外壳侧栏与首页入口卡只读这张表。新增一个功能区 = 建一个目录 + 在清单里加一行。这条机制已被自定义字段、人员工控两次真实验证：外壳与首页代码零改动。
          </Muted>
        </div>
      </DocsSection>

      <DocsSection title="技术选型及理由">
        <PointList
          items={[
            { term: "Next.js（App Router）+ TypeScript 全栈", desc: "页面与 Server Action 同仓，避免前后端两套构建与一次额外网络跳转。" },
            { term: "Prisma + SQLite 起步", desc: "schema 保持可移植（禁用 PostgreSQL 专有类型、枚举用字符串常量），上多用户并发时一步迁 PostgreSQL。" },
            { term: "零成套组件库、零图表库", desc: "10 个基础组件在 core/ui 手写，折线与甘特都是手绘 SVG。换来完全可控的视觉密度、零依赖漂移，以及单运行时、少进程、省内存——部署目标是 2G 内存的轻量服务器。" },
            { term: "Tailwind 仅作原子工具类", desc: "视觉规则从设计系统派生成一层 CSS 变量令牌（tokens.css），字号与间距阶梯写进契约并由脚本钉死。" },
          ]}
        />
        <div className="mt-6">
          <Note>
            一处实测限制：本栈（Prisma 5.22 + SQLite）不支持 <Code>Json</Code> 类型。因此自定义字段的多选项采用「每行一个选项」的纯文本约定，
            需要结构化的地方在服务层单点解析，而不是到处塞 JSON 字符串。
          </Note>
        </div>
      </DocsSection>

      <DocsSection title="数据模型" desc="28 个业务实体、12 条增量迁移（每条只加列或加表，历史数据零破坏）。实体分三层：">
        <PointList
          items={[
            { term: "共享核心域（唯一真源，禁止重复定义）", desc: "Organization、User、Client、Project、ProjectMember。" },
            { term: "功能区自有表", desc: "预算（科目分类 / 科目项 / 报价单 / 明细 / 变更单）、线索（Lead / FollowUp）、设计（任务 / 提交）、排程（模板 / 任务 / 依赖）、质量（检查项 / 节点 / 判定 / 问题 / 证据）、财务（收支记录 / 付款段）。" },
            { term: "平台横切表", desc: "自定义字段定义与值、平台设置（主题与品牌）、操作流水。" },
          ]}
        />
        <div className="mt-6">
          <Note tone="accent">
            <strong className="font-medium text-primary">一条铁律撑起整个闭环：</strong>
            所有功能区的业务表都必须经 <Code>projectId</Code> 挂在 <Code>Project</Code> 上，任何模块不得自建「项目」实体；
            客户维度经 <Code>Project.clientId</Code> 间接关联。对内关联用 <Code>Project.id</Code>，对外展示与对账用可读的 <Code>Project.code</Code>（RP-YYYY-NNN）。
            因此「一个项目的全部经营数据」在设计上就能被一次查询收齐。
          </Note>
        </div>
        <div className="mt-4">
          <Muted>
            口径文件单点：报价算式只在 <Code>pricing.ts</Code>，钱的口径只在 <Code>ledger.ts</Code>，进度与三色灯只在 <Code>health.ts</Code>，
            驾驶舱聚合只在 <Code>dashboard.ts</Code>，付款段模板与解锁派生只在财务模块，跨模块整合器只有 <Code>acceptance.ts</Code> 一处。
          </Muted>
        </div>
      </DocsSection>

      <DocsSection title="视觉系统">
        <Prose>
          <p>界面遵循 HAE Creator Design System V0.3：纸感底色、全画面单点强调色、气声描边、默认无阴影，层级靠字重与对比度而非字号和粗线。字号只用 12/13/15/17/20/28px、间距只用 4/8/12/16/24/32/48px，是写进契约并机器执行的硬约束。</p>
          <p className="mt-4">主题能力已上线：四套预置强调色插槽（钴蓝默认 / 铁锈红 / 祖母绿 / 青）在平台设置页自助切换，数据库只存插槽键名、不存自由色值，也不开取色器。启动首页是视觉契约的成文例外（展示级字号、深色主按钮、入场动画），例外被严格锁在一个 CSS 作用域内，业务页不得引用。</p>
        </Prose>
      </DocsSection>

      <DocsSection title="质量工程：可信度来自三层验证">
        <DocsTable
          head={["层", "内容", "规模"]}
          rows={[
            ["纯函数门禁", "直接 import 生产代码，用独立预言机（整数分复算）交叉比对算法结果", "11 个脚本，覆盖报价 / 财务 / 质量 / 排程 / 设计 / 线索 / 驾驶舱 / 自定义字段 / 健康度 / 主题 / 人员"],
            ["集成门禁", "打隔离临时库，真跑生产服务函数，验事务传播与状态机守卫", "5 个脚本（签约建项 / 排程生成 / 质量流程 / 财务流程 / 证据上传）"],
            ["交互写回验收台", "无头浏览器真实点击 → 服务端接收 → 落库 → 回读页面，三方对账；全程打副本库", "12 个套件"],
          ]}
        />
        <div className="mt-6">
          <Muted>
            这套手段确实抓到过真实缺陷：科目库一度没有「新增科目项」入口、归档后恢复项目错落「草稿」态、设置页四套主题卡显示同色、两处文案与新口径矛盾——它们的共同点是编译期与构建期全都发现不了。
            平台还把「逻辑问题只能在真实使用中暴露」当前提来建设：全站绝大多数 catch 统一写入错误现场日志（JSONL），关键写操作统一经流水记录。员工说「这个数上周还不是这样」时，现场是可以被重建的。
          </Muted>
        </div>
      </DocsSection>
    </DocsPage>
  );
}
