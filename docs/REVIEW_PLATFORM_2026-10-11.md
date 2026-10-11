# 装修经营管理数字化平台 · 整站工作审查简报（自包含版）

> 用途：供**外部 AI 审查者**在无代码仓库访问的条件下，审计本平台截至 2026-10-11 的全部已实现内容。本文件自包含——架构、数据模型、核心计算逻辑、逐模块交付、验证体系、已知风险与待议项均内联，审查者无需读仓库即可判断合理性。
> 立场：本简报**主动暴露取舍与不确定处**，不粉饰。文末「请重点审查」列出希望被挑战的具体判断。凡标注【把握】处为作者自评的置信度，供审查者据此分配质疑力度。
> 版本：平台契约 v0.1 · 里程碑 M1a→M8-d 已合入 · 技术栈 Next.js(App Router)+TypeScript+Prisma+SQLite+pnpm+Tailwind(派生 CSS 令牌)。

---

## 0. 一句话定位与阅读指引

一个面向**装修经营全流程**的**模块化单体** Web 平台：一个仓库、一套登录外壳（当前免登录单用户）、共享主数据、可插拔功能模块。已建成 8 个业务模块 + 平台壳，覆盖「预算报价 → 商务线索 → 项目中心 → 设计 → 排程 → 质量 → 财务」的经营主脊。

审查建议顺序：先读 §1 技术栈与 §2 架构骨架（判断地基是否自洽）→ §5 核心口径代码（判断算得对不对）→ §4 逐模块（判断业务建模是否合理）→ §6 验证（判断"通过"是否可信）→ §7 风险与 §8 待议（判断作者是否诚实、有无盲区）。

---

## 1. 技术栈与全局约束（均为 DECIDED，长期沿用）

- **框架**：Next.js（App Router）+ TypeScript，全栈一体（前端页面 + 后端 Route Handler / Server Action 同仓）。
- **数据**：Prisma ORM。开发期与首个部署用 **SQLite**；schema 保持**可移植**——禁用 PG 专有类型（`String[]` 数组、`dbgenerated` 特殊函数、原生 enum），枚举一律「string 列 + TS 常量」，JSON 用 `Json`。上多用户/并发时一步迁 PostgreSQL（列为 QA 关卡，未做）。
- **样式**：Tailwind 仅作原子工具类 + 一层从设计系统派生的 CSS 变量令牌（`src/styles/tokens.css`）。**禁止**引入 Element/Antd/MUI 等成套组件库；基础组件在 `src/core/ui/` 手写。
- **包管理**：pnpm。**部署目标**：Docker Compose（app + Caddy 反代 + 后期 postgres），阿里云轻量 2G，单运行时少进程。
- **设计系统**：唯一真源在仓库外的一份《HAE Creator Design System V0.3》（纸感底、全画面单点 accent、气声描边、无阴影、层级靠字重与对比度）。本仓 accent 选**钴蓝 `#3368A0`**（默认铁锈红会与 danger 状态色撞车）。

【把握】技术栈选型高置信；「SQLite-first + 可移植 schema 一步迁 PG」是刻意取舍，其代价见 §7。

---

## 2. 架构骨架（判断地基自洽性的关键）

### 2.1 模块化单体 + 注册表驱动外壳
每个模块在 `src/modules/<id>/manifest.ts` 导出一个 `ModuleManifest`；`src/modules/registry.ts` 汇总成数组。**外壳只读 registry，绝不写死任何模块**。新增模块 = 新建目录 + registry 加一行，导航与首页自动出现。

```ts
interface ModuleManifest {
  id: string; name: string; description?: string; icon?: string;
  order: number; entryPath: string; requiresAuth?: boolean;
  nav?: { label: string; href: string }[];
}
```

### 2.2 四条分层铁律（贯穿全仓）
1. **路由层薄、逻辑归 `modules/<id>/server`、UI 原子归 `core/ui`、主数据归 `core/domain`**。
2. **跨模块读一律经 `core/db` 的 prisma 直读 + 口径调 `core/domain`，绝不 import 其他模块的内部文件**。模块间只通过 `core` 与注册表协作。
3. **单一口径真源**：报价计算只在 `core/domain/pricing.ts`；财务口径只在 `core/domain/ledger.ts`；付款五段与解锁只在 `modules/finance/payment.ts`；页面不得各写算式。
4. **派生值不落库**：能从现有数据算出来的（进度、三色灯、付款段解锁态）读取时现算，不存冗余列——除非该值需要挂快照行（如验收节点要挂 `NodeCheck`，才落库）。

### 2.3 快照语义（多处一致贯彻的领域决策）
「模板/主数据变了不回溯历史」用**快照**而非引用实现：
- `QuoteItem` 快照自 `CatalogItem`（改科目模板不回溯历史报价）；
- `ScheduleTask` 快照自 `ProcessTemplate`（改工序模板不回溯已生成排程）；
- `NodeCheck` 快照自 `CheckItem`（改检查项库不回溯已生成节点）；
- `PaymentNode.amountDue` 快照自生成时的 `Project.contractAmount`（改合同额不回溯已生成计划）。

