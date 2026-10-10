# 任务卡 M6 · 工程排程（`schedule` 模块）

> 状态：**待执行**（拆 M6-a ~ M6-e） ｜ 承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 §5-M6；业务细节源 `Full-Service Project Management/装修经营管理平台 — 网站设计指导文档 v5.1.md` §6.5（只取业务不取皮）
> 前置：M2-A 主脊（Project + health.ts）+ M3/M4/M5 均已合入；`health.ts` 的工期灯/整体进度在本 M 接真数据源
> 执行通道：codebuddy（glm-5.2），master 串行；集成者守 build + 断言 + 截图
> 动手前读：`AGENTS.md` §2/§4/§6、`docs/TASK_M5.md`（模块注册/抽屉/状态机范本）、`src/modules/design/status.ts` + `src/modules/design/server/tasks.ts`（纯函数与服务层范本）、`scripts/verify-design.mjs`（门禁范本）、`src/core/domain/health.ts`、`prisma/schema.prisma` 尾部（DesignTask 现状）

---

## 0. 目标

新建可插拔 `schedule` 模块（名称「时间管控」）= **施工工序排程全生命周期**：按面积档模板一键生成排程 → 甘特图看进度（双轨）→ 拖拽调期 / 更新进度 → 全项目预警看板。把 M4-b 详情页「工期进度」空 Tab 填成真数据，并把 `health.ts` 工期灯 / 整体进度接到真排程数据源。

**范围红线**：
- 「排程 100% 完成 → 建验收节点」的副作用属 **M7**（`AcceptanceNode` 是 quality 私有表）——本 M **只留位不实现**（进度规则里 completed 是终态语义即可，不建表、不写钩子行为）。
- 不做：里程碑字段 / 移动端打卡 / 通知 / 甘特依赖自动级联重排（拖拽只平移当前行，不做半吊子调度器）/ 自定义多套模板（只维护一套内置模板的三档天数）/ 角色视角过滤（随 P4 角色切换再定）。
- 不 import budget/crm/design/projects 的模块内部；跨模块读一律经 `core/db` prisma 直读。
- **科目关联不建跨模块 FK**：甘特左侧工序名用本模块 `ProcessTemplate.name`，不挂 budget 的 `CatalogCategory`（模块边界 + 红线三；成本核算挂钩 M8/M9 再定）。

## 1. 关键架构决策（先定，防跑偏）

1. **私有表 3 张**（随模块下沉、经 `projectId` 挂共享 Project）：`ProcessTemplate` / `ScheduleTask` / `ScheduleTaskDependency`（**自引用依赖中间表**，承载"前置任务"多对多，支撑甘特连线与拓扑无环校验）。`Project` 侧只加一行反向关系。
2. **纯函数单一口径**（`src/modules/schedule/`，不碰 prisma、客户端可安全 import）：
   - `status.ts`：状态常量/标签/色 tone + `isTaskOverdue` + `applyProgressUpdate`（进度→状态联动规则）。
   - `plan.ts`：`areaTier`（面积→档）+ `buildSchedule`（模板+开工日→工序链）+ `chainEdges` + `hasCycle`（拓扑无环）。
   - 新门禁 `scripts/verify-schedule.mjs` 直 import 真源（带 `.ts` 扩展名），独立整数预言机复算。
