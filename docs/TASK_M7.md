# 任务卡 M7 · 质量管控（`quality` 模块）

> 状态：**已全部合入**（M7-a~e 五单元 2026-10-10 全量合入 master：build + tsc 0 + verify-quality 108 + 集成门禁 flow 94 + 五既有门禁零回退；候用户手测） ｜ 承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 §5-M7；业务细节源 `Full-Service Project Management/装修经营管理平台 — 网站设计指导文档 v5.1.md` §6.6（只取业务不取皮）
> 前置：M2-A 主脊（Project + health.ts）+ M3/M4/M5/M6 均已合入；`health.ts` 的质量灯在本 M 接真数据源；**接活 M6 留的「排程 100% → 建验收节点」副作用**
> 执行通道：codebuddy（`custom-local:glm-5.2` → 8787 三号池），master 串行；集成者守 build + 断言 + 截图
> 四项架构决策已与 HAE 确认（2026-10-10）：① 节点生成＝core 整合器（即时+读取兜底）；② 节点 4 态 + 「整改中」派生 + 重提门控；③ 检查项结果＝第 4 张行表 `NodeCheck`（计划原文「三表」→ 实际 4 张私有表）；④ 台账含最小「手工新建问题」
> 动手前读：`AGENTS.md` §2/§4/§6、`docs/TASK_M6.md`（最相近范本：模块注册/门禁/接线写法）、`src/modules/design/status.ts` + `src/modules/design/server/submissions.ts` + `src/modules/design/server/review.ts`（状态机与审核服务范本）、`src/modules/schedule/server/updates.ts`（进度联动调用点）、`src/core/domain/projects.ts`（`tx?` 事务传播范本）、`src/core/domain/health.ts`、`scripts/verify-schedule.mjs` + `scripts/verify-schedule-gen.mts`（门禁范本）、`prisma/schema.prisma` 尾部、`src/app/schedule/[projectId]/TaskDrawer.tsx`、`src/app/projects/[id]/ProjectTabs.tsx`

---

## 0. 目标

新建可插拔 `quality` 模块（名称「质量管控」）= **施工验收与整改闭环**：工序完工自动生成验收节点 → 巡检提交（SOP 检查项逐项通过/不通过）→ 项目经理审核（通过 / 退回必填原因→自动建问题）→ 问题台账（整改→复验→关闭）→ 质量档案（时间轴+打印）。把 M4-b 详情页「质量验收」空 Tab 与 `health.ts` 质量灯接到真数据源；把 M6 留的「排程 100%→建验收节点」副作用接活。

**范围红线**：
- **现场影像 DEFERRED**：不做上传/图片网格；节点详情给一行诚实占位说明「现场影像本期未接入」；列表不出图片列。
- **「验收通过 → 置 PaymentNode 待付」不实现**（`PaymentNode` 是 M8 私有表，建表后回环）；节点详情通过态留一行说明文案即可，不写钩子行为。
- 不做：角色权限过滤 / 通知 / 检查项编辑页（库仅 seed）/ 节点手工新建（节点只由工序完工自动生成）/ 节点删除 UI / 退回时「关联既有问题」（仅自动新建）/ 问题图片与附件 / 移动端。
- 不 import schedule/design/budget/projects 的模块内部；跨模块读一律经 `core/db` prisma 直读。**quality 私有表的唯一跨模块非 quality 写入点 = core 整合器 `syncAcceptanceNodes`**（见 §1-1），模块内不得再写第二套同步。

## 1. 关键架构决策（先定，防跑偏）

1. **节点生成＝core 整合器（即时 + 兜底）**：新建 `src/core/domain/acceptance.ts` 导出 `syncAcceptanceNodes(projectId, tx?)`（幂等）。规则：
   - **建**：`ScheduleTask.status=="completed"` 且无节点 → 建节点（`name`/`order` 快照自任务；同时按 `CheckItem.stage==task.name` 快照检查项为 `NodeCheck` 行，`result=null`）。无检查项的工序照建节点（空清单要能提交，诚实显示）。
   - **删**：`status=="pending"` 且其任务不存在或未完工的节点 → 删（自愈误标 100% 的场景；pending 节点必无问题关联，删安全）。**非 pending 节点永不自动删**。
   - **调用点**：① `schedule/server/updates.ts` 的 `updateTaskProgress` —— 同一事务内调用（`updateTaskProgress` 的 select 增读 `projectId`）；② quality 各读取入口（`/quality`、节点详情、档案页）读前调用兜底；③ `projects/server/projectDetail.ts` 质量聚合前调用（M7-e）；④ seed 在演示数据灌完后调用物化演示节点。
   - 任务被「清空排程」删除后：节点 `taskId` 为逻辑引用（无 @relation），pending 节点由下次同步删除；非 pending 保留（历史），`taskId` 允许悬垂（UI 不反查）。
