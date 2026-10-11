# 任务卡 M9 · 财务深化 + 驾驶舱 + 自定义字段

> 状态：**M9-a 已合入（2026-10-11）**；M9 余 b/c/d/e 候开卡（边界已与 HAE 确认，见 §1）｜ 承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 §5-M9；业务细节源 `Full-Service Project Management/装修经营管理平台 — 网站设计指导文档 v5.1.md` §6.7（**只取业务不取皮**）
> 前置：M8 财务基础全案结案（`078bcdd`）+ M8.5 修复批（`5e84957`）｜ 执行通道：codebuddy（`custom-local:glm-5.2` → 8787 三号池），master 串行；集成者守 build + 断言 + 截图
> 边界裁定工具：`docs/PLATFORM_EVOLUTION_V0.1.md`（三问：只动自己目录？跨模块只走 core？口径单点？）
> 动手前读：`AGENTS.md` §2/§5/§6 · 本卡全文 · `docs/TASK_M8.md`（最近范本）· `docs/STATUS.md` §5 坑清单

---

## 0. 目标与范围红线

**M9 = 五个单元**：a 变更单（财务深化）→ b 驾驶舱（含商务漏斗 M3-e + 利润两图）→ c EAV 自定义字段 → d 主题/PlatformSetting（+Logo 最简版）→ e 收口附批。

**范围红线**（越界即返工）：
- **报价多版本 DEFERRED**（无真实消费方；多版=去 unique+版本链+编辑器切换 ≈ M8 级工作量，有需求再开）。
- 变更单**不做审批/确认流**（v5.1 有四段状态「待审批→已审批→待客户确认→客户已确认/拒绝」——本期单用户无角色、无客户端，状态机会空转；录入即生效，P4 接角色后评估）。**不做变更单号自动编号**（编号生成有并发坑且无消费方；留位）。**不做附件**（全局 DEFERRED）。
- 驾驶舱：**禁 mock 兜底数字**（PLAN 完成准则）；"绩效排行"数据未全 → 灰/空占位（hr 未建）。
- 图表守 V0.3：**单点 accent + 语义色 + 灰阶，不开彩虹色板**；多系列确有需要时只补 2~3 个中性色阶进 `tokens.css`（须单独裁定）。
- 每个单元过**三问**；`core/` 只落"平台能力/共享口径"，业务逻辑落模块（护栏 2）。

## 1. 关键架构决策（已与 HAE 确认 2026-10-11）

| # | 决策 | 内容 |
|---|---|---|
| 1 | 变更单归属与挂载 | `ChangeOrder` 属 **budget 模块私有表**；**挂 quote 级**（PLAN §7-2：禁挂 `QuoteItem`——整表替换会孤儿化）。金额**带符号**：正=增加、负数=减少（v5.1 §6.7.2 原文口径）。四类 `kind`：增项/减项/材料升级/工艺变更。 |
| 2 | 变更单状态机 | **无审批态、录入即生效**（同上）；不做确认流、不做编号、不做附件。金额校验护栏：`deduct` 必须为负、`add` 必须为正、`upgrade`/`process` 任意非零。`createdBy` 存 userId 占位（P4）。 |
| 3 | 5% 预警落法 | **不动 `budgetLight` 公式**（20 条断言锁死）——新增 **`ledger.changeWatch(contractAmount, changeTotal)`** 纯函数（口径落 core + 断言）：`changeTotal > contractAmount × 5%`（严格大于）→ warn；合同额≤0 → 不预警。UI：变更单页顶部**预警横幅**（v5.1 §6.7.2）+ 项目中心一行提示。 |
| 4 | 变更对资金链的影响 | **不自动联动付款计划**（`amountDue` 快照语义，M8 决策④）；变更款收款走台账 `income/change` 类目（已有），手动录入。 |
| 5 | 驾驶舱 | 独立 **`/dashboard` 模块**（registry order 0；不动 `/` 首页外壳契约）。4 KPI = 在建项目数 / 本月签单额 / 全司回款率 / 风险项数；含健康矩阵、待办中心、**商务漏斗（M3-e 在此清账）**、利润两图（月度营收毛利折线 + 项目毛利率排行）。只读聚合、每块"打开模块 →"真链。 |
| 6 | EAV | `CustomFieldDef`+`CustomFieldValue` **落 core**（挂 Project/Client 的平台原语）；类型=单行文本/多行文本/数字/日期/单选（**不做金额**）；**全司共享**、不做模块作用域；校验=必填+类型；服务对象=`Project`/`Client` 值录入 + **项目列表按自定义字段筛选**。 |
| 7 | 主题 / PlatformSetting | `PlatformSetting` **只存插槽键名**（cobalt/rust/emerald/teal，R1 已定不存自由色值）；新 `/settings` 平台页 + 顶栏入口；全站生效。**Logo 最简版**：`public/uploads/branding`（gitignore）+ PlatformSetting 存文件名 + 类型/大小校验 + 品牌区渲染 + 移除；**若上传链路实现明显复杂化（安全/替换/清理），停下回报，可降级为缓**。 |
| 8 | 收口附批（M9-e） | 设计令牌收口（§4-2）＋ `prefers-reduced-motion` + hover 120ms（§4-3）＋ **§4-14 收紧**：`advanceStage` 不再接受目标 `signed`（服务端拒 + 提示走「签约建项」）；看板 quoted 卡片不显通用推进、拖拽禁 quoted→signed；表格 quoted 行保留既有「签约」按钮。若实施中发现破坏既有流程，停下回报。 |
| 9 | 单元顺序 | a→b→c→d→e（先财务纵深，再聚合，再平台原语，最后卸债）。 |
| 10 | **本月签单额口径**（M9-b，2026-10-11 与 HAE 确认） | **签约建项的项目合同额按月归集**：`Σ Project.contractAmount`，限「当月创建 **且** 由签约而来」（`Project.lead` 非空，即 `Lead.projectId` 指向它）。**不采 v5.1 §6.1 原文**「财务表当月 income+contract」——我们的台账 `income` 是现金收款事实，把收款月当签单月会误导；`/budget` 直建的筹备项目无 Lead，不计入签单。环比 `momPct` 上月为 0 → **null**（UI 显「上月无签单，不可比」，不造 +∞%）。 |
| 11 | **风险项数口径**（M9-b） | **只数红灯信号、按信号条数累加**：工期红（`scheduleLight=red`）+ 质量红（`qualityLight=red`，即有未关闭问题）+ 预算红（`budgetLight=red`）+ 变更超 5%（`ledger.changeWatch.warn`），范围＝全部非 archived 项目。黄灯属预警不计入风险项（矩阵与待办中心承载黄灯信息）。KPI 只显总数 + 四项分解（纯文本不挂链），避免多目标假链接。 |
| 12 | **月度毛利的口径归属**（M9-b 利润折线） | 折线走**现金收付口径**（当月 `Σincome` 与当月 `Σ(income−expense)`），标题与副标题**必须明写「现金收付口径」**——项目毛利率口径（合同额+变更−支出）没有时间维度，二者并存但不混用；真项目毛利率只在**项目毛利率排行条形图**出现（复用 `ledger.marginRate`）。不引入第三套"按签约月分摊"的毛利口径（需新分摊规则，属扩范围）。 |
| 13 | **M9-b 补 seed 演示数据**（HAE 确认） | 为让漏斗与折线有真实形态：seed 补线索至 5 阶段各 ≥2 条、收支记录铺近 6 个月。**归入 M9-b-2**（与漏斗/两图同轮），因动 `seed.ts` ⇒ 四个隔离库集成门禁全量重跑；M9-b-1 不动 seed 也不动 schema。 |
| 14 | **待办中心不收「超期未跟进线索」**（M9-b） | 「3 天未跟进」的真源在 `src/app/crm/LeadDrawer.tsx`（模块私有客户端组件，禁 import）。驾驶舱要用只能复制阈值 → 造第二口径，违反 §4 口径单点。**本单元不做该类待办**；若将来该规则上收 `core/domain` 再接入。付款段类待办只数 `paid=false`，**不算派生解锁态**（`finance/payment.ts` 属模块私有禁区），可收/未解锁的判定留在财务页。 |
| 15 | **毛利率排行剔除「无成本数据的 100%」**（M9-b-2b，集成者裁定待 HAE 复核） | `marginRate` 口径本身不动，但 `expenseTotal === 0` 的项目（筹备期只录了合同额）按口径恰得 1.0、摆在榜首必误导 → **不入榜**：灰态置末、率显「—」、文案「未录入支出」；`rate === null` 另给「未录入合同额，不可算」。与「未排程」「未录入合同额」两处既有诚实降级同族（详见 §7-7-1②）。 |
| 16 | **不为「铺满六个月」重排演示支出行**（M9-b-2b，集成者裁定待 HAE 复核） | §7-6 预告原写「把 7 笔 expense 重排到近 6 个月」，但三演示项目最早开工日 2026-08-02 → 挪到 5~7 月即造出「开工前采购」反序，违反 `STATUS.md` §5 时间自洽。**改为不重排**，5~7 月如实为 0；台账增补只做 2 笔 `income/change` 变更款收款（不进毛利、不破两本账对照）。详见 §7-7-1①。 |

## 2. 单元拆分