### 2.4 状态机与诚实降级
- 各模块状态机是**无 prisma 的纯函数**（`design/status.ts`、`quality/status.ts`、`schedule/status.ts`、`crm/stages.ts`、`finance/payment.ts`），被门禁脚本直接 import 测试，输出**禁 emoji**、禁彩色图标。
- **诚实降级**：数据缺失时返回中性/null 并显灰态，不造假绿、不造 0%。典型：`marginRate` 分母≤0 返回 `null`（UI 显「—」）；`budgetLight` 合同额未录入返回 green 哨兵降级但 UI 灯位显灰「未录入」；无排程/无节点时进度与灯显「未排程/暂无验收」。

### 2.5 单用户 + 角色模拟（当前阶段的有意简化）
本期免登录、单用户，`User` 表已建（含 `role`/`department` + 11 装修角色常量）但**不接认证**。跨模块的人员引用（`assigneeId`/`reviewerId`/`ownerId`/`recordedBy` 等）存 userId 为**逻辑引用**（不建到 User 的 @relation，避免牵动 User 表），P4 接登录时再定外键。真实 RBAC、"毛利仅老板可见"的角色过滤均 DEFERRED。

---

## 3. 数据模型全景（21 个 Prisma model）

### 3.1 共享核心域（core/domain，禁止模块重复定义）
| model | 角色 | 关键字段/语义 |
|---|---|---|
| `Organization` | 租户占位 | 当前单一默认行 |
| `User` | 用户占位 | `role`(11 常量) `department`；表先建不接认证 |
| `Client` | 甲方 | name/phone/email；签约按 phone 归并 |
| `Project` | **主数据脊柱** | `code`(对外唯一) `area` `clientId`→Client `status`(6 态) `contractAmount`(0=未录入哨兵) `startDate/endDate/actualEndDate` `designer/pm/inspector/budgetAnalyst`；8 个模块的反向关系都挂它 |

`Project` 是全案关联主键：所有模块表经 `projectId` 外键引用它（`Project.id` 程序内关联、`Project.code` 对外唯一）。

### 3.2 模块私有实体（均经 projectId 外键引用 Project）
- **budget**：`CatalogCategory`(科目) → `CatalogItem`(模板项) ；`BudgetQuote`(报价单，一项目一单 `projectId@unique`，`taxRate` 默认 0.03，`lockedAt`) → `QuoteItem`(明细快照)。
- **crm**：`Lead`(线索，`stage` 5 态、`phone` 归并键、`projectId@unique` 签约回写) → `FollowUp`(跟进，Cascade)。
- **design**：`DesignTask`(`status` 5 态、`assigneeId/reviewerId` 逻辑引用) → `TaskSubmission`(版本化提交，`version` 自增、`result` pending/approved/rejected、`rejectReason`)。
- **schedule**：`ProcessTemplate`(11 工序×3 面积档) ；`ScheduleTask`(工序快照，`progress` 0–100、`status` 3 态) ↔ `ScheduleTaskDependency`(自引用依赖中间表，支持非线性)。
- **quality**：`CheckItem`(检查项库，按 stage=工序名映射) ；`AcceptanceNode`(工序完工自动生成，`status` 4 态 pending/submitted/returned/passed，`taskId` 逻辑引用可悬垂) → `NodeCheck`(检查项快照行) ；`Issue`(问题台账，`status` 3 态 open/rectified/closed，`nodeId` 可空=手工建)。
- **finance**：`FinanceRecord`(收支，`type` income/expense、`category` 6 值、`amount` 恒正方向由 type 定) ；`PaymentNode`(五段计划，`amountDue` 快照、`trigger` none/stages/all、`unlocksAt` 日期锁、`paid/paidAt/paidBy` 唯一落库执行事实——**解锁态不落库**)。

完整 schema（含每字段注释）见 **附录 A**。

---

## 4. 逐模块交付与关键决策

### M1a 平台壳 + 预算只读页
registry 动态导航外壳 + 共享核心域 + 预算实体 + 只读报价页与实时看板。验证：build 绿、金额手算。

### M1b 预算报价模块（端到端可编辑）
- A2 科目库 `/budget/catalog`：Category/Item 全套 CRUD、搜索、上下排序、抽屉编辑。
- A3 报价明细编辑器：选入生成快照、行内改编号/名称/单位/单价/数量、增删行、排序、整表保存、脏状态提示。
- A4 编辑器改单栏版式（汇总条上移、状态 Badge 改 outline 守单点 accent）。
- B1 A4 打印 `/budget/[projectId]/print`：封面+费用汇总+分科目明细+签字栏，自有 print.css。**真 PDF 实测 3 页**。
- B2 科目分布 `/budget/[projectId]/stats`；B3 项目设置 `/budget/[projectId]/settings`（`updateProject`，编号唯一性排除自身）。