2. **状态机（`src/modules/quality/status.ts` 纯函数，不碰 prisma）**：
   - 节点 4 态：`pending 待提交 → submitted 待审核 → passed 已通过 | returned 已退回 →（重提）submitted`。「整改中」不落库：`status=="returned"` 且关联问题含 `open` → 显示「整改中」，无 open → 显示「待重新提交」（`nodeDisplayLabel(status, hasOpenIssues)` 纯函数）。
   - **重提门控**：`returned` 重提须关联问题全部非 open（即已整改或已关闭）。
   - 问题 3 态：`open 待整改 → rectified 待复验 → closed 已关闭`；`rectified → open`（复验退回，需填意见）。
   - 严重度：`minor 轻微 / normal 一般 / major 严重`（v5.1 的蓝/黄/红 → 落为 V0.3 语义 token：neutral/warning/danger，**轻微不用 accent 蓝，守单点 accent 纪律**）。
3. **检查项结果＝行表 `NodeCheck`**（决策 ③）：节点生成时从 `CheckItem` 快照（名称/标准/顺序），提交时逐项填 `pass|fail` + 备注；重提可改结果（整行替换式更新）。**提交须全部检查项已填**（空清单工序例外，可直接提交）；允许提交含 fail 项（记录事实，由审核人裁量）。
4. **退回→自动建问题**：审核退回时在同一事务内创建 `Issue`（`title`=「{工序名}验收退回」、`desc`=退回原因全文、`severity`=审核人选择（默认 normal）、`reportedBy`=审核人、`nodeId`=节点、`projectId`）；退回原因必填。复验退回（`rectified→open`）填 `recheckNote` 并保留历史（单字段，不建日志表——MVP，v5.1 未要求流水）。
5. **计数口径（接灯）**：`openIssues`=问题 `status!=="closed"` 计数；`pendingNodes`=节点 `status!=="passed"` 计数 → 喂 `core/domain/health.qualityLight`（函数已定、门禁已覆盖，**不得改公式**）。
6. **诚实空状态**：未排程/无完工工序的项目质量页给空态引导；检查项空清单显「该工序暂无检查项」；影像位置显占位说明条（非造假数据）。

## 2. 拆五个单元（一次一个界面单元，防 429 / 半成品）

| 单元 | 内容 |
|---|---|
| **M7-a** | 模块注册（manifest + registry 加一行 + **从 `deferredModules` 删 `quality`**）；schema 迁移建 **4 张私有表**；`core/domain/acceptance.ts` 整合器 + **`updateTaskProgress` 同事务调用点**；纯函数 `status.ts` + `types.ts`；`scripts/verify-quality.mjs`；seed（CheckItem 35 条 + 演示流状态）；`/quality` **节点列表页**（读前同步）；`/quality/issues` 与 `/quality/archive` 占位页防死链；qa-shots 加 `18-quality` |
| **M7-b** | `/quality/nodes/[id]` **节点详情**：基础信息 + 检查项清单（提交模式可编辑）+ 影像占位 + 审核区（通过 / 退回必填原因→自动建问题）+ 重提门控；`server/nodes.ts`（查询+提交）+ `server/review.ts`（审核）；`actions.ts`；**新 `scripts/verify-quality-flow.mts`**（隔离库，节点流部分） |
| **M7-c** | `/quality/issues` **问题台账**：筛选（项目/状态/严重度）+ 表格 + 抽屉详情（整改记录/复验记录）+ 整改/复验关闭/复验退回 + **手工新建问题**（Modal）；`server/issues.ts`；集成门禁扩问题流 + 手工建 |
| **M7-d** | **质量档案**：`/quality/archive` 索引（每项目节点/问题统计）+ `/quality/archive/[projectId]` 时间轴（纯函数 `timeline.ts` 合并节点+问题事件）+ `/quality/archive/[projectId]/print` A4 打印（自有 print.css，仿 budget print）；verify-quality 扩 timeline 断言 |
| **M7-e** | 项目中心接线：详情「质量验收」Tab 填真 + 「基础信息」质量灯接真值 + 甘特任务抽屉加「验收节点 →」入口（`/quality?taskId=` 解析跳转）+ `/quality` 支持 `?taskId` 深链；收尾（STATUS/全量截图/375 复核） |

