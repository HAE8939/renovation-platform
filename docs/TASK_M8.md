# 任务卡 M8 · 财务基础（`finance` 模块）

> 状态：**待执行**（架构决策已与 HAE 确认 2026-10-10，见下） ｜ 承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 §5-M8；业务细节源 `Full-Service Project Management/装修经营管理平台 — 网站设计指导文档 v5.1.md` §5.9 / §6.7.3 / §6.7.4 / §6.7.5（**只取业务不取皮**）
> 前置：M2-A 主脊（`Project.contractAmount` + `core/domain/health.ts`）+ M3~M7 全部合入；**接活 M7 留的「验收通过 → 付款节点解锁」回环**（`TASK_M7.md` §7-6 的欠账）；`health.budgetLight` 在本 M 接真数据源
> 执行通道：codebuddy（`custom-local:glm-5.2` → 8787 三号池），master 串行；集成者守 build + 断言 + 截图
> **四项架构决策已与 HAE 确认（2026-10-10）**：① 解锁＝**派生**（不落库、不建 core 整合器、不写副作用）；② 两本账**分离**（台账=现金事实手录 / 计划=触发与达成度，标记已付不自动生成收入记录）；③ `health.ts` **不改**（预算灯语义保持"收款 vs 合同额"），v5.1 §6.7.5 的**毛利率色档另置** `core/domain/ledger.ts`；④ 拆**四单元 a~d，不做打印**（v5.1 无对账单打印页）
> 动手前读：`AGENTS.md` §2/§5/§6、`docs/TASK_M7.md`（最近范本：模块注册/纯函数状态机/门禁/接线写法）、`src/core/domain/pricing.ts`（**共享口径母版**：round2 / 金额格式化 / 单一真源上收理由）、`src/core/domain/health.ts`、`src/modules/quality/status.ts`（状态谓词 + tone + 禁 emoji 范本）、`src/modules/design/metrics.ts`（派生指标纯函数 + 预言机范本）、`src/modules/quality/server/issues.ts`（CRUD + 模块内错误类范本）、`src/app/quality/issues/IssueLedger.tsx`（筛选 + 表格 + 抽屉）、`src/app/schedule/[projectId]/ClearScheduleButton.tsx`（清空守卫按钮）、`prisma/seed.ts` 的 `seedQuality()`（幂等 + 自检断言 + 演示回填时间自洽）、`scripts/verify-quality.mjs`（门禁写法）、`scripts/verify-schedule-gen.mts` **头注**（隔离库三步配方）、`prisma/schema.prisma` 尾部、`src/modules/projects/server/projectDetail.ts` + `src/app/projects/[id]/ProjectTabs.tsx`（接线点）、`src/core/ui/{Table,Badge,Modal,Drawer,Input,Button,Card}.tsx`

---

## 0. 目标

新建可插拔 `finance` 模块 = **项目收支与付款计划的对账底座**：手工收支台账（收入/支出双 Tab + 项目筛选 + 汇总条）→ 毛利与毛利率即时正确变化 → 按合同额生成五段付款计划（开工/水电完成/主体完工/竣工/保修金）→ **M7 验收节点通过后，对应付款段自动进入「可收款」态（派生）** → 标记已付 → 项目中心「预算收支」Tab 补毛利、「基础信息」预算灯接真值。

**范围红线**（越界即返工，PLAN §7 / AGENTS §8）：
- **变更单 `ChangeOrder` 不做**（M9）：`changeTotal` 一律传 0 并在调用点注明「变更额留 M9」；不得为"看起来完整"而造假变更数据，也不得建空表。
- **利润分析不做**（M9 驾驶舱）：成本构成饼图、项目毛利率排行、全公司按月营收/毛利折线——**一律不建页面、不建组件、不留占位页**。
- **`PlatformSetting` / 发票 / 税务 / 员工报销 / 收款二维码 / 附件 / 通知** 全部 DEFERRED，本期不碰。
- **「毛利仅老板可见」的角色过滤不做**（PLAN §1 决策④：本期单用户 + 角色切换模拟视角尚未接；`rbac.ts` 有骨架但无消费者）。页面文案**不写**「仅老板可见」——写了就是假承诺。
- **不做 pending/confirmed 审批态**（v5.1 §5.9 有、本平台无审批流与角色，状态机会空转）：录入即入账。
- 跨模块读一律经 `core/db` prisma 直读，不 import quality/schedule/budget/projects/crm/design 的模块内部。**M8 不新增任何跨模块写入点**（派生解锁＝只读；`PaymentNode` 只由 finance 自己写）。
- 不改 `health.ts` 的任何既有函数与公式（20 条断言锁死）；不改 `pricing.ts`；不改 M7 的 `syncAcceptanceNodes` 与 quality 写库路径；**不碰 `core/domain/pricing.ts` 与报价保存路径**。
- **唯一允许动 budget/core 既有文件的例外（M8-a 第 0 项，集成者已判定为前置缺口，非扩范围）**：给 `Project.contractAmount` 补一个录入入口（详见 §3-0）——`core/domain/projects.ts` 的 `UpdateProjectInput` 加**可选** `contractAmount`、`src/modules/budget/server/projects.ts` 的详情取数带出该列、`ProjectSettingsForm.tsx` 加一行输入。除这三处的**加行**外，budget 模块文件一律不动。**因动了 core，合入前 `verify-quote 17` 与 `verify-sign 12` 必须零回退。**

## 1. 关键架构决策（先定，防跑偏）

