# 任务卡 M5 · 设计任务（`design` 模块）

> 状态：**待执行**（拆 M5-a / M5-b / M5-c / M5-d） ｜ 承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 §5-M5
> 前置：M2-A 主脊（Project 全字段 + health.ts）+ M3（crm）+ M4（projects 六合一详情，已留「设计进度」空 Tab）均已合入
> 执行通道：codebuddy `custom-local:auto`（本地代理网关选路，本会话验通 8787→200），master 串行；集成者守 build + 断言 + 截图
> 动手前读：`AGENTS.md` §2/§4/§5、`docs/TASK_M4.md`（模块注册/详情范本）、`src/modules/crm/stages.ts`（状态机纯函数范本）、`src/modules/crm/server/leadMatch.ts` + `scripts/verify-crm.mjs`（纯函数门禁范本）、`src/core/domain/rbac.ts` + `types.ts`（USER_ROLE）、`prisma/schema.prisma`（Project/User 现状）

---

## 0. 目标

新建可插拔 `design` 模块 = **设计任务全生命周期**：派单 → 执行者提交（版本化）→ 设计师审核通过/退回（原因必填）→ 返修率；配任务看板（双视角）与设计日历。把 M4-b 详情页里「设计进度」那个诚实空 Tab 填成真数据。

**范围红线**：只做 `PLAN §M5` 四件事（看板双视角 / 提交版本历史 / 审核状态机+返修率 / 设计日历）。**报价编制留 `budget` 模块**——v5.1 把「预算报价单」误归设计管理，不跟；设计管理最多放一个「跳预算」链接，不放报价编辑器。

## 1. 关键架构决策（先定，防跑偏）

1. **跨模块主脊外键（AGENTS §2/§4）**：`design` 的新表 `DesignTask` **必须** `projectId` 外键引用共享 `core/domain` 的 `Project`，不得自造项目字段。`TaskSubmission` 挂 `DesignTask`。将来 quality/schedule/finance 同挂此 Project，项目详情才能汇总。
2. **多用户铺路（关键）**：`assignedTo` / `reviewerId` / `submittedBy` **一律存 `User.id`（userId）**，不用自由文本（与 `Lead.assignee` 存文本的做法刻意不同）。当前无登录，用一个占位「当前用户」常量驱动视角过滤，P4 接登录时只换数据源、不改表、不返工历史数据。
3. **状态机集中定义**：仿 `crm/stages.ts` 抽 `design/status.ts` 纯函数（无 prisma、可被客户端安全 import）：`DESIGN_TASK_STATUS_ORDER` + `DESIGN_TASK_STATUS_LABEL` + 转移谓词（`canSubmit`/`canReview`/`nextStatusAfterReview`）。返修率、按钮门控都走它，不散落。
4. **返修率口径**：一个 `DesignTask` 从首次 `submitted` 到 `approved`，其间被 `rejected` 的提交次数即该任务的返修轮次；模块级返修率 = `Σ返修轮次 / 已提交任务数`（或「有退回的任务占比」，**M5-c 定死一种并写进断言预言机**，不许两个口径混用）。
5. **诚实空状态**：无 seed 数据时看板/日历显空态引导（气声描边、无阴影、单点钴蓝），**绝不造假数字/假灯**。设计交付物上传（图片/文件）本期 DEFERRED——`TaskSubmission` 只留 `assetRef` 文本占位（可空），不做上传。
6. **不动共享主脊、不改旧模块行为**：只新增 `design` 私有表；budget/crm/projects 既有页面除「跳转/互链入口」外零改动。

## 2. 拆四个单元（一次一个界面单元，防 429 / 半成品）