### M2-A 全案主脊 schema
`Project` +7 可空列（合同额/户型/风格/渠道/巡检/预算员/实际完工）+ status 纯新增 design/acceptance 两态（零行迁移）；建 `Lead`/`FollowUp`；`User.department` + `USER_ROLE` 11 角色常量；`BudgetQuote.lockedAt`；新建 `core/domain/health.ts` 派生层（进度+三色灯，无 prisma、非 emoji）。
**关键决策**：主脊共享表集中一次定稳，私有表随模块下沉。曾纠正一处偏差——角色常量一度被编成通用公司角色，改回装修 11 角色（boss/ops/biz_mgr/designer/design_asst/floor_plan/construction/rendering/budget_mgr/pm/inspector + viewer 占位）。

### M3 商务线索（CRM）
- 建 `crm` 模块（manifest + registry 接线、`rbac.ts` 骨架、Lead list/create/advanceStage、`/crm` 列表+新建）。
- **签约 `signLead`**：事务内按手机号归并 Client（命中不覆盖 name）、幂等、建项目回写 `Lead.projectId`+stage=signed。
- 线索详情抽屉 + 跟进时间线（超 3 天未跟进标 danger 红）；5 阶段看板（拖拽仅向前推进 + 按钮兜底）。
- **抓出的真 bug（集成门禁才抓到）**：`signLead` 与 `createProject` 各开独立事务，SQLite 下后者看不见前者未提交的 Client → 改为 `createProject(input, tx?)` 事务传播，全程一个事务。**教训固化**：跨函数复用事务必须显式传 `tx`。

### M4 项目中心（六合一详情）
- 建 `projects` 模块；`/projects` 管理列表（卡片/表格双视图 + status 筛选）；`/projects/[id]` 六 Tab（基础信息/预算收支/人员分配/设计/工期/质量）。
- 详情读模型 `projectDetail.ts` 经 prisma 直读 + 复用 core `computeTotals`/`groupByCategory`（不 import budget 内部）。
- **技术债清理**：报价计算口径从 budget 上收 `core/domain/pricing.ts`，budget 与 projects 都从 core 引，消除跨模块计算耦合。
- 诚实占位：无源的进度/合同额显灰「未接入」不造假绿。

### M5 设计管理
- 建 `design` 模块；`DesignTask`/`TaskSubmission` 两表（assigneeId/reviewerId 存 userId 为 P4 铺路）。
- `/design` 看板**双视角**（全部/指派给我，`?scope=` 深链）+ 按状态分列 + 逾期红点。
- 执行者提交：`createSubmission` 单 `$transaction` 原子做 version=max+1→建提交→推进 status=submitted（避开 M3-d2 嵌套事务坑）。
- 审核状态机：`reviewSubmission`（只审 pending 版防重复、**退回必填原因**）；`reworkRate` 派生指标（主口径=有退回任务数/有提交任务数）。
- 设计日历：月视图纯函数（周一起始 6×7）+ 色片 + 今日单点描边。

### M6 时间管控（排程）
- 建 `schedule` 模块；`ProcessTemplate`/`ScheduleTask`/`ScheduleTaskDependency` 三表。
- 纯函数 `plan.ts`：面积定档（11 工序×3 档=54/76/107 天）+ 链式排期（无缝无叠）+ 拓扑无环校验 + 进度联动。
- **三项架构决策**：① 工序依赖=自引用中间表（生成落线性链，结构支持非线性，拓扑无环由纯函数校验）；② 进度/状态联动唯 `applyProgressUpdate`（0=重置清实际起止 / 1–99=进行中 / 100=完成且补写不覆盖已有完成日）；③ 排程快照语义 + 排程 100%→验收节点的副作用留 M7。
- `/schedule` 预警看板（红/黄/绿/灰四区，复用 health.scheduleLight）；`/schedule/[projectId]` **甘特 SVG**（双轨计划条+进度条、依赖肘线、今日竖线、周/日缩放、拖拽调期按天吸附）；`/schedule/templates` 模板库行级编辑（先全量预校验再写）。

### M7 质量管控
- 建 `quality` 模块；4 张私有表（CheckItem/AcceptanceNode/NodeCheck/Issue）。
- **core 整合器 `syncAcceptanceNodes`**：quality 表唯一跨模块写入点——排程更新进度**同事务**调用（工序 100%→建节点、回落清 pending），各读取入口幂等兜底自愈。
- 节点 4 态 + 问题 3 态机；「整改中」由关联问题**派生**显示；重提门控（关联问题全部非 open 才可重提）。
- 提交/审核闭环：审核退回**同事务建 Issue**；问题台账三维筛选 + 整改/复验通过·关闭/复验退回再锁全链；手工新建问题。
- 质量档案：时间轴（纯函数排序 + 同刻节点优先）+ A4 打印三件套。影像 DEFERRED（详情页占位说明条）。

