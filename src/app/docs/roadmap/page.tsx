import { DocsPage, DocsSection, Prose, Muted, PointList, Note, Code } from "../ui";

export default function DocsRoadmap() {
  return (
    <DocsPage
      eyebrow="平台说明 · 发展路线"
      title="按「小步、稳定、有用、可扩展」推进"
      lead="阶段性推进，每阶段有目标与完成条件。下面区分进行中、近期、中期、基础设施，以及明确排在后面的——最后这类不是「没做」，是在真实触发条件出现前不做。"
    >
      <DocsSection title="进行中：人员工控">
        <Prose><p>先补齐工作记录与项目责任确认，再做绩效数据与算法，最后把驾驶舱的人效卡从灰占位转实。当前已合入人员档案、项目责任关系与工作记录首单元。</p></Prose>
      </DocsSection>

      <DocsSection title="近期：把主脊上的断点接上">
        <PointList
          items={[
            { term: "设计任务新建与指派入口", desc: "当前链路上最明确的断点。" },
            { term: "工序匹配改主键外键", desc: "付款段、检查项与工序之间目前按名字匹配，改名会静默失配，需消除。" },
            { term: "报价确认与锁定态接通", desc: "状态字段已在、界面尚未给出写入路径；税率可编辑、报价多版本。" },
            { term: "实际完工日自动回填", desc: "让工期红灯与保修金基准不再依赖计划日期回落。" },
            { term: "交付物文件上传与数据导入导出", desc: "设计成果目前为链接占位；检查项编辑界面；Excel / CSV 导入导出。" },
            { term: "变更单的更细审批角色", desc: "内测已具备四段状态机（草稿 → 待确认 → 客户确认 / 驳回）与撤销确认出口、附件；正式客户端身份与更细审批角色仍待登录批次。" },
          ]}
        />
      </DocsSection>

      <DocsSection title="中期：多用户与对外触点">
        <PointList
          items={[
            { term: "真登录与角色权限", desc: "User 表、11 个业务角色与 4 条业务线常量、操作人字段都已留位，届时统一收口当前各处使用的占位操作人。" },
            { term: "移动端业主客户中心", desc: "进度查询、验收在线确认、质量档案查看。" },
            { term: "现场巡检打卡与移动端录入", desc: "" },
            { term: "满意度与售后回访回流", desc: "把闭环从「回款 + 保修金」延长到真正的售后段。" },
            { term: "通知自动化与经营分析深化", desc: "当前是按需聚合，未来可主动推送；利润分析、获客渠道归因。" },
          ]}
        />
      </DocsSection>

      <DocsSection title="基础设施">
        <Prose>
          <p>
            <strong className="font-medium text-primary">内测部署（已跑通）：</strong>极空间 NAS 局域网 Docker（aarch64），单 Web 容器，保持 SQLite，暂不开放公网。
            部署三件配置在仓库根：<Code>Dockerfile</Code>、<Code>compose.internal.yml</Code>、<Code>Caddyfile</Code>。
          </p>
          <p className="mt-4">
            <strong className="font-medium text-primary">下一步：</strong>阿里云轻量服务器正式环境（Docker Compose：应用 + Caddy 终止 HTTPS，文件走 OSS）；出现多用户并发时一步迁 PostgreSQL，并把字段级权限一并纳入。
            迁移顺序：文件存储抽象 → NAS 内测 → OSS 适配 → 登录与权限 → PostgreSQL。
          </p>
        </Prose>
      </DocsSection>

      <DocsSection title="明确排在后面的">
        <Note>
          运行时插件系统与事件总线、插件 SDK 与沙箱、多品牌白标、微前端、多个独立系统拼门户——这些不是「没做」，是在真实触发条件出现前不做。
          AI 辅助管理作为后期方向保留，首期不主打：它不是当前的管理瓶颈，把流程和口径修通才是。
        </Note>
      </DocsSection>
    </DocsPage>
  );
}