## 3. M7-a 详细范围

- 新建 `src/modules/quality/manifest.ts`：`id="quality"`、`name="质量管控"`、`description="验收节点、SOP 检查项、质量问题台账与整改闭环"`（原样承接 deferredModules 文案）、`entryPath="/quality"`、`icon` 用单字符 `质`（禁 emoji）、`order=6`、`nav: [{ label:"问题台账", href:"/quality/issues" }, { label:"质量档案", href:"/quality/archive" }]`（静态路径，合法）。**因 nav 指向这两条路由，本单元同时建两占位页**（防死链）。`registry.ts`：`modules` 加一行；`deferredModules` 删 `quality` 条目。**另：`budget/manifest.ts` 的 `order: 1` 调为 `7`**（对齐 PLAN §6 目标导航顺序 `…schedule · quality · budget…`，HAE 已知晓；仅动顺序不动路由）。
- `prisma/schema.prisma` 新增（**权威草案，照抄**；可移植、无 PG 专有类型）：

```prisma
// ── M7-a：quality 模块私有表（modules/quality）──
// 节点/问题经 projectId 外键引用共享 core/domain Project；
// node.taskId 为对 ScheduleTask 的【逻辑引用】（跨模块不建 @relation，仿 assigneeId 策略）。
// 检查项库仅 seed 灌入（v5.1 无编辑页）。

// 检查项库（SOP）：按 stage（=工序名，与 ProcessTemplate.name 同字面）映射 11 工序。
model CheckItem {
  id        String   @id @default(cuid())
  stage     String   // 工序名，如"水电工程"
  name      String   // 检查项名，如"强弱电间距"
  standard  String   // 验收标准
  order     Int      // 工序内排序
  createdAt DateTime @default(now())

  @@unique([stage, order])
  @@map("check_items")
}

// 验收节点：工序完工自动生成（core 整合器），一工序一节点。
model AcceptanceNode {
  id           String    @id @default(cuid())
  projectId    String
  taskId       String?   @unique        // ★ 逻辑引用 ScheduleTask.id；清空排程后允许悬垂
  name         String                    // 工序名快照
  order        Int                       // 工序顺序快照
  status       String    @default("pending") // pending|submitted|returned|passed
  submitNote   String    @default("")    // 提交说明
  submittedBy  String?                   // ★ userId（占位当前用户）
  submittedAt  DateTime?
  reviewedBy   String?                   // ★ userId
  reviewedAt   DateTime?
  returnReason String?                   // 退回原因（最近一次；详情页展示）
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  project Project     @relation(fields: [projectId], references: [id])
  checks  NodeCheck[]
  issues  Issue[]

  @@index([projectId])
  @@index([status])
  @@map("acceptance_nodes")
}

// 节点检查项快照行：生成时从 CheckItem 拷入；提交时填结果。
model NodeCheck {
  id        String   @id @default(cuid())
  nodeId    String
  name      String   // 快照
  standard  String   // 快照
  order     Int
  result    String?  // null=未检 | pass | fail
  note      String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  node AcceptanceNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@unique([nodeId, order])
  @@map("node_checks")
}

// 问题台账：验收退回自动建；亦可手工新建。
model Issue {
  id          String    @id @default(cuid())
  projectId   String
  nodeId      String?                   // 来源节点（手工建可为空）
  title       String                    // 问题标题
  desc        String    @default("")    // 详细描述
  severity    String    @default("normal") // minor|normal|major
  status      String    @default("open")   // open|rectified|closed
  reportedBy  String                    // ★ userId
  assigneeId  String?                   // ★ 责任人 userId
  dueDate     DateTime?                 // 截止日期
  rectifyNote String?                   // 整改说明
  rectifiedAt DateTime?
  recheckNote String?                   // 复验意见（关闭/退回共用，取最近一次）
  closedAt    DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  project Project         @relation(fields: [projectId], references: [id])
  node    AcceptanceNode? @relation(fields: [nodeId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([status])
  @@index([severity])
  @@map("issues")
}
```

  → `Project` 侧只加两行反向关系：`acceptanceNodes AcceptanceNode[]` / `issues Issue[]`。迁移与 seed 执行**归集成者**（见 §6）。