| 单元 | 内容 | 规模感 |
|---|---|---|
| **M9-a** | 变更单全链（本卡 §3 详述） | M8-a 级 |
| **M9-b** | 驾驶舱：骨架+KPI+健康矩阵+待办中心 → 漏斗+利润两图（拆 2 小单元） | 2 单元 |
| **M9-c** | EAV：定义管理+值录入 → 项目列表筛选（拆 2 小单元） | 2 单元 |
| **M9-d** | 主题切换 → Logo 最简版（拆 2 小单元） | 1~2 单元 |
| **M9-e** | 收口附批（令牌/reduced-motion/§4-14） | 半单元 |

## 3. M9-a 详细范围（变更单 · 权威规格）

### 3-1 数据模型（`prisma/schema.prisma`）

新增（可移植、无 PG 专有类型；枚举用 string + 常量）：

```prisma
// ── M9-a：budget 模块私有表 ──
// 变更单挂报价单级（PLAN §7-2：禁挂 QuoteItem——报价整表替换会孤儿化）。
// 金额带符号：正=增加、负=减少（v5.1 §6.7.2「金额变化（正数=增加，负数=减少）」）。
// v5.1 的四段确认流（待审批→客户确认）本期不做：单用户无角色/无客户端，录入即生效（§1-2）。
model ChangeOrder {
  id        String   @id @default(cuid())
  quoteId   String
  kind      String   // add | deduct | upgrade | process（增项/减项/材料升级/工艺变更）
  title     String   // 变更描述（必填）
  amount    Float    // 金额变化：正=增加、负=减少；拒 0
  date      DateTime // 变更日期
  note      String   @default("") // 原因说明
  createdBy String?  // ★ userId 占位（P4 接登录）
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  quote BudgetQuote @relation(fields: [quoteId], references: [id])

  @@index([quoteId])
  @@map("change_orders")
}
```

`BudgetQuote` 加反向关系一行：`changes ChangeOrder[]`。

### 3-2 共享口径（`src/core/domain/ledger.ts` 追加，**不删不改既有函数**）

- `export const CHANGE_WATCH_RATIO = 0.05;`
- `export interface ChangeRow { amount: number }`
- `changeTotal(changes: ChangeRow[]): number` —— `round2(Σ amount)`；**带符号**（与 `receivedTotal` 的 safeAmount 口径不同：**负数/减项合法保留**，仅非有限值按 0）。
- `changeWatch(contractAmount, changeTotal): { warn: boolean; ratio: number | null }` —— 合同额≤0 → `{warn:false, ratio:null}`；否则 `ratio = Math.round((change/contract)*10000)/10000`、`warn = change > contract*CHANGE_WATCH_RATIO`（**严格大于**，==5% 不预警）；不输出 emoji。

### 3-3 纯常量与守卫（新建 `src/modules/budget/changes.ts`，无 prisma、客户端可安全 import）

- `export const CHANGE_KIND = { add: "add", deduct: "deduct", upgrade: "upgrade", process: "process" } as const`（抄 crm/stages.ts 范式）
- `CHANGE_KIND_LABEL`：增项/减项/材料升级/工艺变更；`isChangeKind(v): boolean`。
- 金额方向守卫（供服务层与门禁共用）：`isValidAmountForKind(kind, amount): boolean` —— `deduct` 须 `<0`；`add` 须 `>0`；`upgrade`/`process` 须 `≠0` 且有限。

### 3-4 服务层（新建 `src/modules/budget/server/changes.ts`）

仿 `quality/server/issues.ts` / `finance/server/records.ts` 范式：模块内错误类 `ChangeOrderError`（中文直达 UI）；纯输入校验在开事务前、存在性在事务内。
- `listChanges(projectId)` → 视图模型（id/kind/title/amount/signed 展示素材/date/note/createdByName?）。
- `createChange(projectId, input)` / `updateChange(changeId, input)` / `deleteChange(changeId)`（硬删，单用户无回收站，同 M8-b）。
- 校验：`title` 去空白必填；`kind ∈ CHANGE_KIND`（拒「未知变更类型：X」）；`amount` 有限且按 §3-3 方向守卫（拒文案：「减项金额应为负数」/「增项金额应为正数」/「变更金额不能为 0」）；`date` 可解析；quote 存在（经 projectId → BudgetQuote 查得 `quoteId`，一项目一报价）。
- `createdBy`：新建 `src/modules/budget/currentUser.ts` 占位（照 `finance/currentUser.ts` 模式：优先 `budget_mgr` 角色用户，无则 `boss`，无则 null）。
- **不写**：不碰付款计划、不写台账、不写任何其他模块表。

### 3-5 Server Actions（追加到 `src/app/budget/actions.ts`）

`createChangeAction` / `updateChangeAction` / `deleteChangeAction`（useFormState 模式，`ChangeFormState{error?, ok?}`；projectId/changeId 经 bind）。
`revalidatePath`：`/budget/${projectId}/changes` + `/budget/${projectId}` + `/projects/${projectId}`。

### 3-6 页面（新建 `/budget/[projectId]/changes`）

- `page.tsx`（server）：取项目 + 累计变更 + 列表；顶部：`← 返回报价单` 链 + 「变更单」标题 + 项目名；**汇总条**：合同额 / 累计变更（带符号）/ 变更后总额（合同+变更）；**预警横幅**（`changeWatch(...).warn` 时）：warning 语义色描边横幅「累计变更额已超合同额 5%，请关注」（非 danger、非 emoji）。
- `ChangesBoard.tsx`（client）：列表（日期 / 类型 label / 描述 / 金额带符号右对齐 `num` / 原因截断 / 操作）；**新建/编辑用 Modal**（描述* / 类型 select* / 金额* 数字可负 + hint「正数=增加，负数=减少」/ 日期* 默认今天 / 原因说明）；**删除=行内两步确认**（首点变「确认删除」danger 描边，再点执行；点击别处复位——2 秒或失焦复位皆可）；空态「暂无变更单」+ 引导。
- 金额显示：**`core/domain/pricing.ts` 仅新增（不改既有函数）** `formatSignedCny(n)`——null→「—」；正 `+¥…`、负 `−¥…`（U+2212 在 ¥ 前）、零 `¥0.00`（两位小数千分位同 `formatCny`）；变更页与项目中心共用。刻度守 12/13/15/17/20/28。
- 入口：`QuoteBoard.tsx` 链接行（项目设置 / 科目分布 / 打印视图）**加「变更单」**（同款 `text-xs text-accent-ink` 链接样式，置「打印视图」前）。

### 3-7 接线（读侧消费）

- `src/modules/projects/server/projectDetail.ts`：`HubFinance` **加** `changeTotal: number; changeWarn: boolean;`；`changeTotal` 由 `prisma.changeOrder.findMany({where:{quoteId}}).amount` 经 `ledger.changeTotal` 得出；**`budgetLight` / `grossProfit` / `marginRate` 的 `changeTotal` 由 0 改传真值**；`paidPct` 分母改为 `contractAmount + changeTotal`（>0 才可算）。更新文件头注释（删「留 M9」字样）。
- `src/app/projects/[id]/ProjectTabs.tsx`「预算收支」Tab：毛利卡下方加一行「累计变更 {±}" + 变更单链「变更单 →」`/budget/${id}/changes`（只写 URL）；`changeWarn` 时同段加一行 warning 文案「累计变更额已超合同额 5%，请关注」。
- `src/modules/finance/server/records.ts` 汇总：`grossProfit`/`marginRate` 的 `changeTotal` 改真值（按筛选范围：单项目→该项目变更和；全量→全部）；`pendingTotal` 改为 `max(0, contractAmount + changeTotal − received)`（应收含变更）；更新头注释。

### 3-8 seed（`prisma/seed.ts`，幂等 + 自检断言）

- `seedChanges()`（照 `seedQuality()` 幂等范式：`count===0` 才建；日期落在各项目施工期内、时间自洽）：001（RP-2026-001）`kind="upgrade"`、`title="主卧衣柜升级为定制柜体"`、`amount=+3200`（**超 5%：3200>3100 → 001 预警演示位**）；002 `kind="process"`、`title="厨房橱柜工艺变更"`、`amount=+2800`。
- 最终自检块加「变更单」计数打印 + 断言（2 条）。

### 3-9 门禁

- `scripts/verify-quote.mjs`（37→43±）：追加 `budget/changes.ts` 断言组（KIND 四值、LABEL 四值、`isChangeKind` 正反例、`isValidAmountForKind` 六例）。
- `scripts/verify-finance.mjs`（115→127±）：追加 `changeTotal`（空/单正/正负混合/含非有限值/负净额/尾差 cent 预言机）+ `changeWatch`（==5% 不警、>5% 警、合同额 0/负 → null、负变更不警、ratio 四位）断言组。
- `scripts/verify-finance-flow.mts`（55→70±）：① 初态守卫加"变更单 2 条"；② 基线交叉比对全部改用真实 `changeTotal`（新 helper：按项目聚合 change_orders → `ledger.changeTotal`），既有硬编码期望更新为含变更值（001：毛利 24900、率 0.3819——以预言机复算为准）；③ 新增：create/update/delete 真跑 + 六类拒绝（title 空/kind 未知/amount 0/deduct 正数/add 负数/日期非法）+ 变更增删后 `getProjectHub(...).finance.changeTotal/changeWarn` 联动断言。
- `scripts/qa-shots.mjs`：targets 加 `{ name: "03b-budget-changes", path: "/budget/cmv0srke70006yuc6pklsho74/changes" }`。