3. **生成＝线性链**：面积定档 → 该档 `ProcessTemplate` 11 行按 `order` 排序 → 日期从 `Project.startDate` 起链（`task.start = 前序.end + 1 天`；`end = start + days - 1`，含当天）→ 相邻自动落依赖边（i 依赖 i-1，共 10 条）。结构支持将来非线性，本 M 只落链边。
4. **进度/状态不双写漂移**：唯一更新路径 `updateTaskProgress` 按纯函数规则一条事务联动——`0` → 重置为 pending（清 `actualStart`/`actualEnd`）；`1..99` → in_progress + `actualStart` 首写（不覆盖）；`100` → completed + `actualEnd` 缺则补写（不覆盖已有完成日）；从 completed 回落 `1..99` → in_progress 且清 `actualEnd`。
5. **预警口径＝`health.scheduleLight`**（M2-A 已定并门禁，勿另写一套）；项目进度＝`health.overallProgress(工序进度)`。预警看板范围＝**全部非 archived 项目**：已排程→红/黄/绿三色分区，未排程→灰区引导（不造假灯）。
6. **诚实空状态**：无排程空态给「一键生成」预览（面积档判定 + 11 工序×天数 + 计划区间）；缺开工日期/面积时按钮禁用并给原因与修复入口；无数据不画线、不造数。

## 2. 拆五个单元（一次一个界面单元，防 429 / 半成品）

| 单元 | 内容 |
|---|---|
| **M6-a** | 模块注册（manifest + registry 加一行 + **从 `deferredModules` 删 `schedule`**）；schema 迁移建 3 表；seed（33 行模板 + 3 个演示项目及其排程）；纯函数 `status.ts`/`plan.ts` + `scripts/verify-schedule.mjs`（≥24 断言）；`/schedule` **预警看板**；`/schedule/[projectId]` 与 `/schedule/templates` 占位页防死链 |
| **M6-b** | `/schedule/[projectId]` **甘特主体**：原生 SVG 双轨（上=计划条 / 下=进度条）+ 依赖连线 + 悬停详情 + 「一键生成排程」（含空态预览）+「清空排程」（确认后删）；`server/generate.ts` |
| **M6-c** | 甘特**交互**：任务抽屉（TaskDrawer：日期/负责人编辑、进度更新、前置只读）+ 计划条**拖拽平移调期**（按天 snap，保存）；`server/tasks.ts` 更新类服务 + `actions.ts` |
| **M6-d** | `/schedule/templates` **工序模板库**：11 工序 × 3 档天数行级编辑保存 + 校验；入口互链 |
| **M6-e** | 项目中心接线：详情「工期进度」Tab 填真（进度+灯+工序清单+跳甘特）、**「设计进度」Tab 补课填真（M5 卡承诺未兑现，见 §7-新增2）**、「基础信息」健康度接线（工期灯+整体进度）；`/projects` 列表「进度」列接真值；STATUS 收尾 + 全量截图 |

## 3. M6-a 详细范围

- 新建 `src/modules/schedule/manifest.ts`：`id="schedule"`、`name="时间管控"`、`entryPath="/schedule"`、`icon` 用单字符（如 `期`，禁 emoji）、`order=5`（design 之后）、`nav: [{ label:"工序模板库", href:"/schedule/templates" }]`（静态路径，合法；项目级入口仍禁入 nav）。**因 nav 指向该路由，本单元同时建 `/schedule/templates` 占位页**（防死链；实体编辑页 M6-d 交付）。`registry.ts`：`modules` 加一行；`deferredModules` 删 `schedule` 条目（其 name/description 原样承接）。
- `prisma/schema.prisma` 新增（**权威草案，照抄**；可移植、无 PG 专有类型）：