- **core 整合器**（`src/core/domain/acceptance.ts`）：`syncAcceptanceNodes(projectId: string, tx?: Prisma.TransactionClient): Promise<void>`——`tx` 传播写法照 `src/core/domain/projects.ts` 的 `createProject(input, tx?)` 范式（M3-d2 教训：跨函数复用事务必须显式传 `tx`）。规则见 §1-1。头部注释声明「quality 私有表的唯一跨模块非 quality 写入点」。
- **调用点①（本单元）**：`schedule/server/updates.ts` 的 `updateTaskProgress`——select 增读 `projectId`；在既有 `$transaction` 内 `await syncAcceptanceNodes(task.projectId, tx)`；**该文件其余函数与其他 schedule 文件一律不动**。调用点②（quality 页读前同步）在 `/quality` 页实现；③（projects 聚合）归 M7-e；④（seed）见下。
- **纯函数**（`src/modules/quality/`）：
  - `types.ts`：`NodeStatus` / `IssueStatus` / `IssueSeverity` 共享类型。
  - `status.ts`：`NODE_STATUS_ORDER=(["pending","submitted","returned","passed"] as const)` + `NODE_STATUS_LABEL`（待提交/待审核/已退回/已通过）+ `nodeStatusTone`（pending=neutral / submitted=accent / returned=danger / passed=success；**模块内自定义同名 type，勿 import 其他模块内部**）+ `nodeDisplayLabel(status, hasOpenIssues)`（returned+有 open→「整改中」，returned+无 open→「待重新提交」，其余回状态标签）+ `canSubmitNode(status)`（pending|returned）+ `canResubmitAfterReturn(issues)`（全部非 open；空数组=true）+ `nextNodeStatusAfterReview(approve)`（passed|returned）+ `assertNodeTransition(from,to)`（合法：pending→submitted / returned→submitted / submitted→passed / submitted→returned；其余抛错）；`ISSUE_STATUS_ORDER` + `ISSUE_STATUS_LABEL`（待整改/待复验/已关闭）+ `issueStatusTone`（open=danger / rectified=warning / closed=neutral）+ `ISSUE_SEVERITY_ORDER` + `ISSUE_SEVERITY_LABEL`（轻微/一般/严重）+ `issueSeverityTone`（neutral/warning/danger）+ `canRectify(status)`（open）/ `canClose(status)`（rectified）/ `canReopen(status)`（rectified）/ `assertIssueTransition(from,to)`（合法：open→rectified / rectified→closed / rectified→open）。
- **seed**（`prisma/seed.ts` 追加 `seedQuality()`，main() 调用；幂等，仿 M6 写法）：
  - **CheckItem 35 条**（**照下列清单实现**；文字为策展改写版，与参考素材对应但不得整段照抄原文档）：