1. **解锁＝派生，不落库**（决策①）。付款段的「可收款 / 未解锁 + 原因」在读取时由 `paymentUnlockState(node, nodes, today)` 纯函数算出，**库里不存 `unlockedAt`/`unlockStatus`**。理由：M7 验收节点必须落库是因为要挂 `NodeCheck` 快照行；付款段只需知道触发条件满不满足，派生即可自愈、无需事务钩子、无需一次性回填、老库无钩子也自洽，且正合 PLAN §7.6「派生值不落库」。**代价（HAE 已知悉）**：没有"解锁时刻"流水，档案类追溯不做到段级。
2. **两本账分离**（决策②）。`FinanceRecord` = **现金事实**（老板/财务手录，删改自由，毛利与已收款以此为准）；`PaymentNode` = **计划与触发**（应收金额快照 + 解锁派生 + `paid` 标记）。`markPaid` **不建** `FinanceRecord`。两数不一致是**业务事实**（款已计划付、台账未入账），故计划页顶部给一条**诚实对照**：`计划已标记已付 ¥A · 台账已入账合同款 ¥B · 差额 ¥(A−B)`，差额非零标 warning 色，不做静默对齐。
3. **口径落位**（决策③，沿 M4-a `pricing.ts` 上收先例）：
   - `src/core/domain/ledger.ts`（**共享、无 prisma、可 plain-node 直跑**）：`receivedTotal` / `expenseTotal` / `netCash` / `grossProfit` / `marginRate` / `marginLight`。放 core 的理由＝projects 与 finance 两个消费方都要用，跨模块禁引；这也满足 PLAN §7.3「毛利只出现在单一口径文件」。
   - `src/modules/finance/payment.ts`（模块私有纯函数）：`DEFAULT_PAYMENT_STAGES` 五段模板常量、`buildPaymentPlan`、`paymentUnlockState`、`canMarkPaid`、`paymentTriggerLabel`。
   - `src/modules/finance/status.ts`：`type/category/status` 的 label 与 tone 映射（唯一真源）。
   - **毛利 ≠ 预算灯**：`health.budgetLight`（已收 vs 合同额+变更额，超付→红）语义是**合同执行/收款进度**，项目中心那一格灯接它，文案改成「已收 x%」免误读；`marginLight`（毛利率色档）只用于财务页与毛利卡，**不进项目中心三灯位**（不新增第四灯位=不扩范围）。
4. **应收金额＝生成时快照**（承 AGENTS §5「报价快照自科目模板，改模板不回溯历史」的既有语义）。`PaymentNode` 同时存 `percent`（展示"30%"）与 `amountDue`（按生成时合同额算出的快照金额）；**改合同额不回溯已生成计划**，页面在计划头部明示「按签约时合同额生成；合同额变更后如需调整，清空重生成」。`percent` 生成后不提供编辑（要调比例=清空重生成），避免出现"金额与比例打架"的第三种状态。
5. **标记已付＝硬门控**。未解锁的段 `paid` 按钮 disabled + hint 显示未解锁原因（派生结果）。**确需提前收款**的现场场景由**台账录一笔收入**承接（决策②的必然结论：现金事实不受计划门控），不给"绕过门控强行标记已付"的口子——那条口一旦开，解锁回环就失去全部价值。
6. **尾差归末段**：前四段 `round2(contract × percent / 100)`，末段 = `round2(contract − Σ前四段)`，保证五段之和**恰等**合同额（断言必测）。
7. **诚实空态**：项目 `contractAmount == 0` → 生成计划被守卫拒绝并提示「先在项目设置录入合同额」+ 链到 `/budget/[projectId]/settings`；无台账记录 → 空态引导；无验收节点的项目 → 计划页说明「付款段的解锁依赖工序验收节点，本项目暂无验收节点（工序完工后自动生成）」并链到 `/schedule`。

## 2. 拆四个单元（一次一个界面单元，防 429 / 半成品）

| 单元 | 内容 |
|---|---|
| **M8-a** | **前置缺口：合同额录入入口**（`updateProject` 加可选字段 + 项目设置表单加一行）；模块注册（manifest + registry 加一行 + **从 `deferredModules` 删 `finance`**）；schema 迁移建 **2 张私有表**；纯函数 `core/domain/ledger.ts` + `finance/{status,payment}.ts`；**新 `scripts/verify-finance.mjs`**；seed（合同额回填 + 三项目五段计划 + 演示收支撑账 + 已付标记 + 自检断言）；`/finance` **收支台账只读页**（收入/支出双 Tab + 项目筛选 + 汇总条）；`/finance/payments` 占位页防死链；qa-shots 加 `22-finance` |
| **M8-b** | 台账**写入**：`server/records.ts`（create/update/delete）+ `actions.ts` + 新建 Modal / 行内编辑抽屉 + 校验（项目必选存在、金额 > 0、科目与类型枚举匹配、日期有效）；汇总条与毛利随写入即时变化；集成门禁 `verify-finance-flow.mts`（**新建**，台账增删改→毛利/已收即时复算部分） |
| **M8-c** | **付款计划页** `/finance/payments`：五段生成（含守卫）/ 清空 / 时间线视图（触发条件文案 + 解锁态 + 标记已付 + 撤销已付）/ 对照条；`server/payments.ts`；集成门禁扩（生成幂等 + 清空守卫 + 门控 + **M7 节点 passed → 段解锁派生联动**）；qa-shots 加 `23-finance-payments` |
| **M8-d** | 接线收尾：项目中心「预算收支」Tab 补**毛利卡**（毛利额 + 毛利率 + 色点）、「基础信息」预算灯接 `budgetLight` 真值（文案「已收 x%」）+ M7 节点详情 passed 态的「付款联动将在 M8 接入」文案改为指向 `/finance/payments?projectId=` 的真链（**只给 URL，不读 finance 表**）+ `docs/STATUS.md` 更新 + 全量截图 + 375 探针复核 |

