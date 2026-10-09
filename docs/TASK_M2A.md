# 任务卡 M2-A · 全案主脊 schema（数据层批次）

> 状态：**待执行** ｜ 里程碑：**M2-A**（承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 路线 B）
> 执行通道：codebuddy `hy3`（0 credits，192k/64k）｜失败原卡重跑，一轮只给一个单元
> 前置阅读：`AGENTS.md`（§1 技术栈 / §4 核心域 / §5 预算模型）+ `docs/STATUS.md`（§5 坑）+ 本卡
> 集成者（QwenWork）守：`pnpm build` + 全部 `scripts/*.mjs` 门禁 + 三档截图目检
> **本卡只动数据层与常量/UI 选项，不做任何新页面、不接认证、不做通知。**

---

## 0. 一句话目标

把 `Project` 升级成全案共享主脊（纯新增可空列）、`User` 扩到 11 角色常量+部门、新建 `Lead`/`FollowUp` 两张表、`BudgetQuote` 加锁单位、并落一支 `health.ts` 派生纯函数（进度 + 三色灯）。**旧预算数据零破坏、零行迁移。**

---

## 1. 硬约束（红线，违反即打回）

1. **只加不改语义**：既有列（`code/name/address/area/clientId/designer/pm/status/startDate/endDate`）一律不动语义。新列必须**可空或带默认**。
2. **status 无需改 schema**：它是 `String`（SQLite 无 enum）。两个新态只加在 TS 常量层，**不产生行迁移、不 UPDATE 任何旧数据**。
3. **可移植 schema**（AGENTS §1）：禁 PG 专有类型；枚举用 `String` + 常量；不用 `Json`/数组；外键用 `String`。
4. **不碰 `QuoteItem` 保存逻辑**（`deleteMany`+`createMany` 保持原样，PLAN §7.2）。
5. **不建任何"本期无消费方"的表**：`ProcessTemplate`/`CheckItem`/`ChangeOrder`/`FinanceRecord`/`PaymentNode`/`DesignTask`/`ScheduleTask`/EAV 一律**不建**（归后续里程碑）。
6. **三色灯返回语义 token 非 emoji**：`green|yellow|red`，UI 渲成 V0.3 色点（PLAN §7.4）。
7. 中文文案；金额/计数口径后端算、单一真源。

---

## 2. Schema 变更（列级 diff）

### 2.1 `Project` — 新增 7 列（全部可空/默认，**无行迁移**）+ 1 关系

```prisma
model Project {
  // …既有列全部原样保留，勿动…
+ contractAmount Float     @default(0)   // 合同额；0=未录入（哨兵，budgetLight/毛利遇 0 走中性）
+ houseType      String?                // 户型
+ style          String?                // 风格偏好
+ source         String?                // 获客渠道（签约时从 Lead.source 带入，供驾驶舱归因）
+ inspector      String?                // 工程巡检（本期文本，P4 再改 userId）
+ budgetAnalyst  String?                // 预算员（同上）
+ actualEndDate  DateTime?              // 实际完工（endDate 语义澄清为"计划完工"，不改列）
+ lead           Lead?                   // 反向：签约线索（真源在 Lead.projectId @unique）
}
```
> `endDate` = 计划/预计完工（B3 设置页「工期止」即此），**不新增 estimatedEndDate、不改名**，只补 `actualEndDate`。

### 2.2 `User` — 新增 1 列（认证仍不接）

```prisma
model User {
  // …既有列原样…
+ department String?                     // management | business | design | engineering
}
```

### 2.3 `BudgetQuote` — 新增 1 列（签约锁单最小位；多版本历史 DEFERRED）

```prisma
model BudgetQuote {
  // …既有列原样…
+ lockedAt DateTime?                     // 签约锁单时刻；null=未锁
}
```
并把 `QUOTE_STATUS` 常量加 `locked`（schema 仍是 String）。

### 2.4 `Lead` — 新建