| stage | order | name | standard |
|---|---|---|---|
| 拆除工程 | 1 | 拆除范围核对 | 拆除边界与交底一致；承重结构、保留部位不得误拆 |
| 拆除工程 | 2 | 现场原状交接 | 防盗门/门窗玻璃/下水/强电等原状逐项记录确认 |
| 拆除工程 | 3 | 建渣清运 | 拆除垃圾清运完毕，现场具备下道工序进场条件 |
| 水电工程 | 1 | 强弱电间距 | 强弱电管线间距≥30cm，交叉处做屏蔽处理 |
| 水电工程 | 2 | 线管与穿线 | 线管无接头，管内穿线截面占比≤40% |
| 水电工程 | 3 | 水管排布 | 横平竖直、左热右冷；排水坡度 0.5%~1% |
| 水电工程 | 4 | 水压试验 | 试验压力 1.0MPa 保压 0.5h，压降<0.05MPa 且无渗漏 |
| 泥工工程 | 1 | 垂直度与平整度 | 砌筑/抹灰垂直度、平整度符合验收标准 |
| 泥工工程 | 2 | 空鼓率检查 | 墙面空鼓率受控，无大面积空鼓 |
| 泥工工程 | 3 | 阴阳角方正 | 阴阳角方正顺直、无明显缺损 |
| 防水工程 | 1 | 防水层质量 | 涂刷均匀、厚度达标，上翻高度符合规范 |
| 防水工程 | 2 | 管根节点处理 | 管根、地漏、阴阳角加强层处理到位 |
| 防水工程 | 3 | 闭水试验 | 蓄水深度≥2cm 静置 24h，楼下无渗漏 |
| 地面工程 | 1 | 地面找平 | 找平层平整度合格，无空鼓起砂 |
| 地面工程 | 2 | 地砖坡度 | 坡度朝向地漏，泼水无积水 |
| 地面工程 | 3 | 地板留缝 | 留缝约 0.3mm 均匀一致（铺装阶段） |
| 墙面工程 | 1 | 基层处理 | 基层坚实、无空鼓开裂，防裂处理到位 |
| 墙面工程 | 2 | 垂直与平整 | 墙面垂直度、平整度符合验收要求 |
| 墙面工程 | 3 | 饰面观感 | 饰面排布规整、无明显色差 |
| 天花工程 | 1 | 龙骨安装 | 龙骨间距合格、固定牢固，吊杆无松动 |
| 天花工程 | 2 | 石膏板接缝 | 接缝错缝安装、防裂处理到位 |
| 天花工程 | 3 | 防锈防潮 | 钉眼防锈、板材防潮处理到位 |
| 乳胶漆工程 | 1 | 涂装前保护 | 开关、灯具、地面等成品保护到位 |
| 乳胶漆工程 | 2 | 漆膜质量 | 漆膜丰满、无刷痕流挂、颜色均匀 |
| 乳胶漆工程 | 3 | 分色线 | 分色线通直、边界清晰 |
| 乳胶漆工程 | 4 | 阴阳角护角 | 阳角内置护角安装到位 |
| 定制工程 | 1 | 板材进场核对 | 板材/五金品牌、规格与约定一致 |
| 定制工程 | 2 | 安装牢固度 | 柜体安装牢固、水平垂直、收口平整 |
| 定制工程 | 3 | 五金功能 | 铰链、滑轨、拉手开启顺畅无杂音 |
| 水电安装 | 1 | 洁具安装 | 洁具安装牢固、密封良好，通水无渗漏 |
| 水电安装 | 2 | 灯具开关插座 | 安装端正、通电功能正常 |
| 水电安装 | 3 | 绝缘电阻 | 电路绝缘电阻实测合格 |
| 竣工清洁 | 1 | 全屋清洁 | 全屋保洁达标、无施工残留 |
| 竣工清洁 | 2 | 竣工质量验收 | 水电路复查合格、成品完好 |
| 竣工清洁 | 3 | 资料移交 | 竣工资料、质保凭证移交齐全 |

  - **演示物化 + 流状态**（幂等：`issue.count()==0` 才灌演示流状态；节点物化走 `syncAcceptanceNodes` 对全部既有项目调用一次）：
    - 007 演示流状态：**003「老街 21 号院」** —— 「拆除工程」节点 `passed`（检查项全 pass；提交人=老郑、审核人=周工；时间取该工序任务 `actualEnd`，提交=actualEnd、审核=次日）；「水电工程」节点 `passed`（同上）；「泥工工程」节点 `returned`（`returnReason="厨卫墙面局部空鼓，需整改后复验"`；检查项「空鼓率检查」result=fail，其余 pass）+ 关联 `Issue`（title「泥工工程验收退回」、desc=原因、severity=normal、status=open、reportedBy=周工、assigneeId=周工、dueDate=今天+3d）。
    - **002「金域蓝湾 2 栋 802」** —— 「拆除工程」节点 `passed`（时间取任务 actualEnd）；「水电工程」节点 `submitted`（检查项全 pass，提交人=老郑，提交时间取 actualEnd）。
    - 其余节点保持 `pending`（由物化产生）。
  - 自检断言（报数取 DB 真值）：CheckItem=35 且 11 工序齐；节点数 003=11 / 002=6 / 004=0；001 节点数=其 completed 任务数；问题数=1（open）；003 泥工节点=returned、002 水电节点=submitted。
- `/quality` **节点列表页**（server 组件 + `server/nodes.ts` 查询）：读取时对**全部非 archived 项目**逐个 `syncAcceptanceNodes` → 查节点（含项目名、提交人名、检查通过 n/m、关联问题数）。顶部：项目筛选下拉（`?projectId=` 深链，选项=非 archived 项目）；`?taskId=` 时：经 prisma 读该任务得 projectId → 同步 → 找节点 → `redirect(/quality/nodes/[id])`；找不到节点 → `redirect(/quality?projectId=X)`。表格列：验收节点（name）/ 项目 / 状态徽章（含「整改中」派生文案）/ 提交人 / 提交时间 / 检查（通过 n/m；全未检显 —）/ 问题（未关闭数，0 显 —）；行链到节点详情（M7-b 交付，本单元先给 `href` 即可）。排序：项目 order（项目列表顺序）→ 节点 order。空态：无节点→「暂无验收节点——工序完工后自动生成」+ 链到 `/schedule`。
- `/quality/issues` 占位页：「问题台账将在 M7-c 上线」诚实空态 + 返回 `/quality`；`/quality/archive` 占位页：「质量档案将在 M7-d 上线」+ 返回。`qa-shots` 加 `{ name: "18-quality", path: "/quality" }`。

## 4. M7-b / M7-c / M7-d / M7-e 要点（边界先定，细节按 §0/§1 展开）