```prisma
// ── M6-a：schedule 模块私有表（modules/schedule）──
model ProcessTemplate {
  id        String   @id @default(cuid())
  name      String   // 工序名（11 项）
  order     Int      // 1..11，生成顺序
  tier      String   // lt90 | b90_130 | gt130（见 schedule/plan.ts）
  days      Int      // 标准工期（天）
  createdAt DateTime @default(now())

  @@unique([tier, order])
  @@map("process_templates")
}

model ScheduleTask {
  id          String    @id @default(cuid())
  projectId   String                     // ★ 引用共享 core/domain Project，不得自造
  name        String                     // 工序名（快照自模板；改模板不回溯已生成排程）
  order       Int
  startDate   DateTime                   // 计划开始
  endDate     DateTime                   // 计划结束（含当天；=start+days-1）
  actualStart DateTime?
  actualEnd   DateTime?
  progress    Int       @default(0)      // 0–100 整数
  status      String    @default("pending") // pending|in_progress|completed（见 schedule/status.ts）
  ownerId     String?                    // ★ userId，非自由文本；null=未指派
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  project    Project                   @relation(fields: [projectId], references: [id])
  deps       ScheduleTaskDependency[]  @relation("sch_dep_task")
  dependents ScheduleTaskDependency[]  @relation("sch_dep_dependson")

  @@index([projectId])
  @@index([ownerId])
  @@map("schedule_tasks")
}

// 自引用依赖中间表：taskId 依赖 dependsOnId（task 的前置 = dependsOn）。
model ScheduleTaskDependency {
  id          String   @id @default(cuid())
  taskId      String
  dependsOnId String
  createdAt   DateTime @default(now())

  task      ScheduleTask @relation("sch_dep_task", fields: [taskId], references: [id], onDelete: Cascade)
  dependsOn ScheduleTask @relation("sch_dep_dependson", fields: [dependsOnId], references: [id], onDelete: Cascade)

  @@unique([taskId, dependsOnId])
  @@map("schedule_task_deps")
}
```

  → `Project` 侧只加一行反向关系 `scheduleTasks ScheduleTask[]`。迁移与 seed 执行**归集成者**（见 §6）。
- **纯函数**（`src/modules/schedule/`）：
  - `types.ts`：`ScheduleTaskStatus` 等共享类型。
  - `status.ts`：`SCHEDULE_TASK_STATUS_ORDER=(["pending","in_progress","completed"] as const)` + `SCHEDULE_TASK_STATUS_LABEL`（未开始/进行中/已完成）+ `statusBadgeTone`（pending=neutral / in_progress=accent / completed=success；**在模块内自定义同名 type，勿 import design 内部**）+ `isTaskOverdue({endDate,progress}, now)`（progress<100 且 `now >= endDate+1天`；endDate 空/非法→false）+ `applyProgressUpdate(task, progress, today)`（钳 0–100 取整；规则见 §1-4，返回 `{progress,status,actualStart,actualEnd}`，today 为入参便于测试）。
  - `plan.ts`：`AREA_TIERS`（`lt90`「90㎡以下」/ `b90_130`「90-130㎡」/ `gt130`「130㎡以上」）+ `areaTier(area)`（<90→lt90；90–130（含端点）→b90_130；>130→gt130；area≤0 或非有限数→null）；`buildSchedule(rows, start)`（rows 须为 `{name,order,days}`，days 为正整数否则 throw；先按 order 排序再链式排期，返回 `{name,order,start,end}[]`）；`chainEdges(n)`（返回 `[i,i-1]` 索引对共 n-1 条）；`hasCycle(nodeIds, edges)`（含自环）。