### 3-10 M9-a 验收（集成者执行）

`pnpm build` 绿 + `npx tsc --noEmit` 0 + 七纯函数门禁零回退（quote/crm/health/design/schedule/quality/finance 新计数）+ **四隔离库集成门禁全量重跑**（sign 12 / schedule-gen 27 / quality-flow 94 / finance-flow 新计数——**因动 core+seed，按 §8 规则必跑**）+ qa-shots 31+1 页全 200 + 目检（变更页含横幅 / 001 预警、002 不预警 / 报价单链接行 / 项目中心预算收支新数字 / `/finance` 汇总数字）+ 375 探针（changes 页 + /projects/[id]）+ 交互写回候 HAE 手测。

## 4. 通用约束（全 M9 适用）

- 单轮一个界面单元；文件白名单随派工卡给；**codebuddy 只写文件，schema 迁移/seed 的执行为集成者**（`migrate dev` / `db seed`）；禁止 `pnpm dev`/git/migrate/db 命令（写卡时重复声明）。
- 跨模块读铁律：prisma 直读 + 口径调 `core/domain`；绝不 import 其他模块内部；**M9 不新增跨模块写入点**。
- `health.ts` 公式不改；`pricing.ts` 只允许新增 `formatSignedCny`（不改既有函数）；口径单点（页面不得各写算式）。
- V0.3 刻度：字号 12/13/15/17/20/28、间距 4/8/12/16/24/32/48；无阴影/无 emoji；单点 accent。
- 改 `core/domain` 或 `seed.ts` 的单元：四个隔离库集成门禁必重跑。

## 5. 执行记录（逐单元追加）

_（M9-a 起，每单元合入后在此追加「执行记录与裁定」，规格见 M8 惯例。）_

- **M9-a 变更单（2026-10-11 合入）**：交付 18 文件（schema+迁移 `20261011092643_m9a_change_order` / seed / ledger+pricing 追加 / `budget/changes.ts`+`server/changes.ts`+`currentUser.ts` / actions / changes 页两文件 / QuoteBoard 链接 / projectDetail·ProjectTabs·records 接线 / 门禁四件）。**验收**：build 绿 + tsc 0 + 七纯门禁零回退（quote 69 / finance 135）+ 四隔离库门禁全量重跑（sign 12 / schedgen 27 / quality 94 / finance-flow **76**）+ qa-shots **32** 页全 200 + 目检四件 + 探针五页零真实溢出 + hub 实值巡检（001 changeWarn=true·gross 24900·paidPct 0.29；002 false·2800 互补）。
  **集成者裁定**：① codebuddy 5 处自报说明全可接受（qa-shots 用动态 project.id 优于字面 cuid / 002 挂 RP-2026-002 构成 warn 互补 / `getBudgetUser` any 兜底同 finance 惯例 / 未跑集成门禁符合分工 / emoji 采样说明成立）；② **集成者修复 1 处 seed 缺陷**：`seedChanges` 首版假定 002 有报价单，但 002/003/004 是排程 seed「直接 create」、从未建 `BudgetQuote` → dev.db 首跑报错；改为 **`ensureQuote` 兜底**（缺则补草稿单，与 `createProject` 行为一致）；③ 集成者小修 4 处：金额非数字文案 / 合同额 footer 用 `formatCny` 非带符号 / 「+ 新建变更」复用 core `Button` / seed 尾换行。
- **M9-b-1 驾驶舱骨架（2026-10-11 合入）**：交付 8 文件（新建 6：`core/domain/dashboard.ts` / `modules/dashboard/manifest.ts` / `modules/dashboard/server/overview.ts` / `app/dashboard/page.tsx` / `scripts/verify-dashboard.mjs`；改动 2：`modules/registry.ts`、`scripts/qa-shots.mjs`）。**执行通道首次换成 Loomy（讯飞 GLM-5.3-Flash）**，拆两轮自包含派工（轮 A 纯函数+manifest+门禁 / 轮 B 服务+页面+接线，提示词见 `_scratch/logs/loomy_m9b1{A,B}_prompt.md`）。**验收**：build 绿 + tsc 0 + 八纯门禁零回退（quote 69 / crm 11 / health 20 / design 28 / schedule 55 / quality 108 / finance 135 + 新 **dashboard 43**）+ qa-shots **33** 页全 200（含 `00-dashboard`）+ 目检（KPI 阶梯 28/20、回款率 15.6% 黄点+进度条、矩阵两卡三灯与「累计变更超合同额 5%」、待办七类含「未接入」徽标、三块灰占位无假数据）+ 375 探针 `/dashboard` 与 `/` 均 `scrollWidth=360≤360 · trueOffenders=0` + **实值巡检 30 项全过**（`_scratch/m9b_dash_check.mts` 逐项目笨算当预言机：本月签单 ¥480,000 / 上月 0 → `momPct=null` / 回款率 0.1562 / 风险 3＝工期 1+质量 1+变更 1 / 矩阵 2 行三灯与进度逐项 / 待办六类计数 1·1·1·11·1·1 / 绩效类不计数不造链）。**四隔离库集成门禁免重跑**（裁定：`core/domain` 仅新增文件、schema/seed/既有口径零改动、无既有消费者）。
  **集成者裁定 Loomy 四处自报偏离**：① `fmtDate` 服务层本地实现（`month:"long"` → 「2026年10月11日」）——**改**，对齐 `projectDetail.fmtDate` 的数字三位样式，跨页日期不许两种写法；② 待办组级 `href` 取既有路由（卡只规定 item 级）——**可接受**，六条链均为已验证可达页；③ 矩阵进度直接渲 `{n}%`——**可接受**，`overallProgress` 本就是 0–100 标量；④ `registry.ts` 里 `deferredModules` 顺序注释仍提「驾驶舱」——**改**（按"只改必要行"未动，属陈旧文案）。
  **集成者另修 2 处**：页根用 `<main>` 与外壳 `<main>` 嵌套（HTML 只允许一个 `main`）+ 自设 `max-w-[1200px]` 破外壳 `max-w-6xl` 节奏 → 改 `<div className="space-y-12">`（同 `/finance`、`/projects` 惯例）；进度条宽度 `Math.min(1,rate)*100` 出 `15.620000000000001%` 浮点尾差 → 服务层舍到两位小数（换算仍唯一一处）。
  **登记债**：`budget/[projectId]/changes/page.tsx` 与 `stats/page.tsx` 同样以 `<main>` 为根（M9-a / M1b 既有），与外壳嵌套——本单元不牵动，入 `STATUS.md` §4-15 候收口批。
- **M9-b-2 候开卡**：商务漏斗（M3-e 清账）+ 月度现金折线 + 项目毛利率排行条形 + seed 补演示（§6-9）；**动 seed ⇒ 四隔离库集成门禁全量重跑**。→ 已拆 2a（下条，已合入）/ 2b（§7-7 权威规格已入册）。
- **M9-b-2a 商务漏斗 + seed 补线索（2026-10-11 合入 · codebuddy `custom-local:glm-5.2`）**：交付 5 文件（`core/domain/dashboard.ts` 追加 `FUNNEL_STAGE_ORDER`/`funnelCounts`/`leadConversion` / `prisma/seed.ts` 新增 `seedLeads()` / `dashboard/server/overview.ts` 加 `DashboardFunnel` / `dashboard/page.tsx` 漏斗块 / `scripts/verify-dashboard.mjs` 扩断言）。**验收**：build 绿 + tsc 0 + 八纯门禁零回退（quote **79**（新增 1 张草稿报价单，逐单循环计数上浮，属 §7-5 预期）/ crm 11 / health 20 / design 28 / schedule 55 / quality 108 / finance 135 / dashboard **58**）+ **四隔离库集成门禁全量重跑**（sign 12 / schedgen 27 / quality-flow 94 / finance-flow 76，各自 `migrate reset --force` 重灌 seed 后全过）+ qa-shots 33 页全 200 + 目检（漏斗五阶段条 2/2/2/2/3、签约率 27.3%、副标题「阶段存量分布（非累计流量）」、本月签单额环比首次显「较上月 +172.7%」）+ 375 探针三页（`/dashboard`·`/projects`·`/crm`）零真实溢出 + **实值巡检 33 项全过**（新增漏斗计数/签约率/条宽三条独立复算断言）+ **seed 幂等双跑验证**（连跑两次：线索 11、项目 7 不变）。
  **集成者修真缺陷 1 处（codebuddy 未自报、seed 首跑即崩）**：`seedLeads` 的已签循环「按 code 复用已有项目」在真实 dev.db 上必撞 `Lead.projectId @unique`（`P2002`）——手测早已把 `RP-2026-005/006` 建成签约项目并被 `LEAD-2026-001` 占用。正解三件：**①** 复用条件加 `lead: { is: null }`（只复用未被任何线索占用的项目）；**②** 签约位改**按月判定**——该月已有「带线索的项目」就跳过补建（净库照建、脏库不重复占位）；**③** code 被占则走 `nextFreeProjectCode()` 递增取空闲号（实得 `RP-2026-007`＝上月签约位）。自检同步从「按固定 code 断言合同额 218000/176000」改为**按签约月断言本月/上月各 ≥1 条**（脏库净库都成立）。承 M9-a `ensureQuote` 的同族教训：**seed 假定数据形状前必须先对真实 dev.db（含手测数据）验证**，已补进 `STATUS.md` §5。
  **集成者另修 3 处**：① 未签线索改**按 DB 真值逐阶段补到 2 条**（固定 code 清单保证不了「五阶段各 ≥2」——dev.db 里 `LEAD-2026-001` 已被手测推进成 signed，`contacted` 只剩 1 条）；② `FUNNEL_STAGE_ORDER` 从 `overview.ts` 局部常量**上收 `core/domain/dashboard.ts`**，并在 `verify-dashboard.mjs` 加**漂移护栏**断言它与 `crm/stages.ts` 的 `LEAD_STAGE_ORDER` 同序同值（应用层仍不跨模块 import，靠门禁锁）；③ 漏斗与两块占位同排时 `grid` 会把占位卡拉成整列空白 → 加 `items-start`（V0.3 §7.4 节奏）；另把 codebuddy 的 `UNSIGED`/`unsiged*` 拼写改为 `UNSIGNED_LEADS`/`unsigned*`、修一条 `1e-9` 陈旧注释（实际容差 1e-3）。
  **codebuddy 四处自报偏离裁定**：① 未签线索用 009/010 避开与已签 007/008 撞号——**可接受**（卡面确有号段重叠）；② 新建项目 `status="draft"`——**可接受且正确**（核实 `signLead` 建的项目同为 `PROJECT_STATUS.draft`，与真实签约一致）；③ `pct` 合 1 容差取 1e-3——**可接受**（各值独立 `round4`，1e-9 数学上不可能成立）；④ 本月签约项目不回填 `createdAt`（`createProject` 默认 `now` 已在当月）——**可接受**。