### M8 财务基础（四单元，最近完成）
- **a 基座**：建 `finance` 模块（改名「财务管控」避免与 budget 撞名）；`FinanceRecord`+`PaymentNode` 两表；共享口径 `core/domain/ledger.ts`；五段付款纯函数 `payment.ts`；`/finance` 只读台账；补 M2-A 欠的**合同额录入入口**（`updateProject` 加可选字段 + 项目设置表单加行）。
- **b 台账写入**：收支 CRUD + 新建/编辑/删除界面。`NewRecordModal` 做**类型↔科目联动**（收入侧 contract/change/refund 与支出侧 material/labor/other 互斥，防错账第一道闸）。集成者修一处真缺陷：编辑抽屉原放可改「项目」下拉但 `updateRecord` 不写 projectId（改了静默不生效）→ 裁断归属项目**只读**（更正走删除重建）。
- **c 付款计划**：五段生成（三守卫：项目存在/已有段拒/合同额≤0 拒）+ 清空（含已付段拒）+ 标记已付**硬门控**（未解锁直接拒）+ 撤销。`markPaid` **绝不写 FinanceRecord**（两本账分离）。**M7→段解锁派生回环**：验收节点 passed 后对应段读取时由 `paymentUnlockState` 派生解锁，**不落库**。
- **d 项目中心接线 + 视觉收口**：`projectDetail.ts` 加 `HubFinance`（prisma 直读 + 口径走 core，不 import finance 内部）；项目中心补毛利卡 + 预算灯接 `budgetLight` 真值；M7 两处「付款联动将在 M8 接入」文案改真链；`/finance` 汇总条 V0.3 阶梯权重收口（毛利主级、其余次级）。

**M8 四项架构决策**：① 解锁=派生不落库（代价：无段级解锁时刻流水）；② 两本账分离（台账=现金事实手录 / 计划=触发与达成度，标记已付不自动生成收入记录，两数不一致是业务事实、计划页给诚实对照条不静默对齐）；③ `health.ts` 不改（预算灯保持「已收 vs 合同额」=合同执行进度语义），毛利率色档另置 `ledger.marginLight`；④ 不做打印（v5.1 无对账单打印页）。

---

## 5. 核心计算口径（可逐行审计的逻辑）

### 5.1 报价口径（`core/domain/pricing.ts`）
```
round2(n) = Math.round((n + EPSILON) * 100) / 100        // 消浮点尾差
lineTotal(unitPrice, quantity) = round2(unitPrice * quantity)
directSubtotal = round2(Σ lineTotal)
tax            = round2(directSubtotal * taxRate)         // taxRate 默认 0.03
grand          = round2(directSubtotal + tax)
unitCost       = area > 0 ? round2(grand / area) : null   // 面积≤0 不造数
```
金额一律两位小数；服务端初值、客户端即时重算、列表汇总都调同一函数保证一致。

### 5.2 健康度三色灯（`core/domain/health.ts`，无 prisma、纯函数）
```
overallProgress(tasks) = 工序 progress 均值（Math.round 取整）；无工序→0
scheduleLight({endDate, actualEndDate, progress}, today):
  actualEndDate > endDate → red
  endDate 缺失 → green（降级）
  距计划完工 ≤7 天 且 进度<80 → yellow
  否则 → green
qualityLight({openIssues, pendingNodes}): openIssues>0→red; pendingNodes>0→yellow; 否则 green
budgetLight({contractAmount, changeTotal, paidTotal}):
  total=contract+change; total≤0 → green（哨兵降级，UI 另判显灰）
  paidTotal>total → red（超付）
  paidTotal>0.85*total → yellow
  否则 → green
```
【把握】高。语义清晰、边界明确。可质疑点：`budgetLight` 的 0.85 阈值与「超付→红」是拍脑袋还是有业务依据。

### 5.3 财务口径（`core/domain/ledger.ts`，无 prisma、纯函数）
```
receivedTotal(records) = Σ(type=="income" 的 amount)    // 按 type 取数不看符号；脏值/负/NaN 按 0
expenseTotal(records)  = Σ(type=="expense" 的 amount)
netCash(records)       = round2(received - expense)
grossProfit({contractAmount, changeTotal, expenseTotal}) = round2(contract + change - expense)
marginRate(...)：分母 (contract+change) ≤0 → 返回 null（不造 0%）；否则 四位小数舍入
marginLight(rate)：null→neutral；>0.25→green；≥0.15→yellow（含 0.25、0.15 临界归黄）；<0.15→red
```
【把握】高。可质疑点：毛利率色档临界 0.25/0.15 归黄是刻意定死（v5.1 原文有歧义），审查者可判断归档是否合理。

### 5.4 付款五段与派生解锁（`modules/finance/payment.ts`，无 prisma、纯函数）
五段模板（顺序即 order）：
| order | 段名 | 比例 | trigger | triggerStages |
|---|---|---|---|---|
| 1 | 开工款 | 30 | none | — |
| 2 | 水电完成款 | 20 | stages | 水电工程 |
| 3 | 主体完工款 | 30 | stages | 泥工,防水,地面,天花 |
| 4 | 竣工验收款 | 15 | all | — |
| 5 | 保修金 | 5 | none | 另带 unlocksAt=竣工+12月 |