- **seed**（`prisma/seed.ts` 追加 `seedSchedule()`，main() 调用；幂等，仿 M5 写法）：
  - 用户 upsert：项目经理 `zhougong@renovation.local`（role `pm`、department engineering）+ 巡检 `laozheng@renovation.local`（role `inspector`，同上）。
  - 模板：33 行 = 11 工序 × 3 档，**照抄 v5.1 §6.5.2 表**（拆除工程 3/5/7、水电工程 7/10/14、泥工工程 10/14/18、防水工程 3/3/5、地面工程 5/7/10、墙面工程 7/10/14、天花工程 7/10/14、乳胶漆工程 5/7/10、定制工程 3/5/7、水电安装 3/3/5、竣工清洁 1/2/3；三档总工期 54/76/107 天——b90_130 实算 76，初稿曾误记 80，已按原表逐格复核修正）。模板按 `processTemplate.count()==0` 独立幂等。
  - 演示项目（**新增 3 个，覆盖看板全色区 + 生成流程手测位**；`scheduleTask.count()>0` 则任务级 seed 整体跳过）。3 个新客户 + 3 个项目（编号 RP-2026-002/003/004，直接 create，clientId 引用各自客户）：
    - **002「金域蓝湾 2 栋 802」**（110㎡ → b90_130，in_progress）：链从 `T-69d` 起 76 天、项目 `endDate=T+6d`；任务 1–6 completed（实际=计划）、任务 7（天花）in_progress=40%（逾期点）、8–11 pending → 看板**黄区**（剩余 6 天、进度 58）。
    - **003「老街 21 号院」**（85㎡ → lt90，completed）：链从 `T-65d` 起 54 天、项目 `endDate=T-12d`、`actualEndDate=T-5d`；全部 completed（任务 11 实际结束 = 计划+7d）→ 看板**红区**（超期 7 天）。
    - **004「湖畔名庭 8 栋 501」**（140㎡ → gt130，draft）：`startDate=T+10d`、无排程 → 灰区 + 生成流程手测位。
    （T = seed 运行时刻；002/003 用相对日期保持"永远处于演示态"。）
  - **001（既有项目）排程**：链 = `buildSchedule`(b90_130, 从 `Project.startDate` 2026-09-01) → 76 天至 2026-11-15；完成态按**日期推导**（与"今天"自洽）：`plannedEnd < 今天0点` → completed（实际=计划）、跨今天 → in_progress（progress=按已过天数比例，钳 5–95）、未到 → pending。
  - 依赖：每个已排程项目落 `chainEdges` 对应 10 条边。
  - 自检断言（报数取 DB 真值）：模板 33 行三档齐全；任务总数 33；依赖总数 30；002 完成/进行/待开始=6/1/4；003 全 completed 且项目实际完工>计划；004 任务数 0；001 completed 数 = 按日期推导的期望值。
- `/schedule` **预警看板**（server 组件 + `server/overview.ts`）：`prisma.project.findMany({ where: { status: { not: "archived" } } })` include `scheduleTasks`（只取 progress/dates）→ 复用 `overallProgress` + `scheduleLight`（**勿另写阈值**）分三区：**红=已逾期（超期 N 天）**、**黄=预警（剩余 N 天）**、**绿=正常**；未排程单列**灰区**「未排程 · 去生成 →」。行内容：项目名（链到甘特）/ 客户 / 计划完工 / 当前进度% / 超期或剩余天数 /「甘特 →」；区内按紧迫度排序（超期降序 / 剩余升序）。空态/空区诚实文案。V0.3：色点非 emoji、单点 accent（今日线为全页唯一 accent 属甘特页，看板区用色点）。
- `/schedule/[projectId]` 占位页：项目名 + 「甘特图将在 M6-b 上线」诚实空态 + 返回 `/schedule` 链接（防死链，M5-a 同款做法）。
- `scripts/qa-shots.mjs`：加 `15-schedule`（`/schedule`）与 `16-schedule-project`（`/schedule/<首个项目 id>`）。

## 4. M6-b / M6-c / M6-d / M6-e 要点（边界先定，细节按 §0/§1 展开）

- **M6-b 甘特**（`src/app/schedule/[projectId]/page.tsx` + `GanttChart.tsx` 客户端）：
  - 顶部：项目名/编号、面积档徽章（`areaTier` 标签）、开工/计划完工、`[一键生成排程]`（空态时）或 `[清空排程]`（次级文字按钮 + Modal 确认「删除全部工序与依赖，不可撤销」）。
  - 图体：左侧工序名列表（order+名+逾期红点）+ 右侧 `overflow-x-auto` 时间轴 SVG；**每行双轨**：上=计划条（`--surface-sunken` 底 + `--border` 描边），下=实际进度条（长度 = progress% × 计划条长；颜色 completed=`--success` / in_progress=`--accent` / 逾期=`--danger` / pending 不渲染）；今日竖线（全页唯一 accent 强色）+ 依赖连线（细 1px、`--text-disabled`，先横后竖再横的肘线，置于条下层）；悬停显示详情浮层（计划区间/进度/状态/负责人/前置任务），点击行打开抽屉（M6-c 建，先留 onSelect 出口）。
  - 缩放：`周`（默认，12px/天）/ `日`（28px/天）两档切换。
  - 空态有两种：可生成（面积档判定 + 11 工序×天数预览 + 计划区间 + 主按钮）/ 不可生成（缺开工日期或面积 → 说明原因 + 链到 `/budget/[projectId]/settings`）。
  - Server→Client 只传可序列化数据（日期一律 ISO 字符串）。