## 3. M8-a 详细范围

- **0）前置缺口：合同额录入入口**（集成者实测发现，HAE 已知悉）——`contractAmount` 目前**只有签约（`SignLeadModal` → `createProject`）一条入口**：`UpdateProjectInput`（`src/core/domain/projects.ts`）**没有** `contractAmount` 字段，`updateProject` 也不写它，`ProjectSettingsForm.tsx` 表单项里没有这一行。后果＝非签约项目永远进不了合同额，而 M8 的毛利、五段计划、预算灯、生成守卫**全部依赖合同额**（M2-A §1.1-J「财务锚点前置」的下游第一次真正用到它）。本单元补齐：
  - `UpdateProjectInput` 增可选 `contractAmount?: number`；`updateProject` 里按 `createProject` 同源写法处理（`Number.isFinite` 才写、**负数抛中文校验错「合同额需为非负数字」**、`undefined` = 不改此列、`0` = 未录入哨兵）。
  - `src/modules/budget/server/projects.ts` 的项目详情取数带出 `contractAmount`；`src/app/budget/[projectId]/settings/page.tsx` 的 `values` 透传；`ProjectSettingsForm.tsx` 在「建筑面积」附近加一行「合同额（元）」（数字输入、`hint` 写明「0 或留空＝未录入，影响毛利与付款计划」、右对齐 `num`）。
  - 项目设置页原五项行为**一律不动**；此改动仅"加一行 + 加一个可选字段"。
- 新建 `src/modules/finance/manifest.ts`：`id="finance"`、**`name="财务管控"`**、`description="项目收支台账、付款计划与毛利粗算"`、`icon="财"`（单字符非 emoji）、`order=8`（PLAN §6 目标序 `…quality(6) · budget(7) · finance(8) · hr`）、`entryPath="/finance"`、`requiresAuth:false`、`nav:[{ label:"付款计划", href:"/finance/payments" }]`（静态路径合法；项目级入口只能放页面内带 id/`?projectId=` 的链接，见 STATUS §5 教训）。
  **改名理由（HAE 已确认）**：`deferredModules` 里原占位名是「预算管控」（照搬 v5.1），但本平台 budget 模块已独立存在且叫「装修预算报价」，再叫"预算管控"必然撞名误导——finance 只管钱、不管预算编制。
  `registry.ts`：`modules` 加一行；`deferredModules` 删 `finance` 条目（`dashboard`/`hr` 保持占位）。
- `prisma/schema.prisma` 新增（**权威草案，照抄**；可移植、无 PG 专有类型、枚举用 string + 常量，AGENTS §1）：

```prisma
// ── M8-a：finance 模块私有表（modules/finance）──
// 收支记录与付款段均经 projectId 外键引用共享 core/domain Project。
// 付款段的「解锁/可收款」态【不落库】：读取时由 finance/payment.ts 纯函数派生（决策①）。
// paid/paidAt/paidBy 是唯一落库的执行事实（人工标记），不自动生 FinanceRecord（决策②）。

// 收支台账：录入即入账（无审批态，§0 范围红线）。
model FinanceRecord {
  id          String   @id @default(cuid())
  projectId   String
  type        String   // income | expense
  category    String   // contract | change | refund | material | labor | other
  amount      Float                       // 恒为正数；方向由 type 决定（免符号歧义）
  date        DateTime                    // 发生日期
  description String   @default("")       // 摘要，如「泥工班组第二期人工」
  recordedBy  String?                     // ★ userId（占位当前用户，P4 接登录）
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id])

  @@index([projectId])
  @@index([type])
  @@index([date])
  @@map("finance_records")
}

// 付款段：五段计划，金额生成时快照自 Project.contractAmount（决策④）。
model PaymentNode {
  id             String    @id @default(cuid())
  projectId      String
  order          Int                      // 1..5
  name           String                   // 段名快照，如「水电完成款」
  percent        Float                    // 比例快照（30 = 30%），展示用
  amountDue      Float                    // ★ 应收金额快照（生成时合同额 × 比例，尾差归末段）
  trigger        String                   // none | stages | all  —— 解锁依赖的验收条件
  triggerStages  String    @default("")    // 逗号分隔工序名，仅 trigger=="stages" 用
  unlocksAt      DateTime?                // 可选：不早于此日可付（保修金用；null=无日期约束）
  note           String    @default("")
  paid           Boolean   @default(false)
  paidAt         DateTime?
  paidBy         String?                  // ★ userId
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  project Project @relation(fields: [projectId], references: [id])

  @@unique([projectId, order])
  @@index([projectId])
  @@map("payment_nodes")
}
```

  → `Project` 侧只加两行反向关系：`financeRecords FinanceRecord[]` / `paymentNodes PaymentNode[]`。迁移与 seed 的**执行**归集成者（§6），codebuddy 只写文件。