```
buildPaymentPlan(contract): contract≤0→[]
  前四段 amountDue=round2(contract*percent/100)；末段=round2(contract−Σ前四段)  // 尾差归末段，五段之和恰等合同
paymentUnlockState(node, nodes, today) 优先级：
  1. unlocksAt 未到 → 未解锁（保修期未至，日期起可收）  // 日期优先
  2. trigger==stages：所列工序有未 passed 或无对应节点 → 未解锁（列 missing）
  3. trigger==all：存在非 passed 节点 → 未解锁（尚缺 N 项）
  4. 否则 → 解锁
canMarkPaid(state, paid)：已付→false（只能撤销）；未解锁→false；解锁且未付→true  // 硬门控
```
**关键设计**：工序↔付款段按**名字匹配**（`triggerStages` 存工序名，与 `AcceptanceNode.name` 同字面），不建外键——这是跨模块解耦的有意选择。拆除/墙面/乳胶漆/定制/水电安装/竣工清洁 六道工序不挂中间段，由竣工段（all）兜住。
【把握】中高。可质疑点见 §8：① 名字匹配（而非 id）在工序改名时的脆弱性；② 五段↔11 工序映射是集成者裁断（v5.1 未写），是否合理；③ 派生不落库导致无「解锁时刻」审计流水。

---

## 6. 验证体系（判断"通过"是否可信）

**11 个门禁脚本 + 截图 + PDF**，全部可重跑：

| 脚本 | 类型 | 断言 | 拦什么 |
|---|---|---|---|
| verify-quote | 纯函数 | 37 | 报价行小计/分组/税/总价/单方/快照列/单一口径 |
| verify-health | 纯函数 | 20 | health 四函数边界 + 输出禁 emoji |
| verify-crm | 纯函数 | 11 | 签约归并纯函数（phone 归并/阶段常量） |
| verify-design | 纯函数 | 28 | 设计状态机谓词 + reworkRate 独立整数预言机 |
| verify-schedule | 纯函数 | 55 | 面积定档/链式排期/拓扑/进度联动/逾期/shiftDates |
| verify-quality | 纯函数 | 108 | 节点/问题状态机 + 时间轴排序/tone/href |
| verify-finance | 纯函数 | 115 | ledger 六函数 + marginLight 五档 + payment 全路径 + 收支互斥 |
| verify-sign | 隔离库集成 | 12 | 签约端到端（幂等/归并/回写）——曾抓出事务传播 bug |
| verify-schedule-gen | 隔离库集成 | 27 | 排程生成/清空/更新端到端 |
| verify-quality-flow | 隔离库集成 | 94 | 同步建删/进度联动/提交审核/退回建问题/复验退回再锁全链 |
| verify-finance-flow | 隔离库集成 | 54 | 台账建改删即时复算 + 付款生成/守卫/门控 + **M7→段派生解锁回环** |

**方法论要点**：
- 纯函数门禁**直接 import 生产代码**（Node 24 原生跑 TS），金额类断言配**独立整数分（cent）预言机**复算——不"抄一遍被测算法当测试"。
- 集成门禁跑在**隔离临时库**（`migrate reset → seed → tsx 跑`），会改库不可直接重跑（脚本头有初态守卫拦截）。
- **qa-shots**：起生产构建逐页无头截图（自动挑空闲端口 + 比对 BUILD_ID 防残留服务假绿 + 阻塞杀进程树防孤儿）。**print-pdf**：打印视图导真 A4 PDF。
- **验收纪律（血泪）**：`build 绿 + 断言过 ≠ 页面正确`。历史上多个真缺陷（科目库空壳、编辑器列宽挤压、打印页数、毛利率数值定义了却没渲染、编辑态项目改了不生效）**全靠截图/代码审查发现，门禁一个都没拦住**。375 是否溢出用同源 iframe DOM 探针量 `scrollWidth ≤ innerWidth`，不信肉眼。

【把握】验证体系设计较扎实。可质疑点见 §8：门禁覆盖的是**口径/状态机/端到端事务**，但**业务规则本身对不对**（如五段映射、色档阈值）不在门禁射程内——那需要领域专家评审。

---

## 7. 已知风险、缺陷与遗留（诚实清单）

**未关闭缺陷**：
1. **375px 预算详情页横向溢出**——成因未定位（已排除 flex-wrap/min-w-0/overflow-x-auto 链条），未打猜测性补丁，待单开一次 DOM 排查。
2. **设计令牌未收口**——实测越界：字号 32 处、间距 11 文件（含 5 个 core/ui 组件）。根因=Tailwind 默认刻度未关。已验证「卡里写死刻度白名单」能防住（后续模块新文件零越界），但未从构建层面根治。
3. **`prefers-reduced-motion` 全仓缺失**（设计系统硬要求）；hover 时长应为 120ms 非 150ms。
4. **交互写回路径尚未经人手验证**——各模块的增删改、拖拽、打印、生成、标记已付等，自动化只到门禁+截图层，真人点击闭环留待业务方手测。