- **M7-b 节点详情**（`src/app/quality/nodes/[id]/page.tsx` + `NodeDetail.tsx` + `SubmitChecksForm.tsx` + `ReviewForm.tsx`，仿 `src/app/design/[id]` 结构）：
  - `server/nodes.ts`：`getNodeDetail(id)`（节点+检查项+关联问题+项目名+用户名字映射，逻辑引用拆名仿 design submissions 的 nameById 做法）；`submitNode(id, input, tx?)`——守卫：节点存在、`canSubmitNode`、（`returned` 时）`canResubmitAfterReturn`、检查项**全部已填**（`result` 非 null，报错文案「还有 N 项未检」）；写 `checks`（deleteMany+createMany 整行替换式，结果+备注）、`submitNote`、`submittedBy=占位用户`、`submittedAt`、status→submitted；单事务。
  - `server/review.ts`：`reviewNode(id, input)`——守卫 `canReview`（status=="submitted"）；`approve=true` → status=passed、reviewedBy/reviewedAt；`approve=false` → 原因必填（空报错「退回原因不能为空」）、severity 校验枚举、单事务内：status=returned、returnReason、reviewedBy/At + **建 Issue**（按 §1-4）。
  - `currentUser.ts`（模块内）：`getPlaceholderUser(kind: "submit" | "review")` —— submit 取最早 `inspector`（缺则 pm）、review 取最早 `pm`（缺则 inspector）；头注「P4 接登录后替换；承 v5.1 角色：巡检提交、PM 审核」。
  - 详情页布局：头部（节点名+状态徽章+项目链+返回）→ 基础信息卡（关联工序名快照；有任务则附计划/实际起止，无则 —；提交人/提交时间/审核人/审核时间）→ 检查项清单（提交模式：每项 通过/不通过 单选 + 备注输入；只读模式：结果+备注展示，fail 标 danger）→ 影像占位说明条（「现场影像本期未接入（规划中）」）→ 审核区（submitted 时：`[通过]` + `[退回]`（内联展开原因 required + 严重度 select 默认一般））；passed → 通过态横幅 + 「付款联动将在财务模块（M8）接入」说明；returned → 退回原因横幅 + 关联问题列表（title/severity/status）+ 重提表单（受门控：有 open 问题时提交按钮禁用 + hint「关联问题整改完成后可重新提交」）。
  - **新 `scripts/verify-quality-flow.mts`**（隔离库三步配方照 `verify-schedule-gen.mts` 头注）：节点流部分——`updateTaskProgress` 置 100 同事务建节点（含检查快照）/ 回落清 pending 节点 / 重跑幂等；submit 守卫（未检完拒绝、状态拒绝、重提门控）；review 通过 / 退回（建问题断言：字段逐一核对）/ 空原因拒绝。**退出码 0/1，报数取 DB 真值。**
- **M7-c 问题台账**（`/quality/issues/page.tsx` + `IssueLedger.tsx` + `IssueDrawer.tsx` + `NewIssueModal.tsx`，抽屉复用 `core/ui/Drawer`、Modal 仿 `SignLeadModal`）：
  - `server/issues.ts`：`listIssues(filters)`（项目/状态/严重度，含项目名/责任人名/节点名）；`rectifyIssue(id, note)`（守卫 `canRectify`、整改说明必填；写 rectifyNote/rectifiedAt）；`recheckIssue(id, pass, note)`（守卫 `canClose && status=="rectified"`；pass=true → closed + closedAt；pass=false → open + recheckNote 必填、清 rectifiedAt？——**保留 rectifyNote/rectifiedAt 历史不删**，recheckNote 记退回意见；通过时 note 可空）；`createIssue(input)`（项目必选且存在、title 必填、severity 枚举、assigneeId 可空但须为真实 userId、dueDate 可空；reportedBy=占位用户）。全部单事务、中文错误（`QualityIssueError` 仿 `ScheduleUpdateError`）。
  - 台账页：筛选行（三个 select，query 直链）+ `[新建问题]`（Modal：项目/标题/描述/严重度/责任人/截止）；表格列：问题（title 截断）/ 项目 / 严重度徽章 / 状态徽章 / 责任人 / 截止（逾期未关标 danger）/ 报告时间；行点击开抽屉：描述 + 整改记录（rectifyNote/rectifiedAt，无则显 —）+ 复验记录（recheckNote/closedAt）+ 动作按钮（按状态门控：`[标记已整改]`（填说明）/ `[复验通过·关闭]` / `[复验退回]`（必填意见））；来源节点头部链到节点详情（nodeId 非空时）。
  - 集成门禁扩：整改/复验关闭/复验退回（reopen 后门控恢复）/ 手工新建（校验拒绝用例）/ 重提门控联动（整改完毕→节点重提可提交）。
  - qa-shots 加 `{ name: "19-quality-issues", path: "/quality/issues" }`。