- **M9-b-2b 月度现金折线 + 项目毛利率排行（2026-10-11 合入 · 执行通道 = opencode standalone 讯飞池 `imodel/GLM-5.3-Flash`）**：交付 6 文件（`core/domain/dashboard.ts` 追加 `monthKeysDescending`/`cashSeries`/`cashPeak`/`cashTone` +99 行 / `verify-dashboard.mjs` 58→**86** 项 +245 行零删改 / `dashboard/server/overview.ts` 加 `DashboardCash`+`DashboardMargins` +199 行 / `app/dashboard/page.tsx` 两图 +142 行 / `prisma/seed.ts` 新增 `seedChangeIncome()` / `verify-finance-flow.mts` 初态守卫 11→13）。**规格与派工**：§7-6 预告展开为 §7-7（含 §7-7-1 两处偏离裁定＝决策 15~16），拆 **A1/A2/B1/B2/C 五小轮**、每轮 1~2 文件自包含卡（`_scratch/logs/oc_m9b2b_*_prompt.md`）。**验收**：build 绿 + tsc 0 + 八纯门禁零回退（quote 79 / crm 11 / health 20 / design 28 / schedule 55 / quality 108 / finance 135 / dashboard **86**）+ **四隔离库集成门禁全量重跑**（sign 12 / schedgen 27 / quality-flow 94 / finance-flow **76**，净库 seed 首跑路径同时被验证）+ qa-shots 33 页全 200 + 375 探针四页（`/dashboard`·`/finance`·`/projects`·`/`）`scrollWidth=360 · trueOffenders=0` + **实值巡检 33→77 项全过**（逐月现金三点独立复算 · x/y 几何复算 · 毛利率三档与顺序复算）+ **seed 连跑三次幂等**（收支 13、变更款 2 条、本次自建 0）。目检：折线 5~7 月贴基线且表内显 `¥0.00`（不显「—」）/ 8 月峰 收款 112,000 vs 支出 120,000 / 净现金 `−¥8,000.00` U+2212 + warning 字色 / 合计 136,600·239,300·−102,700 / **毛利率榜首是 002 的 38.6% 而非某 100% 项**、005~007 灰态「未录入支出」置末、004「未录入合同额，不可算」最后 / 漏斗与人效占位两卡未破 / `/finance` 已收 ¥130,600→**¥136,600**、待收 ¥875,400（含变更）、收入记录 6 条含 2 笔「变更款」。
  **执行通道首次踩坑与对策（入工作手册）**：轮 A 首跑（`core` + 门禁 2 文件、卡面完整）**静默零产出**——`step_finish` 的 `reason:"length"`、`reasoning` 31,923 tok 而 `output` 仅 77 tok，模型把预算全花在推理上、一个文件都没落、进程 exit 0。对策＝**每轮再拆到 1~2 文件 + `--variant low` 压推理档**；改法后五轮全部 `reason:"stop"` 正常落盘。纪律审计（grep 五轮 `tool_use` 的 `command`）：只有 `npx tsc --noEmit` / `node scripts/verify-dashboard.mjs` / `wc -l`，**无 git、无 prisma、未读 `docs/**`**。
  **集成者修真缺陷 2 处**：① **净现金符号规约**——B2 按卡面用 `formatCny(p.net)` 会渲成 `¥-8,000.00`（ASCII 连字符、号在 `¥` 后），破本仓「负金额用 U+2212 且在 `¥` 前」的既有规约（`formatSignedCny` 就是为此而生）→ 净额列与合计行改 `formatSignedCny`；② **seed 断言 2 的脏库脆弱性**——C 首轮写成「全表 `change` 收入合计 == 两项目净额之和」，我改成「只对本次自建行」时又引入**第二次跑 `created` 为空 → 等式 6000 vs 0 必抛**（被"连跑两次"这道既有纪律当场抓到）→ 最终改为**按项目**判等式：凡该项目存在带 `SEED_DESC` 的行，其合计必等于该项目变更净额；首跑与复跑同一条式子成立，手测自录的变更款（`description` 不同）不参与等式。教训与 M9-b-2a 撞 `@unique` 同族且更深一层：**幂等复跑不是"计数不变"就行，断言的"比对口径"必须在首跑与复跑两种路径下同真**。
  **五轮自报偏离裁定（全可接受）**：A1 ① amount 脏值直接跳过累加（等价"按 0 参与"）② `cashPeak` 对点内非有限按 0；A2 首跑 2 FAIL 系其手算把 5,000,000+123,456 分误加为 6,123,456，**按纪律只修期望字面量、未动生产码、未删断言**——纪律正例；B1 ① 三条既有 import 行扩符号（卡 §1 明示直接 import，属隐含必需）② 新增未导出内部 `MarginTierRow`（排序后 rest 剥掉）③ 头注释补一行；B2 ① 两卡 `Card` 上加 `min-w-0` 防溢出 ② 嵌套三元改等价表达式 ③ 表头四列补 `text-right` 对齐；C ① 多读 seed.ts 尾 17 行与 1530–1540、`ledger.changeTotal` 签名 12 行（最小必要）② 报错文案加「排除 change」四字 ③ 点名 `seedLeads` 头注释「初态守卫 15/11/2」已陈旧（卡禁改它）→ **集成者已补一行更正** ④ 自报"全表等式遇手录变更款会红"→ 即上述真缺陷 ②。
  **登记债（不在本单元白名单，未动）**：项目中心「预算收支」毛利卡对**零支出项目**仍显 `毛利率 100%` + 绿点（M8-d 既有行为，见 `09-project-budget` 截图 RP-2026-007），与本页决策 15 的判定不一致 → 入 `STATUS.md` §4-16 候收口批。

## 6. M9-b 详细范围（数据驾驶舱 · 权威规格）

> 拆两个小单元（§2）：**M9-b-1 = 模块注册 + 页面骨架 + 4 KPI + 项目健康矩阵 + 全局待办中心 + 三块灰占位**（本轮派工）｜ **M9-b-2 = 商务漏斗（M3-e 清账）+ 利润两图 + seed 补演示数据**（下轮，规格见 §6-9）。
> 业务要素源 v5.1 §6.1（**只取业务不取皮**：布局与色一律按本平台 V0.3，v5.1 的靛蓝/玻璃拟态作废）。四个口径拍板已入 §1 决策 10~14。

### 6-1 数据模型

**零新表、零迁移、零 seed**（本轮纯读聚合）。`prisma/schema.prisma`、`prisma/seed.ts` 属**禁区**。

### 6-2 共享口径（新建 `src/core/domain/dashboard.ts`）

纯函数、**不 import prisma、不查库、不造数**，plain-node 可直 import（照 `ledger.ts` 范式，**内部自内联 `round2`/`round4`，不得 `import ... from "./pricing"` 无扩展名链**——见 `docs/STATUS.md` §5「re-export shim 坑」）。既有 `ledger.ts` / `health.ts` / `pricing.ts` **一律不改**（新增文件，不是新增口径分叉：灯与钱仍调 core 既有函数）。