**有意的取舍/留位（非遗漏）**：
- 变更单 `ChangeOrder`、利润分析（饼图/折线/毛利排行）、`PlatformSetting`（主题插槽+Logo）、发票/税务/报销/收款码/附件/通知、EAV 自定义字段、登录/RBAC、PostgreSQL、数据可视化色板、多品牌换肤——全部 DEFERRED 到 M9+。
- 现场影像（质量详情页占位条）、CheckItem 编辑页（v5.1 无此页，改检查项走 seed）、复验退回不单独成时间轴事件（Issue 无独立退回时间戳）——有意留位。
- 局域网预览防火墙规则 `renovation-preview-3000` 空转未清。

**已否决（REJECTED，勿再提）**：微前端、多独立系统拼门户、自研 Typora 平替。

---

## 8. 请重点审查的具体判断（希望被挑战处）

以下是作者自评**最可能有更优解或埋雷**的判断，恳请审查者逐条给意见（认可/反对/替代方案），不必客气：

1. **SQLite-first + 可移植 schema 一步迁 PG**：现在单用户免登录，SQLite 够用。但外键、事务隔离、并发写（尤其 `syncAcceptanceNodes` 同事务建节点、`createProject` 事务传播）在 SQLite 下的行为，迁 PG 时是否有隐藏坑？可移植约束（禁原生 enum/数组）是否过度限制了 schema 表达力？

2. **派生值不落库 vs 需要审计流水**：付款段解锁态、项目进度、三色灯都读取时现算。代价是没有「何时解锁/何时变红」的历史。对经营系统，**这些状态变迁的时间线是否其实是刚需**（对账、追责、复盘）？不落库省了事但丢了审计，值不值？

3. **两本账分离**（计划已标记已付 vs 台账实际入账，允许不一致、只给对照条不自动对齐）：这符合"现金事实与计划是两回事"的直觉，但也可能让老板看到两个不同的"已收"数而困惑。**是否应该提供一键对账/差异定位**，而非仅诚实展示？

4. **工序↔付款段按名字匹配**（`triggerStages` 存工序名字符串，非 id 外键）：解耦漂亮，但工序改名（如"水电工程"→"水电安装"）会让已生成的付款段静默失配、永不解锁。**是否需要某种改名保护或 id 化**？同理 `CheckItem.stage`、`AcceptanceNode.name` 都靠名字。

5. **五段↔11 工序的映射是集成者拍板**（v5.1 只给段名比例没给映射）：水电段挂"水电工程"、主体段挂泥工/防水/地面/天花、其余六工序由竣工段兜。**这个映射是否符合装修行业实际收款节点**？比例 30/20/30/15/5 呢？

6. **未解锁硬门控、不给绕口子**（现场"先付后验"只能走台账录收入、不能在计划页强行标记已付）：纪律性强，但真实工地常有"领导特批先收"的情况，**纯靠台账承接是否够**？

7. **快照不回溯**（改模板/合同额不回溯历史报价/排程/付款计划）：财务与合同领域合理（签约期约定），但**用户改错合同额后，已生成的付款计划金额就永久停在旧快照**，只能清空重生成。这个"清空重生成"的恢复路径是否太粗（会丢已标记的已付事实，故清空有守卫）？

8. **状态机谓词 + 门禁覆盖的是"逻辑自洽"，不是"业务正确"**：比如 reworkRate 主口径=有退回任务数/有提交任务数，marginLight 阈值 0.25/0.15，scheduleLight 的 7 天/80% —— 这些**数字本身**没有领域依据支撑，门禁只保证算得对不保证选得对。**哪些阈值需要真实业务数据校准**？

9. **单用户 + 角色模拟 + userId 逻辑引用不建外键**：为 P4 多用户预留了位，但本期所有"录入人/审核人/责任人"都是占位假数据、无真认证。**这种"表建好但不接"的预留，会不会在真正接登录时引发大面积返工**（数据清洗、权限回填）？

10. **验证体系无 UI 交互/无业务规则正确性覆盖**：11 个门禁 + 截图，但没有 e2e 交互测试（点击→状态变化→数字联动），业务规则正确性靠人工。**对一个要上线经营用的系统，这个测试深度够吗**？

---

## 附录 A：完整 Prisma schema（21 model，含字段注释）

权威真源在仓库 `prisma/schema.prisma`，此处全文内联供审查（SQLite provider，可移植：无原生 enum/数组/dbgenerated）。

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

// ── 共享核心域 (core/domain)：预算/项目/设计/排程/质量/财务都挂 Project，禁止模块重复定义 ──
model Organization { id String @id @default(cuid()); name String; slug String @unique; createdAt DateTime @default(now()); clients Client[]; users User[]; leads Lead[]; @@map("organizations") }