- **纯函数**（三个文件，全部无 prisma、无 IO、可被门禁直接 import）：
  - `src/core/domain/ledger.ts`：
    - `receivedTotal(records)` = Σ(`type=="income"`)；`expenseTotal(records)` = Σ(`type=="expense"`)；**忽略符号、按 type 取数**，非数字/负数按 0 计（防御）。
    - `netCash(records)` = `round2(receivedTotal − expenseTotal)`。
    - `grossProfit({ contractAmount, changeTotal, expenseTotal })` = `round2(contract + change − expense)`。
    - `marginRate({ contractAmount, changeTotal, expenseTotal })` → 分母 `contract + change` **≤ 0 时返回 null**（合同额未录入=不可算，UI 显「—」不造 0%）；否则 `round2(profit / denominator * 10000) / 10000`（0~1 小数，四位）。
    - `marginLight(rate)` → `null|undefined` ⇒ `"neutral"`；`> 0.25` ⇒ `"green"`；`>= 0.15` ⇒ `"yellow"`；`< 0.15` ⇒ `"red"`。**临界归档**（v5.1 原文「>25% 绿 / 15-25% 黄 / <15% 红」有歧义，本卡定死）：**0.25 归黄、0.15 归黄**。返回 `"green"|"yellow"|"red"|"neutral"`（复用 health 的 `Light` 词汇 + neutral 哨兵，**不 import health.ts** 以免牵动既有断言；本文件自有 `MarginLight` 类型）。
  - `src/modules/finance/payment.ts`：
    - `PAYMENT_STAGE_DEFS`（五段模板常量，顺序即 `order`）：

      | order | name | percent | trigger | triggerStages | 说明 |
      |---|---|---|---|---|---|
      | 1 | 开工款 | 30 | `none` | — | 签约即计划内，无验收依赖 |
      | 2 | 水电完成款 | 20 | `stages` | `水电工程` | 该工序验收节点 `passed` 解锁 |
      | 3 | 主体完工款 | 30 | `stages` | `泥工工程,防水工程,地面工程,天花工程` | 所列工序节点**全部** `passed` |
      | 4 | 竣工验收款 | 15 | `all` | — | 项目**全部**验收节点 `passed` |
      | 5 | 保修金 | 5 | `none` | — | 另带 `unlocksAt`（竣工日 + 12 个月） |

      工序名与 `ProcessTemplate.name` / `AcceptanceNode.name` **同字面**（承 M7 `CheckItem.stage` 的映射策略，跨模块只按名字匹配、不建外键）。`拆除工程/墙面工程/乳胶漆工程/定制工程/水电安装/竣工清洁` 不挂中间段，由 `all`（竣工款）兜住——这是有意的映射裁断，见 §7-4。
    - `buildPaymentPlan(contractAmount)` → 五行 `{order,name,percent,amountDue,trigger,triggerStages,unlocksAtOffsetMonths}`；`contractAmount <= 0` 或非有限数 → 返回 `[]`（调用方据此拒绝生成）。尾差归末段（§1-6），五段之和恰等合同额。
    - `paymentUnlockState(node, nodes, today)` → `{ unlocked: boolean; reason: string; missing: string[] }`，优先级：`unlocksAt` 未到 → 未解锁（「保修期未至，{yyyy-MM-dd} 起可收」）→ `trigger=="stages"` 有工序未 `passed` 或项目无该工序节点 → 未解锁（「待工序验收通过：泥工工程（未通过）」/「（无验收节点）」）→ `trigger=="all"` 存在非 `passed` 节点 → 未解锁（「待全部验收节点通过（尚缺 N 项）」）→ 解锁（「触发条件已满足，可收款」/ `none` 无日期约束时「无验收依赖，可收款」）。**文案中文、禁 emoji**；`missing` 供 UI 列未过工序。
    - `paymentTriggerLabel(node)` → 人读触发条件（「签约即可收」「水电工程验收通过」「主体四项工序验收通过」「全部验收通过」「保修期满后收取」）。
    - `canMarkPaid(state, paid)`（未解锁不可标记已付，§1-5；已付则只可撤销）。
  - `src/modules/finance/types.ts`：`FinanceType` / `FinanceCategory` / `TriggerKind` 类型 + `RECORD_CATEGORIES`（**income**：`contract 合同款` / `change 变更款` / `refund 退款`；**expense**：`material 材料费` / `labor 人工费` / `other 其他支出`）+ `categoriesFor(type)` 纯函数（收入侧不给选材料、支出侧不给选合同款——**这是防错账的第一道闸**）。
  - `src/modules/finance/status.ts`：`RECORD_TYPE_LABEL`（收入/支出）与 tone（income=accent / expense=warning，守单点 accent）、`CATEGORY_LABEL`、`CATEGORY_TONE`（语义 token，禁 emoji、禁彩色图标）、`PAYMENT_TRIGGER_LABEL`。
- **seed**（`prisma/seed.ts` 追加 `seedFinance()`，`main()` 末尾调用；幂等，仿 `seedQuality()` 写法：先 `findUnique`/`count` 判存在再决定 create/skip）：
  1. **合同额回填**（幂等且**不覆盖人工值**：仅当 `contractAmount == 0` 才 update）：

     | 项目 | 面积 | 状态 | 合同额 |
     |---|---|---|---|
     | RP-2026-001 云栖名邸 3 栋 1602 | 128.6 | in_progress | 62,000（与既有报价 ¥61,990.76 同量级，避免演示两数打架） |
     | RP-2026-002 金域蓝湾 2 栋 802 | 110 | in_progress | 160,000 |
     | RP-2026-003 老街 21 号院 | 85 | completed | 128,000 |
     | RP-2026-004 湖畔名庭 8 栋 501 | 140 | draft | **不填（留 0 =「未录入」诚实空态位，用于手测生成守卫）** |
  2. **付款计划**：对 001/002/003 各 `buildPaymentPlan(contractAmount)` 物化五行（幂等：该项目已有 `PaymentNode` 则跳过）。应收金额（合同额整除、无尾差）：001 `18,600/12,400/18,600/9,300/3,100`；002 `48,000/32,000/48,000/24,000/8,000`；003 `38,400/25,600/38,400/19,200/6,400`。保修金 `unlocksAt` = `actualEndDate ?? endDate ?? today` **+ 12 个月**（演示数据日期均在过去一年外→ 未来，故恒"未解锁"，正好演示日期型锁定态）。
  3. **标记已付 + 台账收（两本账保持一致，避免演示数据自相矛盾）**：
     - 003「开工款」`paid=true`、`paidAt`=项目开工日 +2d；「水电完成款」`paid=true`、`paidAt`=水电工程节点 `passed` 日 +1d（**取 M7 seed 已回填的节点时间，保持时序自洽——承 STATUS §5「演示数据时间自洽要主动回填」教训**）。台账对应两笔 `income/contract`：38,400 + 25,600 = 64,000，`date` 与上述 `paidAt` 同日。
     - 001「开工款」`paid=true`；台账 `income/contract` 18,600。002「开工款」`paid=true`；台账 48,000。
  4. **支出台账**（一次一笔、日期取当月，`recordedBy`=占位用户）：001 材料 24,500 + 人工 15,800 = **40,300 → 毛利 21,700 → 35.0% 绿**；002 材料 62,000 + 人工 38,000 = **100,000 → 毛利 60,000 → 37.5% 绿**；003 材料 58,000 + 人工 39,000 + 其他 2,000 = **99,000 → 毛利 29,000 → 22.7% 黄**。**演示数据只出现绿/黄，不造假红**（红档与临界 0.15/0.25 由门禁断言覆盖）。
  5. **自检断言**（报数一律取 DB `count`/`sum` 真值，禁抄常量——STATUS §5 教训）：`financeRecord.count()`=9；`paymentNode.count()`=15；各项目五段 `Σ amountDue` 恰等其 `contractAmount`；003 水电段=已付、主体段=未付；004 无计划行无台账行；`marginRate` 复算 003 落在 `[0.15,0.25]`。