```ts
/** 在建三态（不含 draft 筹备 / completed 竣工 / archived 归档）——KPI 与健康矩阵共用此单一定义。 */
export const IN_PROGRESS_STATUSES = ["design", "in_progress", "acceptance"] as const;
export function isInProgress(status: string): boolean;

/** 本地日历月键 "YYYY-MM"（月份 1 位补零）；用 getFullYear/getMonth，不用 toISOString（UTC 漂移会把月末签单算进下月）。 */
export function monthKey(d: Date): string;
/** 上一个日历月的键（1 月 → 上一年 12 月）。 */
export function prevMonthKey(key: string): string;

/** 签单额归集输入：只取需要形状，不碰整行。 */
export interface SignedInput { contractAmount: number; createdAt: Date; signed: boolean }
/** 本月 / 上月签单额 + 环比。signed=false（非签约建项而来）不计；脏值（非有限）不计。
 *  momPct = prev>0 ? round4((cur-prev)/prev) : null（上月 0 → null，UI 显「上月无签单，不可比」）。 */
export function signedAmountAt(items: SignedInput[], now: Date): { month: number; prevMonth: number; momPct: number | null };

/** 回款率 = round4(received/receivable)；receivable<=0 → null（UI 显「—」，不造 0%）。received 脏值按 0。 */
export function collectionRate(received: number, receivable: number): number | null;
/** 回款率色档（v5.1 §6.1「低于 80% 标黄」单一阈值）：null → "neutral"；< 0.8 → "yellow"；否则 "green"（**0.8 恰等归 green**）。返回语义 token，不输出 emoji。 */
export function collectionLight(rate: number | null): "green" | "yellow" | "neutral";

/** 风险信号计数（§1-11：只数红灯）。 */
export interface RiskCounts { scheduleRed: number; qualityRed: number; budgetRed: number; changeWarn: number }
/** 总数 = 四项相加；任一非有限值按 0 计。 */
export function riskItemCount(c: RiskCounts): number;

/** 带符号百分比展示（环比专用）：0.124 → "+12.4%"、-0.081 → "−8.1%"（U+2212，与 `formatSignedCny` 同号规）、0 → "0.0%"。
 *  放这里是为了让页面不各写 `(n*100).toFixed(1)` 这类展示算式（§4 口径单点）。 */
export function formatSignedPercent(n: number): string;
```

> `cashSeries` / `monthKeysDescending`（月度分桶）**留给 M9-b-2** 追加，本轮不要预先写进去（无消费者＝死代码）。

### 6-3 模块注册（三处小改 + 一个新文件）

- 新建 `src/modules/dashboard/manifest.ts`：`id: "dashboard"`、`name: "数据驾驶舱"`、`description`（一句话：在建项目、签单与回款、风险与待办的聚合首页）、`icon: "舱"`（单字符，**禁 emoji / 禁彩色 icon 库**）、**`order: 0`**（排 crm(2) 之前）、`entryPath: "/dashboard"`、`requiresAuth: false`、**不给 `nav`**（二级页尚不存在；`manifest.nav` 是全局静态清单，拿不到 projectId，见 `STATUS.md` §5）。
- `src/modules/registry.ts`：加 `import { dashboardManifest }`、在 `modules` 数组加一行（保持尾部 `.sort(order)` 不动）。
- 同文件 `deferredModules` **删掉 `dashboard` 条目**（`hr` 保留，仍是灰占位）。
- **`src/app/layout.tsx` / `src/app/page.tsx` 零改动**——侧栏导航与首页入口卡片应自动出现（这正是 registry 机制的验收点）。

### 6-4 读模型服务（新建 `src/modules/dashboard/server/overview.ts`，只读）

仿 `schedule/server/overview.ts`（跨项目聚合范式母版）。

- `export async function getDashboardOverview(now: Date = new Date()): Promise<DashboardOverview>`。
- **主查询一条**：`prisma.project.findMany({ where: { status: { not: "archived" } }, include: { client:{select:{name:true}}, lead:{select:{id:true}}, scheduleTasks:{select:{progress:true}}, acceptanceNodes:{select:{status:true}}, issues:{select:{status:true}}, financeRecords:{select:{type:true,amount:true}}, quotes:{select:{status:true, changes:{select:{amount:true}}}} }, orderBy:{code:"asc"} })`。**禁 N+1**（不得在 `map` 里再发 `findMany`/`count`）。待办中心 ④①②③ 四类用四条独立 `count`（各自 `where: { project: { status: { not: "archived" } }, ... }`）+ 各 `findMany({ take: 3 })` 取摘要，可 `Promise.all` 并发。
- **灯与钱全部走 core 既有函数**：`overallProgress` / `scheduleLight` / `qualityLight` / `budgetLight`（**公式零改动**）、`receivedTotal` / `expenseTotal` / `changeTotal` / `changeWatch`、本轮新口径 `isInProgress` / `signedAmountAt` / `collectionRate` / `collectionLight` / `riskItemCount`。**禁止在本文件出现任何算式字面量**（0.8 / 0.05 / 7 天等阈值一律不写）。
- **禁调 `syncAcceptanceNodes`**：驾驶舱是聚合页、保持**零写入**（排程更新已同事务生成节点，各模块读取入口另有兜底）。若因此与 `/quality` 页计数有瞬时差异，属已登记行为，不是缺陷。
- **禁 import 其他模块内部**（`crm/server/leads.ts`、`finance/payment.ts`、`quality/server/*`、`budget/server/changes.ts`、`design/*` 全是禁区）；跨模块只 prisma 直读 + 调 `core/domain`。
- 视图模型（字段名照此，UI 直接渲）：

```ts
export interface DashboardKpi {
  activeProjects: number;            // 在建三态计数
  signedThisMonth: number;           // §1-10 口径
  prevMonthSigned: number;
  momPct: number | null;
  collectionRate: number | null;     // 全司：Σincome / Σmax(0, 合同额+变更)（非 archived）
  collectionLight: "green" | "yellow" | "neutral";
  risk: RiskCounts & { total: number };
}
export interface HealthRow {
  id: string; code: string; name: string; clientName: string | null;
  pm: string | null; plannedEnd: string | null;   // fmtDate 风格同 projectDetail
  progress: number; hasSchedule: boolean;
  lights: { schedule: Light; quality: Light; budget: Light };
  changeWarn: boolean;
}
export interface TodoItem { id: string; label: string; href: string }
export interface TodoGroup {
  key: string; label: string; count: number; href: string;   // href = 「打开模块 →」真链
  items: TodoItem[];                                          // 前 3 条摘要
  placeholder?: boolean;                                      // 灰占位类（绩效）
}
```

- **待办中心六类真口径 + 一类灰占位**（顺序即展示顺序）：

| # | 类别 | 计数口径 | 摘要项 label | 真链 |
|---|---|---|---|---|
| 1 | 待审验收节点 | `AcceptanceNode.status === "submitted"` | `{项目code} · {节点name}` | `/quality/nodes/{id}` |
| 2 | 未关闭质量问题 | `Issue.status !== "closed"` | `{项目code} · {title}` | `/quality/issues` |
| 3 | 待审设计任务 | `DesignTask.status === "submitted"` | `{项目code} · {title}` | `/design/{id}` |
| 4 | 待收付款段 | `PaymentNode.paid === false`（**不算派生解锁**，§1-14） | `{项目code} · {段name}` | `/finance/payments?projectId={pid}` |
| 5 | 变更超 5% 预警项目 | `changeWatch(contract, changeTotal).warn` | `{项目code} · 累计变更 ±¥{…}` | `/budget/{projectId}/changes` |
| 6 | 工期红灯项目 | `scheduleLight === "red"`（未竣工未归档范围内） | `{项目code} · {name}` | `/schedule/{projectId}` |
| 7 | 待审批绩效报告 | **灰占位**：`placeholder: true`、不计数 | 渲染「人员管控未上线，暂不统计」+ `Badge variant="outline"`「未接入」 | 无链（**不许造链**） |

- **禁 mock 兜底数字**（PLAN §5-M9 完成准则）：分母≤0 → `null` → UI「—」；空集合 → 计数 0 + 空态文案；任何字段不得写演示常量。

### 6-5 页面 `/dashboard`

新建 `src/app/dashboard/page.tsx`（server component，`export const dynamic = "force-dynamic"`；`export const metadata = { title: "数据驾驶舱" }`）。本轮**预期零 `"use client"`**（纯只读聚合，无表单、无交互态）；若确需客户端组件，新建 `src/app/dashboard/<Name>.tsx` 并在文件头注明为何必须客户端。

版式（守 V0.3 与 §4 刻度；**参照 `src/app/finance/page.tsx` 汇总条的阶梯权重先例**）：

1. **页头**：`数据驾驶舱`（`text-[28px] font-semibold`）+ 副标题一行 `text-xs text-secondary`：「口径范围：全部未归档项目 · 生成于 {时间}」。
2. **KPI 四格** `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`，但**权重必须成阶梯**（勿四格同字号——`STATUS.md` §4-4 那条债不许在本页复发）：主级＝**本月签单额**（`text-[28px]` + `formatCny`，下方 `text-xs` 环比：`momPct` 非 null 显「较上月 +12.4% / −8.1%」，null 显「上月无签单，不可比」）；其余三格 `text-[20px]`。
   - 在建项目数：数值 + 小字「设计中 / 施工中 / 验收中」；整格链 `/projects`。
   - 全司回款率：`collectionLight` 色点 + 百分比（`formatPercent`，`null` → 「—」）+ **细进度条**（`h-1 rounded-full bg-sunken` 轨道 + `bg-accent` 填充，`>1` 时填充满格但数值如实显）；整格链 `/finance`。
   - 风险项数：数值（`total`）+ 分解行纯文本 `text-xs text-secondary`「工期 {n} · 质量 {n} · 预算 {n} · 变更 {n}」（**不挂链**，具体项目由矩阵与待办承载）；`total === 0` 显 0（真值），不显「—」。