| 单元 | 内容 | 优先级 |
|---|---|---|
| **M5-a** | `design` 模块注册（manifest + registry 加一行 + **从 `deferredModules` 删除 `design`**）；schema 迁移建 `DesignTask` + `TaskSubmission`（两表一次建齐，本单元只 Surface `DesignTask`）+ seed 若干任务；`/design` 任务看板**双视角**（设计任务池「全部」 / 「指派给我」，占位当前用户过滤）+ 按 status 列分组或筛选 | **P1** |
| **M5-b** | 执行者提交：`/design/[id]` 任务详情 + 「提交成果」表单（写 `TaskSubmission`，version 自增）；版本历史列表（倒序，含 assetRef/note/提交人/时间/当次结果） | **P1** |
| **M5-c** | 审核状态机：通过 / 退回（**退回原因必填**）→ 回写 task.status；抽 `design/metrics.ts` 纯 `reworkRate()` + 新 `scripts/verify-design.mjs` 门禁（仿 verify-crm：状态机转移 + 返修率预言机复算，≥12 断言） | **P1** |
| **M5-d** | 设计日历：`/design?view=calendar`（或 `/design/calendar`）按 `deadline` 排布 + 逾期标 danger 红 + 「跳预算」链接到 `/budget/[projectId]` | **P1** |

> M5-a 一次建齐两表是为省 SQLite 迁移轮次；M5-a 的 UI/服务**不得**引用 `TaskSubmission`（它 M5-b 才用）——留表不留假数据。

---

## 3. M5-a 详细范围

- 新建 `src/modules/design/manifest.ts`：`id="design"`、`name="设计管理"`、`entryPath="/design"`、`icon` 用单字符（如 `◈` 或 `✎`，禁 emoji）、`order` 排在 `projects` 之后（对齐 registry 目标顺序 crm→projects→design）。
- `src/modules/registry.ts`：`modules` 数组加 `designManifest`；**从 `deferredModules` 删除 `design` 那条**（它上线了）。首页/导航自动出现，不改外壳。
- `prisma/schema.prisma` 新增两 model（可移植、无 PG 专有类型、枚举用 string+const）：

```prisma
model DesignTask {
  id          String   @id @default(cuid())
  projectId   String                     // ★ 引用共享 core/domain Project，不得自造
  code        String   @unique           // DES-YYYY-NNN
  title       String
  type        String                     // scheme|floorplan|rendering|construction_drawing|measurement（见 design/types.ts 常量）
  status      String   @default("pending") // pending|assigned|submitted|revisions|approved（见 design/status.ts）
  assigneeId  String?                    // ★ userId，非自由文本；null=待分配
  reviewerId  String?                    // ★ userId，审核人
  requirement String   @default("")      // 需求说明，多行
  deadline    DateTime?
  priority    String   @default("medium") // high|medium|low
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  project     Project        @relation(fields: [projectId], references: [id])
  submissions TaskSubmission[]
  @@index([projectId])
  @@index([assigneeId])
  @@map("design_tasks")
}

model TaskSubmission {
  id           String    @id @default(cuid())
  taskId       String
  version      Int                       // 同 task 自增（服务层算 max+1）
  note         String    @default("")     // 提交说明
  assetRef     String?                    // 交付物链接占位（本期无上传，可空）
  submittedBy  String                     // ★ userId
  result       String    @default("pending") // pending|approved|rejected（本次提交审核结果）
  rejectReason String?                     // 退回时必填（M5-c 服务层校验）
  reviewedBy   String?                    // ★ userId
  reviewedAt   DateTime?
  createdAt    DateTime  @default(now())

  task         DesignTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  @@unique([taskId, version])
  @@map("task_submissions")
}
```

  → `Project` 侧加反向关系 `designTasks DesignTask[]`（唯一允许的既有 model 改动，仅加一行 back-relation）。