model User {                       // 占位表：P4 接登录，本期不实现认证
  id String @id @default(cuid()); orgId String; name String; email String @unique;
  role String @default("viewer"); department String?; createdAt DateTime @default(now());
  org Organization @relation(fields:[orgId], references:[id]); @@map("users")
}

model Client {                     // 甲方；签约按 phone 归并
  id String @id @default(cuid()); orgId String; name String; phone String?; email String?; notes String?; createdAt DateTime @default(now());
  org Organization @relation(fields:[orgId], references:[id]); projects Project[]; @@map("clients")
}

model Project {                    // ★ 主数据脊柱：所有模块经 projectId 外键引用它
  id String @id @default(cuid()); code String @unique; name String; address String?;
  area Float @default(0);          // 建筑面积㎡；0 时单方造价不可算
  clientId String; designer String?; pm String?;
  status String @default("draft"); // draft/design/in_progress/acceptance/completed/archived
  startDate DateTime?; endDate DateTime?; contractAmount Float @default(0); // 0=未录入哨兵
  houseType String?; style String?; source String?; inspector String?; budgetAnalyst String?; actualEndDate DateTime?;
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt;
  client Client @relation(fields:[clientId], references:[id]);
  quotes BudgetQuote[]; lead Lead?; designTasks DesignTask[]; scheduleTasks ScheduleTask[];
  acceptanceNodes AcceptanceNode[]; issues Issue[]; financeRecords FinanceRecord[]; paymentNodes PaymentNode[];
  @@map("projects")
}

// ── 预算模块 (modules/budget) ──
model CatalogCategory { id String @id @default(cuid()); name String; order Int @default(0); createdAt DateTime @default(now()); items CatalogItem[]; @@map("catalog_categories") }
model CatalogItem { id String @id @default(cuid()); categoryId String; code String; name String; unit String @default("项"); defaultPrice Float @default(0); defaultQty Float @default(1); materials String @default(""); sop String @default(""); order Int @default(0); createdAt DateTime @default(now()); category CatalogCategory @relation(fields:[categoryId], references:[id]); @@map("catalog_items") }
model BudgetQuote { id String @id @default(cuid()); projectId String @unique; taxRate Float @default(0.03); status String @default("draft"); note String?; lockedAt DateTime?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; project Project @relation(fields:[projectId], references:[id]); items QuoteItem[]; @@map("budget_quotes") }
model QuoteItem {                  // 明细快照自 CatalogItem，非引用：改模板不回溯历史报价
  id String @id @default(cuid()); quoteId String; categoryName String; code String; name String; unit String @default("项"); unitPrice Float @default(0); quantity Float @default(1); materials String @default(""); sop String @default(""); order Int @default(0);
  quote BudgetQuote @relation(fields:[quoteId], references:[id]); @@map("quote_items")
}

// ── 商务线索 (modules/crm) ──
model Lead { id String @id @default(cuid()); orgId String; code String @unique; name String; phone String?; estate String?; area Float @default(0); style String?; budgetRange String?; source String?; stage String @default("leads"); intentLevel String @default("medium"); assignee String?; lastFollowAt DateTime?; nextFollowAt DateTime?; projectId String? @unique; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; org Organization @relation(fields:[orgId], references:[id]); project Project? @relation(fields:[projectId], references:[id]); followUps FollowUp[]; @@map("leads") }
model FollowUp { id String @id @default(cuid()); leadId String; date DateTime @default(now()); content String; nextFollowAt DateTime?; createdAt DateTime @default(now()); lead Lead @relation(fields:[leadId], references:[id], onDelete: Cascade); @@map("follow_ups") }

// ── 设计管理 (modules/design)：assigneeId/reviewerId 存 userId 为逻辑引用，不建到 User 的 @relation ──
model DesignTask { id String @id @default(cuid()); projectId String; code String @unique; title String; type String; status String @default("pending"); assigneeId String?; reviewerId String?; requirement String @default(""); deadline DateTime?; priority String @default("medium"); createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; project Project @relation(fields:[projectId], references:[id]); submissions TaskSubmission[]; @@index([projectId]); @@index([assigneeId]); @@map("design_tasks") }
model TaskSubmission { id String @id @default(cuid()); taskId String; version Int; note String @default(""); assetRef String?; submittedBy String; result String @default("pending"); rejectReason String?; reviewedBy String?; reviewedAt DateTime?; createdAt DateTime @default(now()); task DesignTask @relation(fields:[taskId], references:[id], onDelete: Cascade); @@unique([taskId, version]); @@map("task_submissions") }