3. **项目健康矩阵**（中左，约 60%）：标题「项目健康矩阵」+ 卡片网格 `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`，卡＝`Card` 外套 `Link` 到 `/projects/{id}`：项目名截断（`truncate`）+ `code`（`num text-xs text-muted`）+ 三灯点行（工期/质量/预算，各带 `title` 文案与 `text-xs` 标签）+ 进度 `{n}%`（`hasSchedule === false` → 灰点 +「未排程」，照 `/projects` 页 `ProgressCell` 的诚实降级写法）+ 项目经理 + 预计完工（`null` → 「—」）；`changeWarn` 时卡内加一行 `text-xs text-warning`「累计变更超合同额 5%」。范围＝`isInProgress` 三态。**空态**：「暂无在建项目」。
4. **全局待办中心**（右列，约 40%）：分类列表，每类一行：`label` + 计数（`num`，**计数 0 也保留该行**、显 muted「无」，别静默隐藏）+ 前 3 条摘要（各带真链，`truncate`）+ 行尾「打开模块 →」（`text-xs text-accent-ink`，与 `QuoteBoard` 链接行同款）。第 7 类（绩效）按 `placeholder` 渲灰占位行。
5. **三块灰占位卡**（本轮不画图）：`商务漏斗`、`月度营收毛利趋势`、`人效排行` 各一张卡，正文分别写「M9-b 后续单元接入（M3-e 清账）」、「M9-b 后续单元接入 · 现金收付口径」、「未接入：人员管控模块未上线」。**禁写任何假数据/假坐标轴**。

设计硬约束：单点 accent（进度条填充、链接 hover、灯位一律不抢 accent）；无阴影、无渐变、无 emoji；字号只用 **12/13/15/17/20/28**、间距只用 **4/8/12/16/24/32/48**；色点沿用既有页面本地映射先例（`ProjectTabs.tsx` / `finance/page.tsx` / `schedule/page.tsx` 里那组 `inline-block h-2 w-2 shrink-0 rounded-full bg-success|bg-warning|bg-danger`，neutral 用 `bg-sunken`）——**不要为此改 `src/core/ui/**`**。
展示格式化：金额与百分比一律从 `@/core/domain/pricing` 引 `formatCny` / `formatPercent`（`formatPercent` 收 0–1 小数），**不要**走 `@/modules/budget/lib/quote` 兼容层（那是跨模块 import）；环比走 `@/core/domain/dashboard` 的 `formatSignedPercent`；变更摘要金额走 `formatSignedCny`。页面内不得出现 `(n*100).toFixed(1)` 之类就地算式。

### 6-6 门禁（本轮新增 1 件 + 扩 1 件）

- 新建 `scripts/verify-dashboard.mjs`（**≥ 24 项断言**，plain-node 直 import `src/core/domain/dashboard.ts` **带 `.ts` 真源**，照 `verify-finance.mjs` 范式，附独立整数预言机复算、禁 emoji 输出断言）：
  `isInProgress` 六态全覆盖；`monthKey` 跨年 / 月末 / 补零；`prevMonthKey` 1 月→上一年 12 月；`signedAmountAt` 本月计入 / 上月计入 / 非签约不计 / 脏值不计 / `prev=0 → momPct null` / 独立分单位复算；`collectionRate` 分母 0 与负 → null、四位舍入；`collectionLight` **0.8 恰等归 green**、0.7999 → yellow、null → neutral；`riskItemCount` 相加 + 非有限按 0；`formatSignedPercent` 正 / 负（**U+2212 非 ASCII 连字符**）/ 零。
- `scripts/qa-shots.mjs`：`targets` 数组**最前**加 `{ name: "00-dashboard", path: "/dashboard" }`（32 → 33 页）。
- 既有门禁**零回退**：quote 69 / crm 11 / health 20 / design 28 / schedule 55 / quality 108 / finance 135。
- 四隔离库集成门禁：本轮 `core/domain` **仅新增文件**、schema/seed 零改动 → 按 `STATUS.md` §8 规则**免重跑**（由集成者在验收记录里登记裁定理由）。

### 6-7 集成者验收（M9-b-1）

`pnpm build` 绿 + `npx tsc --noEmit` 0 + 新 `verify-dashboard` ≥24 + 七纯门禁零回退 + qa-shots 33 页全 200 + 目检（KPI 阶梯权重 / 回款率进度条 / 矩阵三灯与未排程灰态 / 待办七类含灰占位 / 三块占位卡无假数据）+ 375 探针 `/dashboard`（`scrollWidth ≤ 375`，别用肉眼判溢出）+ **驾驶舱实值巡检**（临时脚本 `_scratch/m9b_dash_check.mts`：把 overview 的 KPI/矩阵/待办计数与逐项目 prisma 直读复算逐项对照，防 `STATUS.md` §5 的「算了没渲染」与口径漂移）。

### 6-8 M9-b-1 文件白名单与禁区（派工卡照抄）

**可新建**：`src/modules/dashboard/manifest.ts`、`src/core/domain/dashboard.ts`、`src/modules/dashboard/server/overview.ts`、`src/app/dashboard/page.tsx`（如需客户端子件：`src/app/dashboard/*.tsx`）、`scripts/verify-dashboard.mjs`。
**可改动（各仅必要行）**：`src/modules/registry.ts`、`scripts/qa-shots.mjs`。
**禁区（一行都不许动）**：`prisma/**`、`src/core/domain/{ledger,health,pricing,types,projects,acceptance,rbac}.ts`、`src/core/ui/**`、`src/styles/**`、`src/app/{layout,page,loading,error,not-found}.tsx`、`tailwind.config.ts`、`package.json`（**禁装任何图表库**：图留给 b-2 手绘 SVG）、`src/modules/{budget,crm,design,finance,projects,quality,schedule}/**`（含各模块 server 内部）、除外的 12 个门禁脚本、`docs/**`。
**禁止命令**：`pnpm dev`、`pnpm build`、`git *`（不 commit / 不 checkout / 不 stash）、`prisma migrate|db push|db seed|studio`、`npx prisma`、任何 `pnpm add|npm i`、任何删文件动作。**允许** `npx tsc --noEmit` 与 `node scripts/verify-dashboard.mjs` 自检。

### 6-9 M9-b-2 预告（本轮不做，下轮展开为独立规格）

`src/core/domain/dashboard.ts` 追加 `monthKeysDescending` / `cashSeries` → 商务漏斗（Lead 五阶段计数 + 相邻阶段转化率，SVG 手绘梯形，单 accent + 灰阶，**不装图表库**）+ 利润两图（近 6 个月现金折线 = `Σincome` 与 `Σ(income−expense)`，标题明写「现金收付口径」§1-12；项目毛利率排行条形 = 复用 `ledger.marginRate`，`null` 项目排末位显「不可算」）+ **seed 补演示**（线索补至 5 阶段各 ≥2 条、收支铺近 6 个月，日期自洽——见 `STATUS.md` §5「演示数据时间自洽」条）。**动 seed ⇒ 四隔离库集成门禁全量重跑**。

### 6-10 与 v5.1 §6.1 的偏差（集成者注，均已与 HAE 确认）

| v5.1 原文 | 本平台取法 | 理由 |
|---|---|---|
| 4 KPI = 在建项目数 / **本月新签合同额（台账当月 income+contract）** / **本月回款率** / **人均产值** | 在建项目数 / 本月签单额（**签约建项项目合同额**，§1-10）/ 全司回款率（非"本月"，全司口径）/ **风险项数**（§1-11） | 台账 income 是现金收款事实、不是签约动作；人均产值依赖 hr 绩效数据（DEFERRED），不造假 KPI |
| 中右 40% = **人效排行榜**（金/银/铜标 + 预警人员） | 灰占位「未接入：人员管控模块未上线」 | `hr` 模块属 deferred，无 `Performance` 表 |
| 底部左 = 本月签单趋势折线 | 月度**现金收付**折线（b-2） | 项目毛利率口径无时间序列（§1-12） |
| 待办中心 = 待审批绩效 / 超预算预警 / 逾期未完工 / **待确认变更单** | 六类真口径 + 绩效灰占位（§6-4 表）；**无"待确认变更单"** | 本期无审批流（§1-2），变更单录入即生效，无"待确认"态可数 |
| 预算灯 = 超预算红 / 已用超 85% 黄 | 沿用 `health.budgetLight`（已收 vs 合同额+变更）语义不动 | 20 条断言锁死（§0 红线），驾驶舱只消费不重定义 |

## 7. M9-b-2 详细范围（图表批 · 权威规格）

> 拆两轮：**M9-b-2a = seed 补线索 + 商务漏斗（M3-e 清账）**｜ **M9-b-2b = 月度现金折线 + 项目毛利率排行条形（含台账增补）**。
> 拆由：`seedFinance()` 的自检把「收支 11 笔」与三项目毛利率锁死（`prisma/seed.ts` 末尾自检块），而 `verify-finance-flow.mts` 的**库初态守卫**同样硬编码「付款段 15 · 收支记录 11 · 变更单 2」——**动收支＝牵动毛利断言 + 守卫常量 + 目检基线三处**，与漏斗不是一回事，故分轮隔离风险。执行通道：2a = codebuddy 三号池（已随卸载作废，见 §5 记录）；**2b = opencode standalone 讯飞池 `imodel/GLM-5.3-Flash`（工作手册 §8.3）**。

### 7-1 商务漏斗口径（本轮集成者裁定，替代 v5.1 §6.2.4 的"转化率漏斗"画法）