- 迁移：`pnpm prisma migrate dev --name add_m5_design`（集成者跑，**不进 codebuddy 授权范围**——见 §5）。seed 在 `prisma/seed.ts` 追加：给已有项目建 3–5 条不同 status 的 DesignTask（无 submission，留 M5-b），assigneeId 指向 seed 的 User 行（若无 User seed 则先补 2–3 个 designer/reviewer User，**这正是多用户铺路**）。
- `src/modules/design/server/tasks.ts`：`listDesignTasks({ scope, status? })` —— prisma 读 DesignTask + project 名/code + assignee User 名（join，只读）。`scope="all" | "mine"`，"mine" 用占位当前用户（见下）。返回字段：code/title/type/status/项目/负责人/deadline/priority/逾期标志。
- `src/modules/design/currentUser.ts`（或 core 里）：占位 `PLACEHOLDER_USER_ID` + `getPlaceholderUser()`，注释标「P4 接登录后替换为 session」。**不得**接真登录。
- `src/app/design/page.tsx`：看板双视角切换（复用 crm `ViewToggle` 思路）；「全部/指派给我」+ status 分组（按 `DESIGN_TASK_STATUS_ORDER` 列或筛选）；逾期 `deadline < now && status!=approved` 标 danger 红；点卡片 → `/design/[id]`（M5-b 建，本单元可留占位页防死链）；空态引导。
- `src/modules/design/status.ts`：仿 `crm/stages.ts` 的常量+谓词纯函数（本单元先建，供页面分组/上色用）。

## 4. M5-b / M5-c / M5-d 要点（各单元卡另起，此处只定边界）

- **M5-b**：`getTaskDetail`/`createSubmission`（version=max+1 事务）；`/design/[id]` 详情 + 提交表单 + 版本历史倒序；提交后 task.status→`submitted`。
- **M5-c**：`reviewSubmission`（通过→approved / 退回→`revisions`，退回原因必填否则服务层报错）；状态机转移合法性走 `status.ts`；`metrics.ts` 纯 `reworkRate(tasks)`；新 `scripts/verify-design.mjs` ≥12 断言（含：非法转移被拒、退回必填、version 连续、返修率两口径选一并与独立整数预言机一致、输出不含 emoji）。
- **M5-d**：日历视图按 `deadline`；「跳预算」链接 `/budget/[projectId]`（不进 `manifest.nav`，放页面内带真 id）。

## 5. 硬约束（四单元通用）

- 禁止 git（禁 `git commit`）；禁止 `pnpm dev`；**迁移/seed 由集成者跑，codebuddy 只写代码/schema/seed 文件本身**；唯一绿门 `pnpm build`。
- V0.3 刻度：字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48；无阴影、单点钴蓝 `#3368A0`；表头/按钮 `whitespace-nowrap`；375 不破版。三色灯/逾期用色点非 emoji。
- 跨模块读预算/项目走 `core/db` 的 prisma 直读，**不 import budget/crm/projects 的 server 内部**。
- 金额/计数/聚合后端算、单一口径、取 DB 真值不抄常量（seed 报数取 `count` 加自检）。
- `manifest.nav` 拿不到 id → 项目级/任务级入口只放页面内部。
- 完成度闸门：宁交完整可编译，不留半成品。改单一真源位置时同步检查所有 plain-node 门禁脚本 import 目标（勿穿无扩展名 re-export 链）。

## 6. 门禁与验收（每单元必跑，集成者独立复跑，codebuddy 自述不作数）

- `pnpm build` + `verify-quote 17` + `verify-crm 11` + `verify-health 20`（**不得回退**）。M5-c 后加 `verify-design ≥12`。涉及签约/事务改动时补跑 `verify-sign 12`。
- 截图 `node scripts/qa-shots.mjs`（1440/1280/375）：`/design` 双视角看板（含空态/逾期标红）、`/design/[id]` 版本历史与审核按钮门控、日历。**真缺陷历史上全靠截图抓，断言过≠对。**
- 手测闭环（M5-c 后）：分配→执行者提交→退回(填原因)→再提交→通过；版本历史完整；返修率数字正确。

## 7. 阻塞回报优先于瞎返

遇到「返修率到底用哪张口径」「占位当前用户放 core 还是模块内」「双视角看板用分列还是筛选实现」「seed 要不要建 User」等拿不准的，**先停下回报集成者**，别自作主张扩范围、造数或提前接登录。