```prisma
model Lead {
  id           String    @id @default(cuid())
  orgId        String
  code         String    @unique          // LEAD-YYYY-NNN
  name         String
  phone        String?                    // 归并键（M3 签约按此并 Client）
  estate       String?                    // 楼盘
  area         Float      @default(0)
  style        String?
  budgetRange  String?                    // 意向预算区间（文本，非精确）
  source       String?                    // 获客渠道
  stage        String     @default("leads") // leads|contacted|confirmed|quoted|signed
  intentLevel  String     @default("medium") // high|medium|low
  assignee     String?                     // 负责人（本期文本）
  lastFollowAt DateTime?
  nextFollowAt DateTime?
  projectId    String?    @unique          // 签约回写，1-1；未签为 null
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  org       Organization @relation(fields: [orgId], references: [id])
  project   Project?     @relation(fields: [projectId], references: [id])
  followUps FollowUp[]

  @@map("leads")
}
```
`Organization` 加回边 `leads Lead[]`。

### 2.5 `FollowUp` — 新建（1-N 子表，**非长文本**）

```prisma
model FollowUp {
  id           String    @id @default(cuid())
  leadId       String
  date         DateTime  @default(now())
  content      String
  nextFollowAt DateTime?
  createdAt    DateTime  @default(now())

  lead Lead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@map("follow_ups")
}
```

### 2.6 明确不改 / 不建
`Organization`/`Client`/`CatalogCategory`/`CatalogItem`/`QuoteItem` 结构零改动；不建 §1.5 列出的任何表。

---

## 3. 派生层 `src/core/domain/health.ts`（纯函数，不落库）

单一口径真源。**无对应数据时优雅降级返回中性，禁止造数**（schedule 数据 M6、quality M7、finance M8 才有）。

```ts
export type Light = "green" | "yellow" | "red";

// 整体进度 = 工序 progress 均值；无工序 → 0
overallProgress(tasks: { progress: number }[]): number      // Math.round 取整

// 工期灯：actual>plan→red ｜ (plan-today)<=7天 且 progress<80→yellow ｜ 否则 green
// plan(endDate) 缺失 → green（降级）
scheduleLight(a: { endDate: Date | null; actualEndDate: Date | null; progress: number }, today: Date): Light

// 质量灯：openIssue>0→red ｜ pendingNode>0→yellow ｜ 否则 green
qualityLight(a: { openIssues: number; pendingNodes: number }): Light

// 预算灯：paid>contract+change→red ｜ paid>0.85*(contract+change)→yellow ｜ 否则 green
// contract+change==0（未录入）→ green（哨兵降级，不误报红）
budgetLight(a: { contractAmount: number; changeTotal: number; paidTotal: number }): Light
```
> `changeTotal`/`paidTotal` 暂由调用方传入（0 起步），M8/M9 接真数据；函数本身不查库、不 import prisma（可被脚本直接 import 测）。

---

## 4. 常量 / UI 选项改动（`status` 两新态落这里，非 schema）

**`src/core/domain/types.ts`**：
```ts
export const PROJECT_STATUS = {
  draft: "draft",            // 筹备中（既有）
+ design: "design",          // 设计中（新增）
  in_progress: "in_progress", // 施工中（既有）
+ acceptance: "acceptance",  // 验收中（新增）
  completed: "completed",
  archived: "archived",
} as const;
// PROJECT_STATUS_LABEL 加 design:"设计中", acceptance:"验收中"
+ export const PROJECT_STATUS_ORDER = ["draft","design","in_progress","acceptance","completed","archived"] as const; // 供后续 stepper/排序
// USER_ROLE 扩到 11 常量 + +USER_ROLE_LABEL；department 常量
```

**⚠️ 穷举 `Record<ProjectStatus, …>` 会在编译期报错逼你补全——这是安全网，逐个补齐：**
| 文件 | 位置 | 动作 |
|---|---|---|
| `src/core/domain/types.ts` | `PROJECT_STATUS_LABEL` | 加 design/acceptance 标签 |
| `src/app/budget/page.tsx` | `STATUS_BADGE`（约 15-19 行） | 加 design→`"accent"`、acceptance→`"neutral"`（用现有 BadgeVariant，勿自造色） |

**TS 抓不到、必须手改的唯一处（历史踩点）：**
| `src/app/budget/[projectId]/ProjectSettingsForm.tsx` | `STATUS_OPTIONS`（普通数组） | 手动补 design/acceptance 两项，顺序按 `PROJECT_STATUS_ORDER` |

> `QuoteBoard.tsx`/`page.tsx`/`settings/page.tsx`/`server/projects.ts` 读 `status` 处经核对为**取值渲染、非枚举穷举**，加两态不破；确认即可，勿改逻辑。