// ── 时间管控 (modules/schedule) ──
model ProcessTemplate { id String @id @default(cuid()); name String; order Int; tier String; days Int; createdAt DateTime @default(now()); @@unique([tier, order]); @@map("process_templates") }
model ScheduleTask {               // 工序快照自模板：改模板不回溯已生成排程
  id String @id @default(cuid()); projectId String; name String; order Int; startDate DateTime; endDate DateTime; actualStart DateTime?; actualEnd DateTime?; progress Int @default(0); status String @default("pending"); ownerId String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt;
  project Project @relation(fields:[projectId], references:[id]); deps ScheduleTaskDependency[] @relation("sch_dep_task"); dependents ScheduleTaskDependency[] @relation("sch_dep_dependson");
  @@index([projectId]); @@index([ownerId]); @@map("schedule_tasks")
}
model ScheduleTaskDependency { id String @id @default(cuid()); taskId String; dependsOnId String; createdAt DateTime @default(now()); task ScheduleTask @relation("sch_dep_task", fields:[taskId], references:[id], onDelete: Cascade); dependsOn ScheduleTask @relation("sch_dep_dependson", fields:[dependsOnId], references:[id], onDelete: Cascade); @@unique([taskId, dependsOnId]); @@map("schedule_task_deps") }

// ── 质量管控 (modules/quality)：node.taskId 为对 ScheduleTask 的逻辑引用（跨模块不建 @relation） ──
model CheckItem { id String @id @default(cuid()); stage String; name String; standard String; order Int; createdAt DateTime @default(now()); @@unique([stage, order]); @@map("check_items") }
model AcceptanceNode { id String @id @default(cuid()); projectId String; taskId String? @unique; name String; order Int; status String @default("pending"); submitNote String @default(""); submittedBy String?; submittedAt DateTime?; reviewedBy String?; reviewedAt DateTime?; returnReason String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; project Project @relation(fields:[projectId], references:[id]); checks NodeCheck[]; issues Issue[]; @@index([projectId]); @@index([status]); @@map("acceptance_nodes") }
model NodeCheck { id String @id @default(cuid()); nodeId String; name String; standard String; order Int; result String?; note String @default(""); createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; node AcceptanceNode @relation(fields:[nodeId], references:[id], onDelete: Cascade); @@unique([nodeId, order]); @@map("node_checks") }
model Issue { id String @id @default(cuid()); projectId String; nodeId String?; title String; desc String @default(""); severity String @default("normal"); status String @default("open"); reportedBy String; assigneeId String?; dueDate DateTime?; rectifyNote String?; rectifiedAt DateTime?; recheckNote String?; closedAt DateTime?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; project Project @relation(fields:[projectId], references:[id]); node AcceptanceNode? @relation(fields:[nodeId], references:[id], onDelete: SetNull); @@index([projectId]); @@index([status]); @@index([severity]); @@map("issues") }

// ── 财务管控 (modules/finance)：付款段解锁态【不落库】，读取时由 payment.ts 派生 ──
model FinanceRecord {              // 收支台账：录入即入账（无审批态）；amount 恒正，方向由 type 定
  id String @id @default(cuid()); projectId String; type String; category String; amount Float; date DateTime; description String @default(""); recordedBy String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt;
  project Project @relation(fields:[projectId], references:[id]); @@index([projectId]); @@index([type]); @@index([date]); @@map("finance_records")
}
model PaymentNode {                // 五段计划：amountDue 快照自生成时合同额；paid/paidAt/paidBy 是唯一落库执行事实
  id String @id @default(cuid()); projectId String; order Int; name String; percent Float; amountDue Float; trigger String; triggerStages String @default(""); unlocksAt DateTime?; note String @default(""); paid Boolean @default(false); paidAt DateTime?; paidBy String?; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt;
  project Project @relation(fields:[projectId], references:[id]); @@unique([projectId, order]); @@index([projectId]); @@map("payment_nodes")
}
```

（注：为紧凑起见部分 model 压成单行；字段与语义与仓库 `prisma/schema.prisma` 一致。§5.4 的五段映射表与 §3 的字段说明是审读逻辑，此处为权威结构。）

## 附录 B：模块与路由清单

- **8 个业务模块**：budget / crm / projects / design / schedule / quality / finance（+ registry 注册表、core/domain 共享层）。
- **22 条路由**：`/` 首页 · `/budget`(+`/[projectId]`+`/print`+`/stats`+`/settings`) · `/budget/catalog` · `/crm` · `/projects`(+`/[id]` 六 Tab) · `/design`(+`/[id]`) · `/schedule`(+`/[projectId]`+`/templates`) · `/quality`(+`/nodes/[id]`+`/issues`+`/archive`+`/archive/[projectId]`+`/print`) · `/finance`(+`/payments`)。
- **深链参数**：`?view=`（收支/看板列表切换）`?scope=`（设计视角）`?month=`（日历）`?tab=`（项目 Tab）`?taskId=`/`?projectId=`（跨模块定位）。
- 代码规模：130 个 ts/tsx 文件；schema 6 条迁移、旧数据零破坏。

---

*本简报由集成者（AI）维护，截至 2026-10-11。所有数字（断言数、模型数、路由数）取自实测。审查意见请逐条对应 §8，或指出本简报未披露的盲区。*