- **M7-d 质量档案**（`/quality/archive` 索引 + `[projectId]` 时间轴 + `[projectId]/print`）：
  - `timeline.ts` 纯函数：`buildTimeline(nodes, issues, project)` → 事件数组（节点生成/提交/通过/退回 + 问题创建/整改/关闭；每条含 date/label/tone/href），按时间升序；同日排序规则：节点事件先于问题事件（稳定排序，二次键=创建时间）。断言并入 `verify-quality.mjs`。
  - 索引页：每项目一行（项目名/节点统计（通过 x·未通过 y）/未关闭问题数 + 「打开档案 →」）；时间轴页：头部摘要（区间=项目开工日期→今；节点 N/通过 x；问题 M/未关闭 y；影像：未接入）+ 垂直时间轴（V0.3：无阴影、单点 accent 于今天位或跳过）+ `[打印]` 链；print 页仿 `/budget/[projectId]/print`（自有 `print.css`，`PrintButton` 复用或平行复制 **不跨模块引 budget 组件，抄样式结构**）。
  - 计打印验证：`node scripts/print-pdf.mjs`（先读该脚本用法）对一个演示项目档案出真 A4 PDF 目检。
  - qa-shots 加 `20-quality-archive`（时间轴）与索引页目标。
- **M7-e 项目中心接线**：
  - `projects/server/projectDetail.ts`：质量聚合前 `await syncAcceptanceNodes(projectId)` → prisma 直读：节点按状态计数、未关闭问题数、（可选）最近问题 2-3 条。**只用 core health，不 import quality 模块内部**；派生展示所需文案在 `ProjectTabs.tsx` 局部副本（跨模块禁引，注明同源）。
  - `ProjectTabs.tsx`：「质量验收」Tab 填真：节点总览（总/已通过/待审/退回）+ 未关闭问题数 + 节点紧凑清单（≤11 行：名/状态）+ 「打开质量管控 →」（`/quality?projectId=`）；「基础信息」质量灯接 `qualityLight` 真值（文案：有未整改/未关闭→红「存在问题」；有待验收→黄「待验收」；否则绿「正常」）。
  - `TaskDrawer.tsx`（schedule 模块）：加「验收节点 →」链接 `href=/quality?taskId=<task.id>`（**仅加 URL，不读 quality 表**——跳转解析归 quality 侧，见 §3）。
  - 收尾：`docs/STATUS.md` 更新（参照 M6 收尾格式）+ 全量截图 + 375 探针复核 5 页 + `pnpm build` 全门禁。

## 5. 硬约束（五单元通用）

- 禁止 git（禁 `git commit`）；禁止 `pnpm dev`；**迁移 / seed 执行由集成者跑，codebuddy 只写代码/schema/seed 文件本身**；唯一绿门 `pnpm build`。
- V0.3 刻度：字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48；无阴影、单点钴蓝 `#3368A0`；表头/按钮 `whitespace-nowrap`；375 不破版；**色点非 emoji**。
- 跨模块读走 `core/db` prisma 直读，**不 import 其他模块内部**；`health.ts` 只被调用不改公式；`syncAcceptanceNodes` 是 quality 表唯一跨模块写入点（放 core），模块内不得再写第二套同步逻辑。
- 单一计算口径：状态机/标签/色 tone 只出现在 `quality/status.ts`（`timeline.ts` 只管档案事件组装）；计数口径见 §1-5，页面不得各写一套。
- `manifest.nav` 拿不到 id → 项目级入口只放页面内部（`?taskId=`/`?projectId=` 深链合法）。
- 完成度闸门：宁交完整可编译，不留半成品；门禁脚本 import 真源带 `.ts` 扩展名（勿穿无扩展名 re-export 链）。
- 新表格/新页面遵循 V0.3 反模板：不做圆角大卡片堆叠、不加装饰性图标；表格沿 `core/ui/Table`、徽章沿 `core/ui/Badge`。

## 6. 门禁与验收（每单元必跑，集成者独立复跑，codebuddy 自述不作数）