---

## 5. 迁移与 seed

- 一条新迁移（`add_m2a_spine`）承载 §2 全部变更。**开发库用 `prisma migrate dev`**；SQLite 无 down-migration，回滚见 §8。
- `prisma/seed.ts`：
  - **预算既有 seed 完全不动**（保护 ¥61,990.76 基线与 `verify-quote` 17 断言）。
  - 新增 **2 条 Lead**（不同 stage，如 `contacted`/`quoted`）+ 每_lead_ ≥1 `FollowUp`。
  - **不**从 lead 自动建 project（那是 M3）；`Lead.projectId` seed 留 null。
  - **报数取 DB `count` 并加自检断言**（承 STATUS：seed 日志抄常量曾掩盖空入库事故）。

---

## 6. 门禁与断言（本卡新增 `scripts/verify-health.mjs`）

Node 24 原生 `import` 生产 `health.ts`，独立预言机复算，至少覆盖：
- `overallProgress`：`[]→0`；`[{50},{100}]→75`；四舍五入边界。
- `scheduleLight`：逾期→red；剩 ≤7 天且 progress<79→yellow；同况 progress≥80→green；endDate 缺失→green。
- `qualityLight`：open>0→red；open=0&pending>0→yellow；否则 green。
- `budgetLight`：paid 超 total→red；paid>85%→yellow；否则 green；total=0→green（哨兵）。
- 全函数返回值为 `green|yellow|red`，**断言输出不含任何 emoji**。

**回归必跑（全绿才算完）**：`pnpm build` + `verify-quote.mjs`（17，须仍全绿）+ 新 `verify-health.mjs`。
**UI 目检**：`/budget` 列表页（badge 无回归）、`/budget/[projectId]/settings`（status 下拉含 6 项、默认仍筹备中、旧值正常回填）三档截图 1440/1280/375。

---

## 7. 完成定义（DoD，逐项勾）

- [ ] 迁移从干净库可 `migrate dev` 一次成功；`Lead`/`FollowUp`/新列/`lockedAt` 全部就位。
- [ ] 旧预算 4 项目/16 明细**数据未变**、`verify-quote` 17 全绿。
- [ ] `ProjectStatus` 扩两态后 `pnpm build` 编译通过（穷举 map 已补，STATUS_OPTIONS 已手改）。
- [ ] 三色灯 + 进度 `health.ts` 纯函数无 prisma 依赖、`verify-health` 断言全绿、非 emoji。
- [ ] 设置页 status 下拉显示 6 态、旧项目回填正确、三档截图无横向溢出。
- [ ] seed 后 `Lead` count 与日志一致（取 DB count 自检）。
- [ ] 未触碰 §2.6 禁改表、未建 §1.5 禁建表。

---

## 8. 回滚与风险

- **回滚**：`prisma migrate reset`（开发库重跑迁移+seed）。**勿手删表**。集成者在合入前会先备份 `dev.db`。
- **风险点**：
  1. `Lead.projectId @unique` + `Project.lead` 一对一边界——确保未签约 lead 的 null 不被 Prisma 当唯一冲突（SQLite null 互不相等，OK；迁移后建 2 条 null projectId seed 验证）。
  2. 穷举 map 漏补→编译期即报错（好事），但 `STATUS_OPTIONS` 数组漏改不报错→靠 §7 截图目检兜。
  3. `health.ts` 若被误接 prisma/查库→`verify-health` 无法纯 import 测→打回。

---

## 9. 交付物清单（文件级）

- 改：`prisma/schema.prisma`（§2）｜`prisma/seed.ts`（§5，预算 seed 不动）
- 改：`src/core/domain/types.ts`（§4）｜`src/app/budget/page.tsx`（§4 badge）｜`src/app/budget/[projectId]/ProjectSettingsForm.tsx`（§4 STATUS_OPTIONS）
- 新：`src/core/domain/health.ts`（§3）｜`scripts/verify-health.mjs`（§6）
- 新：`prisma/migrations/<ts>_add_m2a_spine/`
- 附：一段 PR 式小结（做了什么/回归结果/截图路径），供集成者复核合入 master。

> 本卡是 M2-A 唯一执行标准；与 `PLAN_FULL_SERVICE_V1.md` v1.2 §5-M2-A 冲突时以本卡为准并回报差异。
