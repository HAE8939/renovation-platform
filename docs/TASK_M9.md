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