- `pnpm build` + `verify-quote 17` + `verify-crm 11` + `verify-health 20` + `verify-design 28` + `verify-schedule 55`（**不得回退**）+ **新 `verify-quality.mjs`（≥30 断言：节点 4 态 × canSubmitNode、nextNodeStatusAfterReview、assertNodeTransition 合法 4 + 非法 ≥4、`nodeDisplayLabel` 整改中/待重提/常规 ≥5 例、重提门控 ≥4 例（空数组/全 closed/含 rectified/含 open）、问题 3 态谓词与转移合法 3 + 非法 ≥3、严重度与状态 label/tone 全覆盖、输出禁 emoji）** + **`verify-quality-flow.mts`（≥35 断言，隔离库三步：同步建/删/幂等 + 进度联动同事务 + 提交守卫 + 审核通过/退回建问题 + 重提门控 + 整改/复验/关闭/退回 + 手工新建校验）**。
- 集成者运行序列：`cp prisma/dev.db _scratch/backup/dev.db.<日期>备份` → `pnpm prisma migrate dev --name add_m7_quality` → `pnpm db:seed` → build → 门禁 → 截图。集成门禁配方（隔离库）：
  `DATABASE_URL="file:../_scratch/quality-flow.db" npx prisma migrate deploy` → 同库 `db seed` → `npx tsx --tsconfig tsconfig.json scripts/verify-quality-flow.mts`（**改排程/质量写库逻辑时必跑**）。
- 截图 `node scripts/qa-shots.mjs`（1440/1280/375）：`/quality` 列表（筛选/空态）、节点详情四态（pending 表单 / submitted 审核区 / returned+问题+重提门控 / passed）、台账（筛选+抽屉）、档案时间轴 + print PDF；**375 溢出争议用 DOM 探针量 scrollWidth（`public/__probe.html` 法），别只信肉眼**。
- 手测闭环（M7-e 后）：002 打开质量页 → 见 6 节点 → 「水电工程」复核提交状态 → 通过；003 泥工节点：整改（台账）→ 重提 → 通过；004 空态引导；甘特任务抽屉「验收节点 →」跳转命中；项目中心 Tab/灯数值联动一致；「清空排程」后 pending 节点消失、非 pending 保留。
- 跑完 codebuddy 后 grep `~/.codebuddy/logs/<date>/renovation-platform__*.log` 的 `resolved model=` / `Using custom URL`，确认命中 `http://127.0.0.1:8787/…`（别落回 copilot.tencent.com 内置口）。

## 7. 与 PLAN / v5.1 的偏差与新增（集成者注，四项已 HAE 拍板）

1. **私有表 3 → 4 张**：多 `NodeCheck` 行表承载检查项快照与结果（HAE 已拍板；替代 Json 列方案）。
2. **节点生成走 core 整合器（即时+兜底）**（HAE 已拍板）：`updateTaskProgress` 同事务建/删节点 + 各读取入口幂等兜底；「副作用」语义=对外可观测的「完工即生节点」。
3. **「整改中」为派生显示**（HAE 已拍板）：不落库；`returned` + 存在 open 问题 → 显「整改中」，无 → 「待重新提交」；重提门控=关联问题全部非 open。
4. **台账含最小「手工新建问题」**（HAE 已拍板）：对计划文本的最小增补。
5. **影像 DEFERRED**：列表不出图片列；详情给占位说明条（v5.1 的「图片数/照片网格」不做）。
6. **「验收通过→置 PaymentNode 待付」M7 不实现**：M8 建表后回环（v5.1 §6.7.3），M7 仅详情页说明文案。
7. **甘特「点击工序名跳验收」落为任务抽屉内「验收节点 →」入口**：抽屉是现行交互承接点；跳转经 `/quality?taskId=` 由 quality 侧解析（schedule 不读 quality 表）。
8. **节点列表不出「关联工序」单列**：自动节点与工序同名，展示冗余；「节点名称」即工序名。
9. **问题「ID」列不展示**（cuid 无可读性）；如需短号另议。
10. **档案不含「影像数量汇总」**（影像未接入）；含节点/问题统计与全事件时间轴。
11. **导航顺序对齐计划**：quality `order=6`；顺手把 budget `order 1→7`（`…schedule · quality · budget…`，HAE 知晓）。
12. **退回时不做「关联既有问题」**（v5.1 原话为「关联或新建」）：仅自动新建，简化交互。

## 8. 阻塞回报优先于瞎返

遇到「退回问题标题/描述的生成口径」「检查项编辑交互细节」「档案时间轴同日事件排序」「`?taskId` 解析失败时的兜底」等拿不准的，**先停下回报集成者**，别自作主张扩范围、造数或提前实现 M8（付款节点）的钩子行为。