- **M6-c 交互**（同目录 `TaskDrawer.tsx` + `server/tasks.ts` 更新类 + `actions.ts`）：
  - 抽屉（复用 `core/ui/Drawer`）：工序名/状态徽章/计划起止（date 输入 + `[保存基本信息]` 一并存日期与负责人）/ 实际起止（只读）/ 进度（数字输入 0–100 + `[更新进度]`，走 `applyProgressUpdate` 联动）/ 负责人（select：未指派 + 用户列表）/ 前置任务（只读名称列表）。
  - 拖拽：仅计划条可拖（pointer 事件），`dayDelta = round(dx/dayW)`，拖动中实时平移预览，松手 delta≠0 才落库（`updateTaskDates`，校验 end≥start；**不级联**）；Esc/归零取消。
  - 服务层校验：非法输入报错回显（不 silent fail）；全部走 Server Action + `revalidatePath`。
- **M6-d 模板库**（`src/app/schedule/templates/page.tsx` + `TemplateEditor.tsx` + `server/templates.ts`）：表 = 11 行 × 3 档天数列（number 输入，行级 `[保存]`）；校验 1–999 整数；保存 action 后 revalidate；页内注明「新建排程按面积档自动套用；改天数不回溯已生成排程」。顶部回 `/schedule` 互链。
- **M6-e 项目中心接线**：
  - **口径与边界（先定）**：排程/设计聚合在 `projects/server` 里**经 prisma 直读**（同 M4-b 读预算的做法），只用 `core/domain/health`（`overallProgress` / `scheduleLight`）；**不 import schedule/design 模块内部**——故不展示工序级/任务级逾期数（`isTaskOverdue`、design `isOverdue` 均系模块内部谓词；日后若需要，先上收 core 再到 Tab）。
  - `projects/server/projectDetail.ts` 增排程聚合（任务数/进度/灯/≤11 工序清单）与设计聚合（任务数/各状态计数）→ `ProjectTabs.tsx`：
    - 「工期进度」Tab：整体进度（大号 % + 条）+ 工期灯色点与状态文案（预警提示）+ 工序清单（紧凑：名/状态点/进度，≤11 行）+ 「打开甘特图 →」；无排程 → 诚实空态 + 引导。
    - 「设计进度」Tab：填真（M5 遗留补课）——总量 + 按状态计数徽章（五态中文文案在 `ProjectTabs.tsx` 内**局部副本**并注明「与 design 模块同源：跨模块禁引，故抄录」）+ 「打开设计看板 →」；空态诚实。
    - 「基础信息」健康度卡：「工期」灯与「整体进度」接真值；质量/预算仍显「未接入（M7/M8 起）」。
  - `/projects` 列表「进度」列：读排程聚合 `overallProgress`；无排程显灰色「未排程」（撤掉恒「未接入」文案）。
  - `qa-shots` 加 `?tab=schedule` 与 `?tab=design` 两个目标。

## 5. 硬约束（五单元通用）