- **`/finance` 台账只读页**（server 组件 + `src/modules/finance/server/records.ts` 的 `listRecords(filters)`；本单元**只读**，写操作归 M8-b）：
  - 顶部：`?view=income|expense` **双 Tab**（默认收入；平行实现 `src/app/finance/ViewToggle.tsx`——先例＝`crm` 与 `projects` 各持一份自己的 ViewToggle，跨模块禁引组件）+ 项目筛选 `?projectId=`（选项=非 archived 项目）。
  - 汇总条（当前项目**全部记录**口径，不受 Tab 切换影响，避免"切个 Tab 总数变了"的误读）：合同额 / 已收款 / 待收款 / 总支出 / **毛利 + 毛利率色点**。口径：已收款=`receivedTotal`；**待收款 = `Σ PaymentNode.amountDue(paid=false)` 与 `合同额 − 已收` 取后者为准**——本卡定死：`待收款 = round2(max(0, contractAmount − receivedTotal))`（收款缺口口径，与计划段解耦），计划页另显"计划未付合计"，两者不同不合并。
  - 表格列：日期 / 科目徽章 / 摘要 / 项目 / 金额（右对齐、`formatCny`）/ 录入人；行序 `date` 倒序、同日按 `createdAt` 倒序。空态：「暂无{收入|支出}记录——台账手工录入」+（M8-b 后）新建按钮。
  - 本单元 `/finance/payments` 建**占位页**（「付款计划将在 M8-c 上线」+ 返回 `/finance`）防 nav 死链。qa-shots 加 `{ name: "22-finance", path: "/finance" }`。

## 4. M8-b / M8-c / M8-d 要点（边界先定，细节按 §0/§1 展开）

- **M8-b 台账写入**（`src/app/finance/NewRecordModal.tsx` + `RecordDrawer.tsx` + `src/app/finance/actions.ts` + `modules/finance/server/records.ts` 扩写）：
  - `createRecord(input)` / `updateRecord(id, input)` / `deleteRecord(id)`——项目必选且存在、`type` 与 `category` 必须匹配（`categoriesFor`）、`amount` 必须为 > 0 有限数（**方向由 type 决定，不接受负数**）、`date` 有效、`description` 可空；模块内 `FinanceRecordError`（仿 `QualityIssueError` 中文报错）。删除=硬删（单用户无回收站要求），但**汇总即时重算**＝派生的天然收益（PLAN §5-M8 完成条件「录支出→毛利即时正确变化」）。
  - Modal 仿 `NewIssueModal`、抽屉复用 `core/ui/Drawer`（编辑 + 删除二次确认，删除按钮 `tone=danger` 描边、不铺红底）。
  - 新 `scripts/verify-finance-flow.mts`（隔离库三步配方照 `verify-schedule-gen.mts` 头注）：台账部分——建/改/删后 `receivedTotal`/`expenseTotal`/`grossProfit`/`marginRate` 在同请求内即时复算正确；非法类别拒绝；负数金额拒绝；不存在项目拒绝。**⚠ 每次跑前先 `migrate reset --force`**（脚本头注写明 + 初态守卫：库非初始态即打印重置命令并退出，承 M7 教训）。
- **M8-c 付款计划页**（`/finance/payments` 去占位 → `PaymentPlanBoard.tsx` + `server/payments.ts` + actions）：
  - 项目筛选 `?projectId=`（默认第一个有计划的项目，无计划项目给空态与生成入口）。头部对照条（§1-2）。
  - `[生成付款计划]`：守卫仿 M6 `generate.ts` 五守卫风格——**已存在任何段则拒绝**（防重复）、`contractAmount<=0` 拒绝并提示先录入合同额（链 `/budget/[projectId]/settings`）、项目必须存在；单事务 `createMany` 五行。`[清空计划]`：**存在 `paid==true` 的段则拒绝**并提示「已标记已付的段不可清空（付款事实会丢失）——如需纠正请先撤销已付」（承 M7「非 pending 永不自动删」的同源判断）。
  - 段卡/段行（垂直时间线，V0.3 无阴影、单点 accent 只给"当前可收段"）：段名 + 比例 + 应收金额 + 触发条件文案（`paymentTriggerLabel`）+ **状态**（已付 / 可收款 / 未解锁+原因 / 缺 `missing` 工序清单）+ 动作 `[标记已付]`（门控 `canMarkPaid`，disabled 时 hint 给原因）/ `[撤销已付]`。
  - 集成门禁扩：生成与 `buildPaymentPlan` 逐段一致 / 重复生成拒绝 / 合同额 0 拒绝 / 清空守卫（含 paid 拒绝）/ 标记已付 + 撤销 / **未解锁拒绝标记** / **派生联动**：把 002「水电工程」`AcceptanceNode.status` 置 `passed` 后**不写任何 finance 表**，重读计划页派生结果即由未解锁变可收款（这条就是 M7 欠的回环，必须断言）/ 改 `contractAmount` 不回溯已生成的 `amountDue` 快照。
  - qa-shots 加 `{ name: "23-finance-payments", path: "/finance/payments" }`。