- **只画当前 `stage` 存量分布**（五阶段各多少条线索），**不画相邻阶段转化率**——本平台没有阶段流水表，`Lead.stage` 只有现值，"到达过某阶段"的累计数**算不出来**；用存量比冒充转化率＝造假日指标（违反 §0 禁 mock 完成准则）。
- 唯一真指标：**签约率 = `signed` 线索数 / 全部线索数**（`core/domain/dashboard.ts` 新增纯函数 `leadConversion(leads: {stage:string}[]): number|null`，分母 0 → null，UI 显「—」）。
- 阶段计数纯函数同文件新增：`funnelCounts(rows: {stage:string}[], order: readonly string[]): {stage:string; count:number; pct:number}[]`，按传入 `order` 顺序输出、`pct = count/total`（total 0 → 各 `pct` 0）；**中文标签不进 core**（`crm/stages.ts` 属模块私有禁区，dashboard 不得 import）→ 服务层只回 stage 串，页面用本地常量映射中文（站内 `ProjectTabs`/`finance` 各自本地映射是既有先例）。
- 累计漏斗（需 `LeadStageLog` 流水表）= **DEFERRED**，卡上不许顺手建表。

### 7-2 seed 补线索（幂等 + 自检 + 时间自洽）

`prisma/seed.ts` 新增 `seedLeads()`（照 `seedChanges()` 幂等范式：**按 `code` 存在性跳过**，不靠总数判断）：

- 未签四阶段各补至 **≥2 条**（现仅 `LEAD-2026-001 contacted` / `002 quoted`）→ 新增 `leads` / `confirmed` 各 2 条 + `contacted` / `quoted` 各 1 条，共 6 条；`intentLevel` 有 high/medium/low 分布、`budgetRange`/`estate`/`source` 有值（`source` 用既有渠道词表，与 `Project.source` 同源），`lastFollowAt` 落在 `createdAt` 之后且不晚于今天。
- **两条已签线索配套建项目**（让漏斗有顶格 + 让「本月签单额」的环比有真值可比）：
  - `LEAD-2026-007`（**本月**签）→ 项目 `RP-2026-005`，`contractAmount = 218000`；
  - `LEAD-2026-008`（**上月**签）→ 项目 `RP-2026-006`，`contractAmount = 176000`；
  - 两条都走 `core/domain/projects.createProject`（**不直写 `prisma.project.create`**）——与真实签约行为一致：自动建草稿 `BudgetQuote`、Client 按手机号归并；再回写 `Lead.projectId` + `stage = "signed"` + `lastFollowAt`。`createdAt` 分别落在本月与上月（用 `new Date(y, m, d)` 本地构造，避开月末 UTC 漂移）。
  - **不建**付款计划段、**不建**收支台账、**不建**变更单 → `verify-finance-flow` 初态守卫（15/11/2）与 `seedFinance` 自检（收支 11）**不受影响**。
- 最终自检块：线索计数打印改取 `prisma.lead.count()` 真值 + 断言「五阶段各 ≥2 条」+「`signed` 线索的 `projectId` 非空」（漏回写会被这条抓到）。

### 7-3 驾驶舱漏斗块（替换 §6-5 三块灰占位之一）

`/dashboard` 的「商务漏斗」占位卡改真内容：五阶段**横向存量条**（每行：阶段中文名 + `num` 计数 + 条宽按 `pct`），条色**只用 accent 与灰阶**（`bg-accent` 填充 / `bg-sunken` 轨道，**禁五阶段五色**）；下方一行 `text-xs text-secondary` 显「签约率 {formatPercent(rate)}」，`null` 显「—」；副标题必须写「阶段存量分布（非累计流量）」，避免读者按真漏斗读。整块零写入、零新表。

### 7-4 门禁与验收（2a）

`verify-dashboard.mjs` 扩 `funnelCounts` / `leadConversion` 断言（空集、单阶段、五阶段全覆盖、`pct` 合 1 容差、分母 0 → null、禁 emoji），目标 **43 → 55±**；**动 seed ⇒ 四个隔离库集成门禁全量重跑**（sign 12 / schedule-gen 27 / quality-flow 94 / finance-flow 76，各自先 `migrate reset --force` 重灌 seed）；`pnpm build` 绿 + tsc 0 + qa-shots 33 页全 200 + 目检（漏斗五阶段条 / 签约率真值 / 环比不再显「不可比」）+ 375 探针 `/dashboard` + 实值巡检扩（`_scratch/m9b_dash_check.mts` 加漏斗计数与签约率两条独立复算）。

### 7-5 已登记影响（2a 合入后须同步的基线）

新增 2 个项目 → `STATUS.md` §1 数据基线（项目数、`/finance` 汇总合同额与回款率分母）、`/projects` 与 `/budget` 列表截图基线、驾驶舱 KPI 目检数字全部要更新；`verify-quote.mjs` 的「逐单循环检查」随库中报价单数浮动（新增 2 张草稿单 → 计数上涨属预期，不是回退）。

### 7-6 M9-b-2b 预告（已由 §7-7 展开为权威规格；两处与 §5「演示数据时间自洽」冲突处见 §7-7-1）

台账增补走 **`income/change`（变更款收款）** 类目——已核 `getPlanView` 的对照条只统计 `category = "contract"` 切片（`ledgerContractIncome`），加 `change` 类收入**不破坏两本账一致对照**；配合把既有 7 笔 expense 的日期重排到近 6 个月（**金额不动 → 毛利与毛利率断言零变化**），让月度折线有真实形态。折线两条线（当月收款 accent / 当月支出 灰阶），净现金用下方小表 + `success`/`warning` 语义色文字，**不画第三条线**；毛利率排行条形单色 accent、`marginRate` 为 null 的项目灰态「不可算」排末位。口径函数 `monthKeysDescending` / `cashSeries` 追加到 `core/domain/dashboard.ts`。

### 7-7 M9-b-2b 权威规格（月度现金收付折线 + 项目毛利率排行条形）

> 执行通道（本轮起变更）：**opencode standalone 讯飞池**——`node "E:\19 Python File\opencode\oc.mjs" -m imodel/GLM-5.3-Flash --dir "<仓绝对路径>" "$(cat 派工卡.md)"`（codebuddy 已卸载、Loomy `attach` 暂停，见工作手册 §8.1/§8.2/§8.3）。三小轮串行、每轮 2 文件、派工卡事实自包含（承 §5「长批断流」与「seed 按不变量写」两条教训）。schema/seed 的**执行**归集成者。

#### 7-7-1 与预告的两处偏离（集成者裁定 · 2026-10-11 · 待 HAE 复核）

**① 不重排既有 7 笔 expense 的日期**（§7-6 原句作废）。实测 dev.db：三演示项目最早开工日 `RP-2026-002 = 2026-08-02`（003=08-06 / 001=09-01），现有 7 笔支出已全部落在各自施工期内（08-17 ~ 10-06）。把任何一笔挪到 5~7 月＝造出「开工前采购主材 / 竣工后付人工」的反序，直接违反 `STATUS.md` §5「演示数据的时间自洽要主动回填」。**本单元改为**：现金窗口仍固定**近 6 个月**（决策 13），5~7 月**如实为 0**——那三个月这套演示数据里确实没有现金动作，属真实空白而非缺数据；台账增补只做 §7-6 的另一半＝**2 笔 `income/change` 变更款收款**（001 +3200 / 002 +2800，收款日 ≥ 各自变更单日期且 ≤ 今天）。金额与日期都不动既有行 ⇒ **毛利、毛利率、付款计划、两本账对照四组断言零变化**（income 不进 `grossProfit`/`marginRate`）。

**② 毛利率排行不展示「无成本数据」的 100%**（登记为 §1 决策 15）。`marginRate` 口径＝(合同额+变更−支出)/(合同额+变更)，未录任何支出的项目（`RP-2026-005/006/007` 三个签约筹备项）按口径恰得 `1.0`。数字算得出、但没有成本数据支撑，摆在榜首会误导读者（同 §0「禁 mock 兜底数字」精神）。**改为**：`rate !== null && expenseTotal > 0` 才入榜；`expenseTotal === 0` → 灰态置末、文案「未录入支出」、率显「—」；`rate === null` → 灰态置末、文案「未录入合同额，不可算」。与「未排程」「未录入合同额」两处既有诚实降级同族。**口径本身零改动**（仍只消费 `ledger.marginRate`），改的是"要不要把这个数摆出来"。

#### 7-7-2 数据模型

零新表、零迁移。**只新增一个 seed 步骤** ⇒ 按 §4 规则**四个隔离库集成门禁全量重跑**。

#### 7-7-3 共享口径（`src/core/domain/dashboard.ts` 追加，既有函数一律不改）

自包含纪律不变（plain-node 直 import、内联 `round2`/`round4`、不 import 任何东西）。取数口径与 `ledger.receivedTotal`/`expenseTotal` 一致（按 `type` 取数不看符号、脏值/负数按 0）——同源公式内联，由门禁交叉断言锁死，不跨文件 import。