- 禁止 git（禁 `git commit`）；禁止 `pnpm dev`；**迁移 / seed 执行由集成者跑，codebuddy 只写代码/schema/seed 文件本身**；唯一绿门 `pnpm build`。
- V0.3 刻度：字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48；无阴影、单点钴蓝 `#3368A0`；表头/按钮 `whitespace-nowrap`；375 不破版；**色点非 emoji**。
- 跨模块读预算/项目走 `core/db` prisma 直读，**不 import 其他模块内部**；`health.ts` 只被调用不改公式。
- 单一计算口径：进度/灯/逾期只出现在 `health.ts` 与 `schedule/` 纯函数，页面不得各写一套；seed 报数取 `count` 加自检。
- `manifest.nav` 拿不到 id → 项目级/任务级入口只放页面内部。
- 完成度闸门：宁交完整可编译，不留半成品；改单一真源位置时同步检查 plain-node 门禁脚本 import 目标（勿穿无扩展名 re-export 链）。

## 6. 门禁与验收（每单元必跑，集成者独立复跑，codebuddy 自述不作数）

- `pnpm build` + `verify-quote 17` + `verify-crm 11` + `verify-health 20` + `verify-design 28`（**不得回退**）+ **新 `verify-schedule`（≥24 断言：档位边界 5 例含 89.9/90/128.6/130/130.1、三档总工期 54/76/107 独立复算、链式无缝无叠、跨月终点 2026-11-15、边数 10、拓扑 5 例含自环与 3 环、进度联动 6 例、逾期边界 3 例、UI 文案常量无 emoji）**。
- 集成者运行序列：`cp prisma/dev.db _scratch/backup/dev.db.<日期>备份` → `pnpm prisma migrate dev --name add_m6_schedule` → `pnpm db:seed` → build → 门禁 → 截图。
- 截图 `node scripts/qa-shots.mjs`（1440/1280/375）：`/schedule` 三色区+灰区、`/schedule/[id]` 甘特（双轨/依赖线/今日线/空态预览）、模板库、两 Tab；**375 溢出争议用 DOM 探针量 scrollWidth，别只信肉眼**。
- 手测闭环（M6-e 后）：004 空态生成 → 调期（拖拽）→ 更新进度至 100 → 看板/灯/Tab 数值联动一致；清空 → 重新生成。
- 跑完 codebuddy 后 grep `~/.codebuddy/logs/<date>/renovation-platform__*.log` 的 `resolved model=` / `Using custom URL` 确认路由未静默回落。

## 7. 与 PLAN / v5.1 的偏差与新增（集成者注，待 HAE 过目）

1. **「categoryId 关联科目」不实现**（PLAN §3 原句）：本 M 不建跨模块 FK（模块边界 + 无消费方 + 红线三）；将来财务核算挂钩时再定方案。
2. **v5.1 §6.4.4 「工期 Tab 内嵌小甘特」降级**为紧凑工序清单 + 跳转（避免第二套甘特渲染器；如要真小甘特另开增强）。
3. 不做「是否里程碑 / 排程编号 / 移动端打卡」（无消费方，红线三）。
4. 「排程 100%→验收节点」留 M7（承 STATUS 日终 handoff）。
5. **新增**：seed 加 3 个演示项目（红/黄/灰 + 生成流程手测位）——覆盖看板全部视觉状态，不假不删。
6. **新增**：「设计进度 Tab 补课」——M5 任务卡 §0 承诺「把该 Tab 填成真数据」但四单元均未落地（实证：`ProjectTabs.tsx:44-46` 仍是空态、M5 五个提交均未触 `src/app/projects`）。并入 M6-e（与工期 Tab 同文件同模式，成本极小；如不需可单独撤）。

## 8. 阻塞回报优先于瞎返

遇到「甘特 SVG 布局与拖拽坐标换算方案」「抽屉字段取舍」「看板排序细节」「seed 相对日期的边界（如 T 跨月）」等拿不准的，**先停下回报集成者**，别自作主张扩范围、造数或提前实现 M7（验收节点）与 M8（成本核算）的钩子行为。