- **M8-d 接线收尾**：
  - `projects/server/projectDetail.ts`：prisma 直读 `financeRecords` + `paymentNodes`（**只经 core，不 import finance 内部**；口径调 `core/domain/ledger.ts`，段名/触发文案如需则在 `ProjectTabs.tsx` 留局部副本并注明同源，仿 M7-e）。
  - `ProjectTabs.tsx`「预算收支」Tab 补毛利卡：毛利额 + 毛利率 + `marginLight` 色点（neutral 时显「未录入合同额，不可算」）+ 「打开收支台账 →」（`/finance?projectId=`）；「基础信息」预算灯从灰「未接入（M8 起）」改为 `budgetLight` 真值 + 文案「已收 x%」（`changeTotal` 传 0 并注明 M9）。
  - M7 的「付款联动将在财务模块（M8）接入」文案共**两处**（`src/app/quality/nodes/[id]/page.tsx` 的 passed 横幅、`src/app/quality/nodes/[id]/ReviewForm.tsx:74` 的审核确认提示）→ 改为「财务模块已上线：本节点通过即作为付款段解锁依据，见付款计划」+ 横幅处加链 `/finance/payments?projectId=<id>`（**只写 URL，不读 finance 表**）。
  - 收尾：`docs/STATUS.md`（照 M7 收尾格式：§0/§1 表格加 M8 五行、§2 门禁表加两行、§3 决策加 M8 四项、§4 待办更新预算灯条目、§5 补新坑、§8 交接 M9）+ 全量 qa-shots + 375 探针复核 + `pnpm build` 全门禁。

## 5. 硬约束（四单元通用）

- 禁止 git（禁 `git commit`）；禁止 `pnpm dev`；**迁移 / seed 执行由集成者跑，codebuddy 只写代码/schema/seed 文件本身**；唯一绿门 `pnpm build`。
- V0.3 刻度（**写了真能防住，见 STATUS §4-2**）：字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48；无阴影、单点钴蓝 `#3368A0`；`danger` 只用于真错误态；金额右对齐 + `whitespace-nowrap`；表头/按钮不换行；375 不破版；色点非 emoji；`Input` 需定宽时**外层容器定宽**（勿改 `core/ui/Input`，见 STATUS §5 坑）。
- 单一口径：金额一律 `core/domain/pricing.ts` 的 `round2`/`formatCny`；毛利/已收/支出/毛利率/色档只出现在 `core/domain/ledger.ts`；解锁与五段模板只出现在 `finance/payment.ts`；label/tone 只出现在 `finance/status.ts` + `types.ts`。**页面不得各写一套算式、不得出现第二处 `unitPrice×quantity` 式的裸乘除**。
- 跨模块读走 `core/db` prisma 直读，**不 import 其他模块内部**；`health.ts` / `pricing.ts` 只被调用不改；**M8 不新增跨模块写入点**（派生解锁=只读；`syncAcceptanceNodes` 不动）。
- 金额相关断言必须配**独立整数分（cent）预言机**复算（仿 `verify-quote` / `verify-design` 的 reworkRate），不许"抄一遍被测算法当测试"。
- `manifest.nav` 拿不到 `projectId` → 项目级入口只放页面内（`?projectId=` 深链合法）。
- 完成度闸门：宁交完整可编译，不留半成品；门禁脚本 import 真源带 `.ts` 扩展名（勿穿无扩展名 re-export 链，STATUS §5 教训）。
- 新表格/新页面遵循 V0.3 反模板：不做圆角大卡片堆叠、不加装饰图标、不加假趋势图/饼图（利润分析属 M9）。

## 5.1 文件所有权与禁区（每单元开工前对一眼）