```ts
/** 近 n 个日历月键，**由近到远**（首元素＝当月）。n<=0 / 非有限 → []；跨年正确。 */
export function monthKeysDescending(n: number, now: Date): string[];

/** 月度现金序列输入（date 用于落本地日历月桶；形状与 prisma FinanceRecord 投影一致）。 */
export interface CashRow { type: string; amount: number; date: Date }
export interface CashPoint { key: string; income: number; expense: number; net: number }
/** 按传入 keys **给定顺序**逐键输出月度现金收付点（§1-12 现金收付口径）。
 *  keys 里没有的现金行直接忽略；某 key 当月无现金 → 三点全 0（真实空白，不许显「—」也不许造数）。
 *  net = round2(income − expense)，可为负。落月用 monthKey（本地，禁 toISOString）。 */
export function cashSeries(rows: CashRow[], keys: readonly string[]): CashPoint[];

/** 折线纵轴峰值 = max(所有 income 与 expense)，round2；空序列 → 0。 */
export function cashPeak(points: readonly CashPoint[]): number;

/** 净现金色档：net < 0 → "warning"；否则 "success"（非有限按 0 → success）。不输出 emoji。 */
export function cashTone(net: number): "success" | "warning";
```

#### 7-7-4 读模型服务（`src/modules/dashboard/server/overview.ts` 追加）

主查询 `financeRecords` 的 `select` **加 `date: true`（本轮唯一必要的既有行改动）**，其余零改动；新增两块视图模型，**几何与排序算式只在此文件出现一次**（沿 `barWidth`/`collectionBar` 先例：页面不做算式、不出现阈值字面量）。

```ts
export interface CashMonthPoint {
  key: string;                 // "2026-08"
  label: string;               // "8月"（跨年由 rangeLabel 交代，格内不显年份）
  income: number; expense: number; net: number;
  cashTone: "success" | "warning";
  xPct: number;                // 中心等分 (i+0.5)/n*100，一位小数 ⇒ 与月份轴 grid-cols-6 对齐
  incomeY: number; expenseY: number;  // 0＝峰顶、100＝基线；peak<=0 时两点均 100
}
export interface DashboardCash {
  points: CashMonthPoint[];    // 近 6 个月，**左→右时间升序**
  peak: number;                // 纵轴峰值（0 → 图内两点贴基线，如实显「暂无现金」）
  totalIncome: number; totalExpense: number; totalNet: number;
  rangeLabel: string;          // "2026-05 ~ 2026-10"
  hasAnyCash: boolean;         // 六个月内是否出现过任何一笔现金
}
export interface MarginRankRow {
  id: string; code: string; name: string;
  rate: number | null;         // ledger.marginRate 原值
  light: MarginLight;
  barWidth: string | null;     // rankable 才给（一位小数百分比串），否则 null ⇒ 页面不渲条
  rankable: boolean;
  note: string | null;         // 灰态文案（rankable 时 null）
}
export interface DashboardMargins { rows: MarginRankRow[] }
```

- 范围＝与 KPI/矩阵同一批（主查询的非 archived 项目），不另发查询（**零 N+1、零写入**）。
- 排序：`rankable` 按 `rate` 降序、同值按 `code` 升序；其后接「未录入支出」组（`code` 升序）；最后接「未录入合同额，不可算」组（`code` 升序）。
- `barWidth` = `rate>0 ? round1(rate*100)% : "0%"`（率可为负：支出超合同+变更时如实为负 → 条宽 `"0%"`，数值照显负率）。
- `marginRate`/`marginLight` 一律调 `core/domain/ledger`，**本文件不写 0.25/0.15 等阈值**。

#### 7-7-5 页面（`src/app/dashboard/page.tsx`，仍 server component、零 `"use client"`）

版式改为：新增第五 section 放两图（`grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`，与「矩阵 + 待办」同构）；原 §6-5-5 那行三块占位改为**只留 商务漏斗 + 人效排行**（`sm:grid-cols-2 items-start`），漏斗块一行不动。

- **月度现金收付折线**（左卡）：标题 `月度现金收付`，副标题**必须明写**「现金收付口径 · {rangeLabel}」（§1-12 硬要求，防读者按项目毛利率读）。图例两行 `text-xs`：收款＝accent、支出＝`--text-disabled` 灰阶，**禁五色、禁渐变、禁阴影**。图形用手绘 SVG：`viewBox="0 0 100 100"` + `preserveAspectRatio="none"` + `vectorEffect="non-scaling-stroke"`（描边不随非等比缩放变形），两条 `<polyline>` 直接用服务层 `xPct/incomeY/expenseY` 拼 `points`，基线一条 `stroke="var(--border)"`；**SVG 内不放文字**（避免非等比缩放拉伸字形），月份轴用下方 `grid grid-cols-6` 的 HTML 文本、与 `xPct` 中心等分对齐。`hasAnyCash === false` → 不画线，显「近 6 个月暂无现金记录」。图下净现金小表：六行 `月份 / 收款 / 支出 / 净额`（`formatCny`，净额 `text-success|text-warning` 只换字色不铺底），表下一行合计。
- **项目毛利率排行**（右卡）：标题 `项目毛利率排行`，副标题「口径：合同额+变更−支出（项目维度）」（与折线口径明示不同）。每行＝项目名截断 + `code`（`num text-xs text-muted`）+ 条（`h-2 bg-sunken` 轨道 / `bg-accent` 填充，**单点 accent 只给入榜条**）+ 率（`formatPercent`）+ `marginLight` 色点。灰态行不渲条、率显「—」、`text-muted` 文案给原因。**空态**：「暂无项目」。

刻度仍守 12/13/15/17/20/28 与 4/8/12/16/24/32/48；页面不得出现 `(n*100).toFixed(1)` 之类就地算式。

#### 7-7-6 seed（`prisma/seed.ts`）

新增 `seedChangeIncome()`，在 `main()` 里**排在 `seedLeads()` 之后**（金额取自 `seedChanges()` 建的变更单，顺序不可提前）。幂等按**不变量**写、不按条数写：

- 逐项目（`RP-2026-001`/`002`）：先查该项目是否已有 `category="change"` 的 income 行，**有则跳过该项目**（手测已自录变更款时不重复建、也不报错）。
- 金额＝该项目 `changeTotal`（走 `core/domain/ledger`，与页面同一口径），`<= 0` 跳过；`type:"income"`、`category:"change"`、`description:"变更款收款（seed 演示）"`、`recordedBy: getFinanceUser()`。
- 日期＝`min(该项目最晚变更日期 + 5 天, 今天)`，保证 ≥ 变更日且不晚于今天（承 §5 时间自洽）。
- **关键连带修**：`seedFinance()` 末尾自检的 `frTotal !== 11` 原式统计**全表**行数——本函数在其后追加 2 行，第二次跑 seed 时 `seedFinance` 会读到 13 而**自己抛错**（首轮不报、重跑才炸＝典型幂等陷阱）。故该断言改为**只数自己建的那批**：`count({ where: { category: { not: "change" } } }) !== 11`，头注释同步说明。
- 自检：报数取 DB 真值，断言「有正变更额且有报价单的演示项目，至少各有一条 `income/change`」+「`category="change"` 行合计 == `Σ changeTotal(001,002)`」。

#### 7-7-7 门禁与验收

- `scripts/verify-dashboard.mjs` 扩：`monthKeysDescending`（n=6 常规 / 跨年 / n=0 / n=负 / n=1）、`cashSeries`（空 rows 全 0 / 同月合并 / 跨月边界本地不漂移 / type 非收支不计 / 负与 NaN 按 0 / keys 外忽略 / 输出顺序＝keys 顺序 / net 可为负 / 独立整数分预言机）、`cashPeak`（空 0 / 取两列最大）、`cashTone`（0 success / 负 warning / NaN success）、与 `ledger.receivedTotal`/`expenseTotal` 的**同源交叉断言**（同一组 rows，`cashSeries` 合计 == `receivedTotal+expenseTotal`）。目标 **58 → ≥75**；输出禁 emoji 条继续覆盖新函数。
- `scripts/verify-finance-flow.mts`：**初态守卫 收支记录 11 → 13**（三处：判定 / 提示串 / 断言名）。其余基线（`grossProfit 24900`、`marginRate 0.3819`、付款段 15、变更单 2）**零变化**（income 不进毛利）。
- 既有八纯门禁零回退：quote 79（随报价单数）/ crm 11 / health 20 / design 28 / schedule 55 / quality 108 / finance 135 / dashboard 新计数。
- **动 seed ⇒ 四隔离库集成门禁全量重跑**（sign 12 / schedgen 27 / quality-flow 94 / finance-flow 76，各自 `migrate reset --force` 重灌 seed）。
- `pnpm build` 绿 + `npx tsc --noEmit` 0 + qa-shots 33 页全 200 + 目检（折线两条线形状 / 5~7 月贴基线为 0 且表内显 ¥0.00 不显「—」/ 月份轴与点位对齐 / 毛利率榜首是 002 38.6% 而非某 100% 项 / 005~007 灰态「未录入支出」置末 / 004「未录入合同额，不可算」最后 / `/finance` 已收款随 2 笔变更款上浮）+ 375 探针 `/dashboard`（`scrollWidth ≤ 375`，别肉眼判溢出）+ 实值巡检扩（`_scratch/m9b_dash_check.mts` 加六个月分桶逐月笨算与排行顺序复核）+ **seed 连跑两次幂等**（收支 13、变更款 2 条不变）。
- 同步基线（集成者）：`STATUS.md` §1 数据基线（收支 11 → 13、已收 ¥130,600 → ¥136,600、全司回款率与 001/002 预算灯/`paidPct` 数字）、§2 门禁表 dashboard 计数、§8 交接。