| 处置 | 路径 |
|---|---|
| **新建** | `src/modules/finance/**`（manifest / types / status / payment / currentUser / server/*）｜`src/core/domain/ledger.ts`｜`src/app/finance/**`（page / ViewToggle / NewRecordModal / RecordDrawer / payments/* / actions.ts）｜`scripts/verify-finance.mjs`｜`scripts/verify-finance-flow.mts` |
| **允许加行**（仅下列，且只加不改语义） | `prisma/schema.prisma`（尾部两 model + `Project` 两行反向关系）｜`src/modules/registry.ts`（`modules` 加一行、`deferredModules` 删 finance）｜`prisma/seed.ts`（追加 `seedFinance()` + `main()` 一行调用）｜`scripts/qa-shots.mjs`（targets 加 2 项）｜`src/core/domain/projects.ts`（`UpdateProjectInput` 一个可选字段 + `updateProject` 对应写入）｜`src/modules/budget/server/projects.ts`（实为 core 的 re-export，取数自动穿透）、`src/app/budget/[projectId]/settings/page.tsx` + `ProjectSettingsForm.tsx` + `src/app/budget/actions.ts`（透传一列 / 表单加一行 / 提交 parse 透传——actions.ts 系 M8-a 执行记录 §8-1 补记）｜`src/modules/projects/server/projectDetail.ts` + `src/app/projects/[id]/ProjectTabs.tsx`（毛利卡 + 预算灯，M8-d）｜`src/app/quality/nodes/[id]/page.tsx` 的 passed 横幅文案与 `ReviewForm.tsx` 的审核确认提示（M8-d，各只改文案一行 + 一条链接） |
| **禁区（碰即返工）** | `src/core/domain/health.ts`、`src/core/domain/pricing.ts`、`src/core/domain/acceptance.ts`、`src/core/ui/**`、`src/app/layout.tsx`、`src/styles/tokens.css`、`src/modules/budget/{lib,components}/**` 与报价保存路径、`src/modules/quality/{status,timeline}.ts` 与 quality 全部写库服务、`src/modules/schedule/**`、`src/modules/design/**`、`src/modules/crm/**`、既有 `scripts/verify-*.mjs|mts`（**只新增脚本，不改老脚本的断言与阈值**） |

## 6. 门禁与验收（每单元必跑；集成者独立复跑，codebuddy 自述不作数）

- `pnpm build` + `npx tsc --noEmit` + 既有门禁**零回退**：`verify-quote 17` / `verify-crm 11` / `verify-health 20` / `verify-design 28` / `verify-schedule 55` / `verify-quality 108` / `verify-quality-flow.mts 94`（隔离库）/ `verify-schedule-gen.mts 27` / `verify-sign.mts 12`。
- **新 `scripts/verify-finance.mjs`（≥ 45 断言）**：
  - `ledger`：`receivedTotal`/`expenseTotal` 只按 type 取数（含脏值/负数/NaN 防御）、`netCash` 正负两例；`grossProfit` 三例（正常/负毛利/合同额 0）；`marginRate` 分母 ≤0 → `null`（**不许返回 0**）、四位小数舍入；`marginLight` 覆盖 `0.26→green`、**`0.25→yellow`**、`0.2499→yellow`、**`0.15→yellow`**、`0.1499→red`、`null→neutral`；全部金额配整数分预言机复算。
  - `payment`：`buildPaymentPlan` 合同额 62,000/160,000/128,001 三例（**五段之和恰等合同额**、尾差归末段、`percent` 合计 100、order 1..5、`contract<=0 → []`）；`paymentUnlockState` 四路径 × {满足 / 不满足 / 项目无对应节点 / 节点清单空 / `unlocksAt == today` 边界 / 段与日期同时不满足时以日期优先}；`canMarkPaid` 门控真值表；`paymentTriggerLabel`/`paymentStatusLabel` 全覆盖。
  - `types`：`categoriesFor("income")`/`("expense")` 互斥无交集；所有 label/tone 全覆盖；**输出禁 emoji**。
- **新 `scripts/verify-finance-flow.mts`（≥ 32 断言，隔离库三步：`migrate reset/deploy` → `db seed` → `npx tsx` 跑；**改财务写库逻辑时必跑**）**：见 §4-b/§4-c 清单，其中 **M7 节点 `passed` → 付款段派生解锁** 与 **录一笔支出 → 毛利即时变化** 两条是 PLAN §5-M8 完成条件的直译，缺一条即视为未完成。
- 集成者运行序列：`cp prisma/dev.db _scratch/backup/dev.db.<日期>M8前` → `pnpm prisma migrate dev --name add_m8_finance` → `pnpm db:seed` → build → 全门禁 → 截图。
- 截图 `node scripts/qa-shots.mjs`（1440/1280/375）：`/finance` 双 Tab（收入/支出）+ 项目筛选 + 汇总条 + 空态、`/finance/payments` 三态（已付 / 可收款 / 未解锁+原因）+ 004 空态、毛利卡与预算灯；**375 溢出争议用 `public/__probe.html` DOM 探针量 `scrollWidth ≤ innerWidth`，别只信肉眼**（STATUS §5）。
- 手测闭环（M8-d 后，HAE 本人点）：003 看计划页五段（两段已付、一段可收、两段未解锁含保修金日期锁）→ 003 加一笔支出 → 台账汇总与项目中心毛利同步变化 → 撤销该笔 → 数字回到原值；004 点生成 → 被拒并提示录入合同额；002 把「水电工程」节点在质量页走完（提交→审核通过）→ 回计划页看水电段变「可收款」；清空 003 计划 → 被 paid 守卫拒绝。
- 跑完 codebuddy 后 grep `~/.codebuddy/logs/<date>/renovation-platform__*.log` 的 `resolved model=` / `Using custom URL`，确认命中 `http://127.0.0.1:8787/…`（别落回 copilot.tencent.com 内置口）。

## 7. 与 PLAN / v5.1 的偏差与新增（集成者注，均已在 §0/§1 与 HAE 确认）

1. **模块名「财务管控」**（v5.1 称"预算管控"）：本平台 budget 已独立成模块，沿用会撞名误导。
2. **不做 `pending/confirmed` 审批态**（v5.1 §5.9 有）：本期单用户无审批流、无角色，状态机空转；字段不落库，不留死列（红线三）。
3. **`triggerNode` 文本字段 → `trigger` 枚举 + `triggerStages`**（v5.1 §5.9 的 `triggerNode:"项目开工"` 是自由文本）：改为可判定的枚举 + 工序名集合，解锁才能派生、才能断言。
4. **五段↔11 工序的映射由本卡裁断**（v5.1 只写了段名与比例，没写映射）：水电段挂 `水电工程`；主体段挂 泥工/防水/地面/天花；拆除/墙面/乳胶漆/定制/水电安装/竣工清洁 由竣工段（全部通过）兜住。映射是常量，改口径只改 `PAYMENT_STAGE_DEFS`。
5. **保修金用 `unlocksAt` 日期**（v5.1 未给保修期数据源）：生成时按 `actualEndDate ?? endDate ?? today` + 12 个月，避免"永远无法解锁"或"随时可收"两种失真。
6. **应收金额＝快照而非实时派生自合同额**（与"派生值不落库"看似矛盾）：付款计划属**签约期约定**，与报价明细快照同语义（AGENTS §5）；改合同额不回溯历史计划是有意行为，页面明示。
7. **未解锁硬门控 + 台账承接提前收款**（v5.1 未规定）：门控是这条回环的全部价值；现场"先付后验"走台账，不绕门控。
8. **支出类别无「分包费」**（装修实务大头）：严格取 v5.1 的 `material/labor/other` + `refund`，分包归 `other`。若 HAE 要真名目，改 `RECORD_CATEGORIES` 常量即可（不影响表结构）。
9. **`changeTotal` 恒传 0、变更款类别留位不给数据**：变更单属 M9；类别常量保留 `change`（v5.1 §5.9 有），但 seed 不造假变更。
10. **不做利润分析页/饼图/折线/毛利排行**（v5.1 §6.7.5）：M9 驾驶舱；且违反 STATUS §4-2「数据可视化色板 DEFERRED」。
11. **不做打印**（本卡决策④）：v5.1 无对账单打印页，M7 打印因有质量档案才做。
12. **待收款 = 合同额 − 已收（缺口口径），与"计划未付合计"分开显示**：两个数语义不同（缺口 vs 未到期计划），合并会造假一致。
13. **补合同额录入入口**（M2-A 遗留缺口）：`updateProject` 与项目设置表单此前都不含 `contractAmount`，只有签约一条路——M8 若无入口，非签约项目永远算不了毛利、生不成计划、灯也接不上真值。属"下游第一次真正用到锚点时补齐写入侧"，不是新设计。

## 8. M8-a 执行记录与集成者裁定（2026-10-10 合入，commit `95f0bc6`）

codebuddy 自报 5 处偏离，集成者逐条裁定；另自修 2 处。

1. **`src/app/budget/actions.ts` +2 行（parse + 透传 contractAmount）**：**准**。表单提交经 `updateProjectAction → updateProject`，不接线则新加的输入框是空摆设；该文件不在禁区（禁区是 budget `lib/components` 与报价保存路径）。§5.1 所有权表补记此文件。
2. **`ledger.ts` 内联 `round2` 而非 import pricing**：**准**。经 plain-node 直跑的纯函数须自包含（`pricing.ts`/`health.ts`/`design/metrics.ts`/`quality/timeline.ts` 皆如此；`tsconfig` 无 `allowImportingTsExtensions`，Next 侧不能带 `.ts` 后缀 import）。`pricing.round2` 仍是权威定义，两处公式一致由 `verify-finance` 的整数分预言机兜住。
3. **`marginRate` 取 `Math.round(rate*10000)/10000`**：**准，且本卡 §3 原文有笔误**——原写 `round2(rate*10000)/10000`，`round2` 是两位舍入，会把 0.2265625 变成六位小数、与「四位小数」声明自相矛盾。实现按 §6 断言口径（标准四位舍入）落地并注释。
4. **seed 收支记录 11 笔 ≠ 本卡写的 9**：**准，本卡计数笔误**。§3 同时要求 4 笔 income（两本账一致）+ 7 笔 expense（三项目毛利率 35%/37.5%/22.7% 由金额锁死）= 11。金额与毛利约束优先，自检断言取 `=== 11` 并报 DB 真值。
5. **五段之和浮点累加有 1e-11 误差**：**准**。`verify-finance` 用 `round2(sum)===c` 容差比对，另设整数分（cent）硬精确比对，两者并存。

集成者自修（合入前）：
- **支出 7 笔的 `date` 原全取 seed 时刻** → 改为按各自开工日 +12~+55 天落在施工期内（越过今天则钳回昨天）。已竣工项目出现「完工后才买主材」正是 STATUS §5「演示数据时间自洽」那条教训的重演。
- **合同额 hint 措辞** → 原写「0 或留空＝未录入」，实际行为是"留空=不改此列"（`undefined` 不落库），改为「0＝未录入；清空＝保存时不改动此列」。
- **目检抓出的真缺陷**：`/finance` 毛利卡的 `marginText` 定义了却没渲染，页面上只有「毛利率」三个字不显数值——build 绿、tsc 0、115 断言全过都没拦住，靠截图发现（再次印证 STATUS §2「验收纪律」）。

## 9. 阻塞回报优先于瞎猜

遇到以下拿不准的，**先停下回报集成者，别自作主张扩范围、造数或提前实现 M9（变更单/驾驶舱/利润分析）**：

- 「待收款」与「计划未付」在汇总条的**摆放与措辞**；`marginLight` 与 `budgetLight` 在项目中心同屏时的**灯位文案**（哪个灯说明什么，别混成一个）。
- 台账一次编辑金额后**汇总条刷新是走 revalidate 还是客户端乐观更新**（口径必须来自服务端 `ledger.ts`，禁止前端另算一遍）。
- 删除已付段对应台账记录时的**对照条表现**；`unlocksAt` 的"12 个月"月算术跨年边界（`new Date` 月份加法用 UTC，别引 dayjs）。
- 付款段是否要给「应收金额行内改」的口子——**本卡默认不给**（§1-4），若判定要给，先报集成者再定，别顺手加编辑功能。
- 任何"为了页面上好看"而新增的汇总/趋势/占比图形。
