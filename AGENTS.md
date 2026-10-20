# AGENTS.md — 装修经营管理数字化平台（renovation-platform）

> 本文件是本项目对**所有 AI 编程助手（含 opencode / codex）的权威契约**。任何模块开发前先读本文件 + `docs/`。
> 版本：契约 v0.6 · 更新：2026-10-18 · 维护人：HAE（AI 视频导演 / 家装业务数字化）
> v0.6 变更（M15-a 全景管理模块）：§0 模块数 9→10；§2 目录补 `modules/pano` 与 `/pano` 路由；§4 模块自有实体补 `pano 1`；新增 **§4.7 全景成品：文件在磁盘、登记在库里**（dirName 是唯一锚 · 解除登记不删文件 · 归纳页排除归档与下架 · 对内网托管不对外发布）。同日另一条实见教训进了 §6.4：**关键底色不得只靠现代 CSS 函数单条声明承载**（iPad 首屏丢底的根因）。
> v0.5 变更（M13 系统性体检后的双向对齐）：**契约终于追上实现**——§0 模块范围从"只构建第 1 个模块"改为实际的 9 个模块；§2 目录补 `core/storage`、`scripts/`、`middleware.ts` 与三个部署文件；§4 补平台原语全清单。新增两处硬约束：**§4.6 变更单确认门**（只有客户已确认进金额口径 + 存量回填教训）、**§7.1 内测期最小访问保护**（零鉴权已从"未来项"变成"现实风险"）。并补：§4.3 收 `WorkLog.archived`（工时属事实族）、§6 间距阶梯补"长页 section 上探 64/96"与控件高度组、§6.1 accent 族四值必须同时落 `tailwind.config.ts`、§8 质量门槛改挂 `pnpm verify`。
> v0.4 变更（M10-c 归档口径收口）：§4.3 改写为「**钱按事实 · 事按可见性**」二分（原句「全司读侧早已排除 archived」只对一半，事实类账不许因归档消失），并补：归档确认框须列未闭环事项、`OperationLog.before` 只能存机器值。
> v0.3 变更（M10-a 备料批）：新增 §4.3 归档/作废口径、§4.4 操作流水与错误现场、§4.5 主题插槽双声明锁；§6.1 局部预览依赖元素级插槽（同条锁死）。
> v0.2 变更：R1/R2 落地条款入册（§4.1 跨模块关联主键、§4.2 自定义字段 EAV、§5 报价明细排除、§6.1 主题、§6.2 浮层阴影）+ §9 工作区目录约定入册。原补丁文本在 `docs/PROPOSAL_M1.5.md` §4/§9，其中三处（accent 族值数、设置列名、软删口径）已被 M9-c/M9-d 实际实现取代，**以本文件为准**。

## 0. 项目定位（一句话）

这是一个**面向装修经营全流程的数字化管理平台**，由多个可插拔模块组成。**已建成 10 个模块**（`src/modules/registry.ts` 为准）：预算报价、驾驶舱、线索 CRM、项目中心、设计管理、排程、质量验收、财务台账、人员工控、全景管理；外加平台设置 `/settings`（不占模块位）。全部集成进同一个平台外壳，共享登录、主数据与视觉语言。

> 全景管理（M15-a，2026-10-18）是第一个**展示型**模块：它不产生经营数据，只把本地全景编辑器导出的静态导览按项目归集。口径见 §4.7，运维见 `docs/PANO_MODULE.md`。

> 本条 v0.4 及以前写的是"当前只构建第 1 个模块"，与实现脱节三个月——保留此教训：**代码已有的实体与口径必须回写本契约**，否则新会话冷启动会照旧契约做出与现状冲突的决策。体检报告见 `docs/HEALTH_CHECK_2026-10-14.md` §7。

> 定位澄清（2026-10-08）：首期主打**数字化经营管理**，不预设 AI。**AI 辅助管理 = DEFERRED**（后期再加，不在首期范围，命名/界面均不强调 AI）。

- 目标形态：一个仓库、可部署到阿里云轻量服务器的 Web 平台；模块=平台里的一个功能区。当前实际部署形态是**内网 Docker Compose 内测**（NAS/内网机），云上 HTTPS 属 P3——两者不是一回事，别把内测当 P3 完成。
- 红线：**模块化单体**，不做微前端、不做多系统拼门户、不在第一个模块阶段做重型权限中台（DEFERRED）。但见 **§7.1**：内测期最小访问保护已从 DEFERRED 提升为必做。

## 1. 技术栈（DECIDED，长期沿用）

- **框架**：Next.js（App Router）+ TypeScript，全栈一体（前端页面 + 后端 Route Handler/Server Action 同仓）。
- **ORM/数据**：Prisma。开发期与首个部署用 **SQLite**；`schema` 保持**可移植**（禁用 PG 专有类型如 `String[]` 数组、`dbgenerated` 特殊函数；枚举用 string + 常量）。**JSON 例外（2026-10-11 实测更正）**：本栈 **Prisma 5.22 + SQLite 不支持 `Json` 类型**（`prisma validate` 报 `The current connector does not support the Json type`）——需要存列表/结构时改用**纯文本约定**（如「每行一个选项」）或 JSON 字符串 + 服务层解析函数单点收口；迁 PostgreSQL 后再按需用 `Json`。上多用户/并发时**一步迁 PostgreSQL**（见 §7，列为 QA 关卡，非现在）。
- **包管理**：pnpm。
- **样式**：Tailwind（仅作原子工具类）+ 一层从设计系统派生的 **CSS 变量令牌**（`src/styles/tokens.css`）。**禁止**引入 Element / Antd / MUI 等成套组件库；基础组件在 `src/core/ui/` 手写，严格遵循设计系统。
- **部署**：Docker Compose（app + 反代 Caddy/HTTPS + 后期 postgres），目标阿里云轻量 2G。保持单运行时、少进程、省内存。

## 2. 目录结构（约定，勿漂）

```
renovation-platform/
  prisma/schema.prisma  prisma/seed.ts  prisma/bootstrap.mjs  prisma/migrations/
  src/
    middleware.ts              # 内测期最小访问保护的应用层闸（§7.1，勿删）
    app/                       # Next App Router：平台外壳 + 各模块路由（只放页面与 action）
      layout.tsx               # 全局外壳：左侧模块导航(由注册表动态生成)+ 顶栏
      page.tsx                 # 平台首页：模块入口卡片网格（保持 force-dynamic，§6.1）
      HeroSplash.tsx           # 启动首屏（§6.3 成文例外，作用域锁 .splash-*）
      budget/  dashboard/  crm/  projects/  design/  schedule/  quality/  finance/  hr/  pano/  settings/  fields/  api/
    modules/                   # ★ 可插拔业务模块（每个功能=一个目录，清单见 registry.ts）
      registry.ts              # 模块注册表（单一清单，外壳据此渲染导航/首页）
      budget/
        manifest.ts            # 实现 ModuleManifest（见 §3）
        components/  server/  types.ts  lib/
    core/                      # ★ 跨模块共享，不属于任何单一模块
      domain/                  # 共享主数据与平台原语服务（清单见 §4）
      ui/                      # 设计系统派生的基础组件(Button/Card/Input/Table/Modal...)
      db/                      # prisma client 单例
      storage/                 # 上传落盘抽象（FileAsset 的存储侧；uuid 命名 + MIME 白名单 + 防穿越）
      platform.ts              # 平台级常量（名称等）
    styles/tokens.css globals.css
  scripts/                     # verify-*.mjs 纯函数门禁 / verify-*.mts 隔离库集成门禁 / run-gates.mjs 驱动器
  docs/                        # 契约、构建规格、任务卡、状态交接、体检与验收报告（人看的都在这）
  Dockerfile  compose.internal.yml  Caddyfile     # 内测部署三件（§7.1 口令保护在 Caddyfile）
  deploy/nas-deploy.sh           # 极空间 NAS 部署入口（该机无 docker compose，见 §7.2）
  AGENTS.md  CLAUDE.md(指针对本文件)  README.md
  _scratch/                    # 一切非交付物（gitignore，见 §9）
  logs/                        # 运行期错误日志（§4.4，§9 里唯一的仓库根例外）
```
要点：**路由层薄、逻辑归 `modules/<id>/server`、UI 原子归 `core/ui`、主数据归 `core/domain`**。模块之间不互相 import 内部实现，只通过 `core` 与注册表协作。

两条由体检补上的边界纪律（都是实见分叉后立的，勿当装饰）：

- **`core` 不得依赖任何单一模块**，包括 type-only import。曾经 `core/ui/NotificationBell.tsx` 反向 import `modules/dashboard/server/notifications` 取一个接口——运行时零耦合所以没出事，但方向错了就是错了：哪天有人顺手 import 了那个模块的运行时函数，core 就把整个 dashboard 的取数拖进共享层。形状类接口一律放 `core/domain/*Types.ts`，模块侧再 re-export 保持引用不变。
- **门禁清单不靠人记**。`scripts/run-gates.mjs` 按 `verify-*.mjs` / `verify-*.mts` 文件名**自动发现**门禁；新增门禁只要按这个命名放进来就一定会被跑到。反过来，把清单硬编码进驱动器或文档的结局已经出现过一次——`docs/TASK_M11.md` 写"十道纯函数"时实际已有 11 道。

## 3. 模块契约（ModuleManifest）— 集成机制的核心

每个模块在 `src/modules/<id>/manifest.ts` 导出一个 `ModuleManifest`；`src/modules/registry.ts` 汇总成数组。**外壳只读 registry，绝不写死任何模块**。新增模块 = 新建目录 + 在 registry 加一行，导航与首页自动出现。

```ts
export interface ModuleManifest {
  id: string;               // 'budget'
  name: string;             // '装修预算报价'
  description?: string;
  icon?: string;            // 图标名或 emoji（按设计系统，禁用彩色 icon 库）
  order: number;            // 导航排序
  entryPath: string;        // '/budget'
  requiresAuth?: boolean;   // 默认 false（当前免登录单用户）
  nav?: { label: string; href: string }[];  // 模块内二级导航（可选）
}
```
约束：模块自带 Prisma 迁移实体但**不得重定义核心域实体**（Project/Client/User/Org 属 `core/domain`）。模块表通过 `projectId`/外键引用核心域。

## 4. 共享核心域与平台原语（`core/domain`，Prisma 实体）

即便暂只有一个模块用到，也从一开始建模留位，避免后续模块各存一套。**核心域与平台原语实体归这里，模块不得重定义**；下列清单以 `prisma/schema.prisma` 为准（v0.5 补全——此前只列 4 个，而实际已有 30 个 model、9 个模块，契约成了摆设）：

**主数据（业务对象的锚点）**

- `Organization`（占位，当前单一默认行 `slug="default"`）
- `User`（占位表已建；`role` 取值见 `core/domain/types.ts` 的 `USER_ROLE`，**写不在表内的值**如 `owner` 会让角色显示与 `boss` 兜底逻辑双双落空）
- `Client`（甲方：名称、电话、备注…）
- `Project`（★主数据：code、name、地址、面积、client→Client、designer、pm、status、dates、contractAmount）——预算/项目管理/设计管理都挂在 Project 下。

**平台原语（跨模块共用，谁都不许另建一套）**

- `Lead` / `FollowUp` — 线索与跟进（CRM 复用主脊，签约后经 `Lead.projectId` 与 Project 1-1 挂钩）
- `FileAsset` — 全平台附件账（变更单附件、验收证据、Logo 都走它，靠 `ownerType/ownerId` 关联；SQLite 无 Json，故不建结构列）
- `CustomFieldDef` / `CustomFieldValue` — 自定义字段 EAV（§4.2）
- `PlatformSetting` — 平台自身配置（主题键名、Logo 等；只存键名，色值在 `tokens.css`）
- `OperationLog` — 操作流水唯一账本（§4.4；同时承担"归档恢复回哪一态"的职责）

**共享口径与服务的单一真源（无表，但同属 core/domain，模块只调用不自写算式）**

`ledger.ts`（收/支/毛利/毛利率/变更累计，事实族口径）· `pricing.ts`（金额格式化与报价算式）· `health.ts`（三色灯）· `dashboard.ts` · `acceptance.ts` · `theme.ts`（四套插槽键名）· `customField.ts` + `customFieldRepo.ts`（EAV 读写单点）· `operationLog.ts`（流水唯一入口）· `telemetry.ts`（错误现场）· `projects.ts`（项目主数据服务 + 归档/恢复）· `accessGate.ts`（§7.1 闸的口径单点）· `notificationTypes.ts`（形状，不含取数）· `types.ts`（PROJECT_STATUS / USER_ROLE / ENTITY_KIND 等机器值常量）。

**模块自有实体**（不在此列，见 §5 与各模块目录）：budget 5（含 `ChangeOrder`）、quality 5、schedule 3、design 2、finance 2、hr 2、pano 1（`PanoTour`，见 §4.7）。

### 4.1 跨模块关联主键（R2-①，DECIDED）

- 所有模块的业务表必须经 `projectId` 挂在 `core/domain.Project` 下；**禁止**模块自建项目实体。
- 程序内关联与**项目级深链用 `Project.id`（cuid）**——现状 `/projects/[id]`、`/budget/[projectId]` 等只认 id，拿编号打开即 404。对外展示、列表标题与对账用 `Project.code`（`RP-YYYY-NNN`，唯一且人类可读）。
- 「按 code 也能打开项目级页面」是**可读深链**诉求（利于分享与手敲），但本仓尚未实现：要做须给相关路由补 `code → id` 解析并加回归，属扩范围、不在既有里程碑内顺手做。
- 客户维度经 `Project.clientId` 间接关联，模块不得绕过 Project 直接绑 Client。
- `Client` 是 1—N 共享主数据：改客户名/电话会连带改掉该客户名下所有项目的显示——行为有意，表单须用 `hint` 明示这一副作用。

### 4.2 自定义字段 EAV（R2-②，DECIDED：客户自助定义）

- 双表 `CustomFieldDef` + `CustomFieldValue`，**作用对象仅 `Project` 与 `Client`**（`entityKind` 用字符串常量，非枚举）。
- **不给 `QuoteItem` 开**：报价保存走整表替换（`deleteMany`+`createMany`、id 每次重分配），挂明细行的字段值会在保存时**静默变孤儿**。
- 值**按类型分列存**（`valueText`/`valueNumber`/`valueDate` 三列互斥）。若挤进单一文本列，SQLite 对字符串列做 `gte/lte` 会按字典序比较（`"9" > "10"`）导致区间筛选出错。
- **停用优先**（`active=false` 保留历史值）；显式删除走**连带硬删**（`onDelete: Cascade` + 服务内 `deleteMany` 双保险），删除入口须有非颜色的文字警告。
- 读写只经 `core/domain/customField.ts`（纯口径）与 `customFieldRepo.ts`（服务），**模块不得直查这两张表**——否则 R2 要解决的"各存一套"会以另一种形式回来。
- 首期校验只做 `required` + 类型；字段级权限 DEFERRED 至 P4。多选、金额带币种等类型扩展须先改本条再动手。

### 4.3 归档 / 作废是可逆的可见性开关，不是删除（M10-a，DECIDED）

- 平台**没有硬删除业务数据**的入口，也不打算有：报价、台账、验收节点都是长期对账依据，SQLite 更没有回收站。"误操作能纠正"一律走归档/作废。
- 项目侧复用主脊既有的 `status="archived"`。**归档不是"把所有数抹掉"**——读侧分两族，口径由 HAE 2026-10-13 拍板为「**钱按事实 · 事按可见性**」：
  - **事实类照算，含已归档**：已收、支出、合同额、累计变更、毛利、毛利率、月度现金线、本月签单额。发生过的事不因归档消失，否则归档一次，历史月份的收款线凭空掉一截、已经交付出去的对账数字变得不可信。
  - **前瞻类排除已归档**：待收款、计划未付付款段、未整改问题、待审设计任务、风险计数、待办中心、项目健康度表、线索漏斗。归档＝这个项目的经营事项已收场，不再挂账催收、不再出现在待办视野里。
  - 两族口径不同是**有意**的，因此**页面必须把差异说出来**：`/finance` 汇总条下与 `/dashboard` 页头在真有归档项目参与时各出一行说明（哪些格子含它、为什么含），无归档时一个字都不加。沉默地少一个数字，比数字变小更糟。
- 归档入口两处（`/projects` 表格行 + 项目详情页），确认框须**如实列出未闭环事项**（未整改问题数、未收付款段数与金额）——归档合法，但要知情；数据一律保留，明细读数由 `listProjectsForManagement` 两条 groupBy 带出，不做 N+1。
- 恢复必须回到**归档前那一态**，其原值存在 `OperationLog.before` 里（不另加列——多存一处就要多维护一处一致性）。因此 `before` **只能存机器值**（`in_progress`），中文态名进 `summary`：一格两用会让恢复拿到「施工中」去校验而静默回落 `draft`（M10-a 实见）。
- 线索侧用 `Lead.archived`（作废位）：已签约的线索**不许只作废线索**，那会让项目失去 `Lead.projectId` 这条 1-1 来源（§4.1）——要清掉就去项目中心归档项目。守卫落在服务层 `setLeadArchived`，不在界面里重复判断。
- 卡片视图这类"整卡是一个 `<a>`"的地方**不放行内按钮**（HTML 不允许在 `a` 里嵌表单，点了也会串成跳转）；操作入口放表格行与详情页两处，够用即可，不为对称去重构卡片。
- 归档动作必须写流水（`project.archive` / `project.restore` / `lead.archive` / `lead.restore`），且 `before` 记原态——流水在这里同时承担"恢复用什么值"的职责。
- **状态没变就不写流水**（M13 实见）。`setProjectArchived` 幂等返回 `noop:true`，动作层据此跳过埋点。原因不在"流水脏"这么轻：恢复动作是回读"最新一条 `project.archive` 的 `before`"来决定回到哪一态，一条 `before="archived"` 的无变化记录会把恢复目标污染成 archived——校验合法、执行无变化、还向用户报成功。恢复侧同时用 `NOT: { before: "archived" }` 兜历史脏数据，两处都要。
- **归档入口只有两处**（`/projects` 表格行 + 项目详情页），二者都走同一服务函数并写流水。**禁止**让"项目设置"表单能把 status 直接改成 archived：那条路径没有未闭环事项的知情确认框、也不写流水，这样归档的项目**无流水可恢复**（只能静默回落 draft）。收口方式=界面选项里摘掉 archived（`ProjectSettingsForm`）+ 服务层守卫拒写（`updateProject`）双保险；已是归档态时放行，因为那是"保持原状"不是绕过。
- `updateProject` 的 `status` 语义是**未传＝保持原值**，与 `createProject` 的"未传＝draft"相反。给归档项目编辑设置时故意不提交 status 字段，靠这条语义保持——若沿用 create 的回落，改个地址就会把项目悄悄放回全司口径。
- **`WorkLog.archived` 属事实族**（M13 拍板：归档工时仍进统计）。工时是既成事实，`archived` 位**只隐藏列表可见性**；将来做「人效 / 工时投入」聚合时**必须包含已归档记录**，不得复用列表查询的 `archived:false`，否则某人一归档，他的历史投入就凭空少一截。列表页须显示"另有 N 条已归档未列出"，别让隐藏看起来像丢数据。

### 4.4 操作流水与错误现场（M10-a，DECIDED）

立这两件的原因不是"想要审计功能"，而是：平台即将交给内部员工真实使用，**逻辑问题只能在真实使用中暴露**；而员工说"这个数上周还不是这样 / 页面打不开"时，此前我们**没有任何手段**重建现场。

- **操作流水**唯一入口是 `core/domain/operationLog.ts` 的 `recordOperation()`；模块与页面**不得**自行 `prisma.operationLog.create()`。埋点散开必然漏，漏了就等于没有。
- 三条不变量：① **best-effort**——记流水失败绝不把业务写入带下水（内部吞掉并转 telemetry，返回值只供测试断言）；② **写人话**——`summary`/`before`/`after` 是给业务同事读的中文，SQLite 无 `Json`（§1），要结构化就加列，不塞花括号文本；③ **动作层埋点，不在服务层**——服务函数多在 `prisma.$transaction` 内，日志一旦进事务，记流水失败会连业务一起滚掉。
- `actor` 现阶段是占位用户（最早的 boss，缺则最早任意用户，再兜底 `user-local`）；P4 接登录后换成 session 的 userId，列已预留，届时 `modules/finance/currentUser.ts` 与本处一并收口。
- **错误现场**在 `core/domain/telemetry.ts`：`logAppError(tag, error, ctx?)` 与 `console.error` 同形（全站 42 处 catch 已替换），一行 JSONL 同时写 stdout 与 `logs/app-errors.jsonl`（stdout 那份是给 Docker/pm2 采集用的，不能只留文件）。生产构建把 RSC 渲染错误详情隐去、只给页面一个 digest，故 `app/error.tsx` 会把 digest + 路径 POST 到 `/api/client-errors`，让"错误编号"能反查到现场。
- `logs/` 是 **§9 禁止仓库根散落日志的唯一例外**：运行期错误日志必须由应用自己落盘，不能等人工搬进 `_scratch/`；已 gitignore，超 2MB 自动滚档。

### 4.5 主题插槽有两条选择器，必须同步（M10-a 补）

`tokens.css` 里每套插槽声明**两份**：`:root[data-theme="k"]` 管全站换肤，元素级 `[data-theme="k"]` 管**组件内局部预览**（设置页四张主题卡各自显色）。只有前者时局部预览拿不到插槽色，四张卡看起来"四套没区别"（HAE 意见 4 的真相）。两处必须同键集合同值，由 `verify-theme` 的双声明锁钉死——**只改一处比不改更糟**（全站与预览分叉）。

### 4.6 变更单确认门：只有客户已确认进金额口径（M13，DECIDED）

变更单从"录入即生效"改为四段状态机：`draft → pending → client_confirmed | rejected`（`ChangeOrder.status`，字符串常量 + 默认 `draft`）。**金额口径只认 `client_confirmed`**——`projectDetail.ts` 与 `finance/server/records.ts` 两处聚合都带 `status:"client_confirmed"` 过滤。列表侧（`budget/server/changes.ts`）不过滤、全量展示，这是有意的不对称：**看得见草稿，但草稿不算钱**。

三条纪律，都是这次体检从实坑里拎出来的：

- **改读侧口径必须同步三处**：新迁移的列、所有聚合点、所有门禁断言。`m13` 给 `change_orders` 加 `status` 时，SQLite 的 RedefineTables 重建语句 `INSERT INTO new_change_orders (…) SELECT …` 的列清单里**漏了 `status`**，存量行全部落到 `DEFAULT 'draft'`——于是历史变更金额从累计变更、毛利、毛利率、应收分母（`paidDenom=contractAmount+changeTotal`）和变更预警里同时消失，界面一个字的提示都不给。这正是 §4.3「钱按事实」要避免的事故，而且比归档更糟：**数据没丢，是算没了**。修复=`m13b` 数据回填迁移。
- **回填判据必须能区分"历史存量"与"上线后的合法草稿"**。`m13b` 用 `createdAt < <m13 上线时刻>` 做判据，并把 `confirmedAt` 取 `createdAt`（旧口径生效时间即创建时间，且避免 UI 拿 null）、`confirmNote` 写明自动确认来源。写成无判据的 `WHERE status='draft'` 会把上线后员工新建的草稿一并确认掉——那是把一个数据 bug 换成一个业务 bug。回填 SQL 幂等，可安全重跑。
- **SQLite 的 DateTime 存的是整数毫秒**（实测 `typeof("createdAt")='integer'`）。迁移里做时间比较要用 `CAST(strftime('%s','YYYY-MM-DD HH:MM:SS') AS INTEGER) * 1000`，直接跟字符串比会按字典序出错。

**撤销确认（M14 补口，2026-10-15 落地）**：`client_confirmed` 曾是**终态**——`updateChange` 与 `deleteChange` 都拒绝已确认的行，而 `setChangeStatus` 没有任何离开 `client_confirmed` 的边。守卫本身是对的（已确认金额不能被无痕改写或删除），但配合 `m13b` 的回填，一旦员工录错并被自动确认，就没有任何纠正路径。现补一条**唯一的受控出口** `revokeChangeConfirm`：`client_confirmed → pending`，**即时从金额口径摘出**（退回 pending 自然掉出两处 `status:"client_confirmed"` 过滤），并清空 `confirmedAt/confirmedBy/confirmNote`（原始确认信息不丢，全在撤销前后写入的 `change.revoke_confirm` 流水里，§4.4）。退回 pending 后行可编辑、可再次确认，构成「撤销 → 纠错 → 再确认」闭环，而不是把已确认金额变成可无痕改写。三条纪律：① 只对 `client_confirmed` 开放，非该态撤销即拒（防把 pending/draft「撤销」成无意义写入）；② 撤销动作走独立函数与独立流水 `action`（`change.revoke_confirm`），不复用 `setChangeStatus("pending")`——后者语义是「提交确认」（往口径里放钱的前一步），撤销语义相反（把钱拿出来），混用会让流水答反方向；③ 界面**不再给已确认行放编辑/删除按钮**（它们必然被服务层守卫拒绝），只放「撤销确认」。`verify-finance-flow` §13b 钉死「确认进账→撤销摘出→改→再确认」的金额口径与字段清空。仍**保留** `updateChange`/`deleteChange` 对 `client_confirmed` 的拒绝——纠错必须先撤销，不能绕过。

### 4.7 全景成品：文件在磁盘、登记在库里（M15-a，DECIDED）

全景管理是第一个**不产生经营数据、只归集展示物**的模块。它的成品不是数据库记录能装下的东西——一个导览是 MT-Pano 编辑器导出的**整个目录**（`index.html` + `app.js` + `style.css` + `marzipano.js` + `tiles/**`，几百个切片文件）。四条由此推出的口径：

- **成品只在磁盘，库里只存"一条登记"**（`PanoTour`：`dirName` / `title` / `sceneCount` / `coverKey` / `status` / `order` / `projectId`）。文件放 `public/uploads/pano/<目录名>/`，与附件、Logo 共用同一条 uploads 卷（容器重建不丢；备份口径仍只有一条）。
- **`dirName` 是唯一锚，登记后不可修改**。它是库记录与磁盘目录之间唯一的对应关系，允许改就等于允许失联（改完指向不存在的目录，或与另一条撞名）。要换目录走"解除登记 → 移文件 → 重新登记"。`@unique` 就是这条纪律的机器表达。
- **不建 `PanoScene` 子表**。场景清单的真源在导览包内（`project.json`），抄进库里等于造第二套真源——包里改了、列表还写着旧的，且无从发现。故只存登记那一刻读到的 `sceneCount`，**0 的含义是"未记录"而不是"没有场景"**（托管版导出会删掉 `project.json`），界面必须这样表述。
- **解除登记只摘登记，一个字节都不删文件**（§4.3 不硬删业务数据的延伸）。所以流水措辞必须写清"文件保留"，否则日后看流水的人会以为成品被删了。
- **可见性按 §4.3 的"事按可见性"**：已下架、或归属项目已归档 → 不进项目归纳页；但管理页与项目详情的"全景导览"页签照样列出并标注原因。未关联项目的导览**仍然出现在归纳页**，单独一组"未关联项目"——藏起来会让放文件的人以为成品丢了。
- **对内网托管，不做对外发布**（HAE 2026-10-18 拍板）：内测期不发公网链接。将来给客户看的路子是"阿里云阶段把导出成品放 OSS 桶"，属独立事项；本轮**不预留** `shareUrl` 之类的未来字段——留了就是提前实现未来需求。
- 导览包内资源全部是**相对路径**（实测 `MT-Panoramic/server/index.js` 的导出生成器；只有编辑器自己的预览路由才改写成根绝对），所以挂在 `/uploads/pano/<目录>/` 前缀下可直接 iframe 打开，**不需要改写产物**。这就是用 iframe 而非"把导览搬进平台页面"的原因：搬进来等于把别人的构建产物纳入本仓编译与视觉约束，每次重新导出都要重来。

### 4.8 门禁现场

`scripts/verify-pano.mjs`（纯函数 62 项：目录名安全、URL 转义与越界、状态与脏值回显、可见性矩阵、排序全序、封面取第一幕）+ `scripts/verify-pano-flow.mts`（集成 59 项：扫描、登记拒绝路径、上下架与 **noop**、归档排除、次序交换、**解除登记后文件仍在**、`missingOnDisk` 对账、服务层零流水）。这两道是 §4.7 各条的机器表达，改口径必须同批改断言（§8）。

## 5. 预算模块数据模型（modules/budget 自有实体）
- `CatalogCategory` 工程科目：id、name、order。（全局模板库，可增删改）
- `CatalogItem` 科目项模板：category→CatalogCategory、code、name、unit、defaultPrice、defaultQty、materials(文本)、sop(文本/多行)、order。
- `BudgetQuote` 报价单：project→Project（唯一或多版本）、taxRate(默认 0.03)、status(draft/confirmed)、created/updated。
- `QuoteItem` 报价明细（**快照自 CatalogItem，非引用**——改模板不回溯历史报价；**不接受自定义字段挂载**，见 §4.2）：quote→BudgetQuote、categoryName、code、name、unit、unitPrice、quantity、materials、sop、order。
- 计算口径：`itemTotal=unitPrice×quantity`；按科目分组小计；`directSubtotal=ΣitemTotal`；`tax=directSubtotal×taxRate`；`grand=directSubtotal+tax`；`unitCost=grand/Project.area`。金额后端算+前端展示一致，两位小数。

## 6. 视觉 / UI（硬约束）

- **UI 相关任务必读并遵守 `E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md`**（唯一真源，一行指针引用，不在本仓复制全文）。
- 设计语言：纸感底、**全画面单点 accent**、气声描边、**默认无阴影（L0）**、层级靠字重与对比度，不靠字号与粗线。中文段落排版/负空间按 V0.3 §3.1、§7.4。浮层深度见 §6.2，勿把"默认无阴影"读成"禁止一切阴影"而误删浮层应有的层级手段。
- **accent 选钴蓝 `#3368A0` 主题**（V0.3 默认铁锈红会与 danger 状态色撞车——见 V0.3 红线）。**主题切换（M9-d）**：`--accent` 一族现为**四值**（`--accent` / `--accent-ink` / `--accent-tint` / `--accent-fg` 主按钮前景），换主题只动这一族、其余 token 一律不动；四套插槽键名 `cobalt/rust/emerald/teal` 存 `PlatformSetting.themeKey`（**只存键名不存自由色值**，R1），实际色值只在 `tokens.css` 的 `:root[data-theme="X"]`，键名口径在 `core/domain/theme.ts`，两处由 `verify-theme` 交叉锁死。teal 浅青上主按钮用深墨（`--accent-fg`），非白。
- **设计令牌阶梯（M9-e §4-2 固化 · M13 起机器执行，硬约束）**：**字号只用 `12/13/15/17/20/28`px、间距只用 `4/8/12/16/24/32/48`px**（对应 V0.3 §3.1/§7.4）。Tailwind 默认刻度未关，写任意值或 off-ladder 工具类（`text-[22px]`、`p-5`、`gap-7`、`text-lg` 等）即越界。（`text-xs`/`text-sm` 等命名字号作为既定 body 尺寸保留，约束针对**任意值与自造档**。）
  - **两处成文的例外，别再当越界来回改**：① `tokens.css` 早就允许**长页 section 上探 64/96**（`gap-16`/`gap-24` 即此档）；② **控件高度另成一组**（`h-8`=32px、`h-9`=36px 是 Button/Input 的既定高度）——§6 那句话字面只管"间距"，别把它外扩成对元素尺寸的全面管制。
  - **这条现在由 `scripts/verify-tokens.mjs` 机器执行**（连同 §6.2 零阴影、§6.3 splash 作用域、§6.1 禁 localStorage、§1 禁组件库）。为什么必须机器化：M9-e 手工把越界清零过一次，此后三个月又累积到 **87 处**——靠人记得的约束必然回潮，"收口批已清零"这种表述本身就是幻觉。
- 本仓 `src/styles/tokens.css` 是把 V0.3 token **首次**落成 CSS 变量的地方（设计系统等这个"首个真实项目验证"）。令牌值以 V0.3 为准，不得凭感觉。
- 反 AI 模板：避免千篇一律的圆角大卡片堆叠、避免彩虹渐变/玻璃拟态/emoji 满屏；遵循 V0.3 的"反模板清单"与页面节奏。

### 6.1 主题可换（R1，DECIDED：客户自助切换）

- `--accent` 一族是**唯一**可随主题替换的变量族；`--canvas` 等底色是**对比度零点，锁定不可调**——换主题不许动它，否则全站对比度基线失效。
- 预置插槽只按 V0.3 §2.4 取值，**禁止自造色值、禁止在设置页开取色器**。客户品牌色不在四套内时，走"按 V0.3 §2.4 补一套插槽并入规范"，而不是现场调色。
- 状态存 DB（`PlatformSetting.themeKey`），**不用 localStorage**——本仓红线是 DB 驱动。
- 配置面收在独立的「平台设置」（`/settings`），**不进模块 registry、不出现在侧栏与首页卡片**（业务模块与平台自身配置两条线不混）；顶部色块预览用 `data-theme` 作用域吃 CSS 变量，不写死 hex。选中后须点「应用主题」才写库（预览与生效分离，不做即点即改全站）。
- 主题应用是**外壳级事实**：改完须 `revalidatePath("/", "layout")` 让全站跟着换色；首页必须保持动态渲染（`force-dynamic`），否则构建时的插槽色被烘死、切完落地页不变色。
- **四值族必须在三处同构**：`tokens.css` 的 `--accent*` 定义 · `core/domain/theme.ts` 的键名 · **`tailwind.config.ts` 的 `colors.accent` 映射（DEFAULT/ink/tint/fg 四个都要）**。M13 实见 `fg` 缺席整整一轮：写 `text-accent-fg` 的类在 Tailwind 里无解、不生成任何 CSS，按钮前景静默落回继承色——cobalt/rust 上看着正常，只有切到 teal 才暴露；组件侧被迫用 `text-[color:var(--accent-fg)]` 这种绕过映射的写法。同理，`bg-accent` 配 `text-white` 写死白字在 teal 上对比度约 1.6:1，直接触 V0.3 红线。两处现由 `verify-tokens` 钉住。**根因修法是补映射，不是逐点写绕过式任意值**——后者会把同一个坑留给下一个文件。

### 6.2 浮层与阴影（修正 §6「无阴影」的过度简化）

- V0.3 §4 的纪律是**默认 L0 无阴影**，不是禁止阴影：Modal / 抽屉 / 命令面板**允许**按 L1–L3 使用 `--shadow-1/2/3`，受 Shadow Budget 约束（同屏累计不超一档预算）。
- **当前落地**：本仓零 `box-shadow`（`globals.css` 有声明）。浮层分层用 42% 深色遮罩 + `bg-surface` + `border-line` 描边达成，未消耗阴影预算。这不视为违规，视为"预算未动用"。
- 若将来需要引入浮层阴影，前置条件是**先在 `tokens.css` 落 `--shadow-1/2/3` 三档令牌**并在此条更新口径；**禁止**直接用 Tailwind 默认 `shadow-*` 工具类（与字号/间距越界同类，见 `docs/DESIGN_AUDIT_M1A.md`）。

### 6.3 启动页首屏是 V0.3 的**成文例外**（M10-b，HAE 2026-10-13 拍板）

- 首页 `/` 的启动首屏（`HeroSplash` + `globals.css` 的 `.splash-*`）**不受 §6 视觉硬约束管辖**：允许展示级字号（`clamp(40px,7.2vw,76px)`，超出 12/13/15/17/20/28 阶梯）、深色主按钮、径向柔光背景、入场动画与滚动提示。原因：HAE 明确要"高大上的启动页"，而 V0.3 §Benchmark ≠ Style 红线（禁止把"高级"理解成大标题+黑底+巨图+滚动动画）与该诉求正对——由人拍板开洞，不由实现者自行破规或自行拒做。
- **例外只锁在 `.splash-*` 一个作用域内**：业务页一律不得引用这些类，不得把展示级字号、深色块、柔光背景带进内页；跨页复用的组件（`core/ui/*`）不得为首屏改形态。越界即按 §6 令牌阶梯的"任意值越界"同类处理。
- 两条不豁免的硬要求：**① 配色仍全部取本仓 CSS 变量**（纸底 + 当前主题 accent 族），不为首屏引入新 hex——换主题时首屏必须跟着换；**② `prefers-reduced-motion` 必须支持**（全局规则压时长 + 脚本跳过逐字写入），这是 V0.3 §5.1 的无障碍底线，不在例外范围内。
- 首屏是 `fixed` 覆盖层，不改变 `/` 的既有 DOM：收起即原模块索引页，回归面为零。

### 6.4 关键底色不得只靠现代 CSS 函数承载（M15 同期实见，硬约束）

HAE 用一台旧 iPad（iPadOS 14.5~16.1 区间的 Safari）在内网打开平台，首屏**整片丢底**、直接透出下面的模块列表。根因不是"少了个渐变"，而是一个会连坐的写法：

```css
/* 错：柔光用 color-mix()，纸底写在同一条 background 简写里 */
background: radial-gradient(… color-mix(in srgb, var(--accent-tint) 62%, transparent) …), var(--canvas);
```

该值含 `var()` → 浏览器在**计算值阶段**才判 `color-mix()` 无效 → 整条 `background` 作废（IACVT）→ **连纸底一起消失**，且这种失败救不回来：在它前面再写一条兜底声明也会被这条简写覆盖。

- **底色与装饰层必须拆开**：`background-color: var(--canvas)` 单独一条，装饰层另用伪元素承载。
- **透明度用 `opacity`，不用 `color-mix(… , transparent)`**：`var(--x) + opacity: .62` 与 `color-mix(in srgb, var(--x) 62%, transparent)` 叠在同一底色上**逐像素等价**（实测对照页最大单通道差 1），但前者人人能渲染。浮层遮罩同理（`.overlay-veil` = `var(--text-primary)` + `opacity: .42`）。
- 一定要用现代色彩函数时，**外面必须套 `@supports (background-color: color-mix(in srgb, red 50%, transparent))`**（该测试式不含 `var()`，才会在旧引擎里被判为 false）。
- **不为旧设备专门优化、也不许为此引入新色值**（HAE 2026-10-18 拍板：旧设备大多已淘汰）。这条只是"别把关键视觉压在一次函数失败上"的写法纪律，不是兼容层工程。`Badge` 与 `quality/nodes/[id]` 的状态淡底仍是 `color-mix()`——旧设备上只是淡底缺失、文字与描边都在（可读），**接受该降级**，不为此自造色值（§6.1 禁）。

## 7. 阶段与状态（DECIDED / EXPLORING / DEFERRED / REJECTED）
- 开发分期：P0 契约(本文) → P1 平台壳+预算端到端(SQLite)〔已走过〕→ P2 补全交互+导出〔已走过〕→ **内网 Docker Compose 内测〔当前〕** → P3 部署阿里云（HTTPS）→ **P4 引入登录/多用户** → P5 迁 PostgreSQL（QA 关卡）→ P6 项目管理模块 …
- 状态：
  - 技术栈、模块契约、设计指针、SQLite-first、**§4.6 变更单确认门**、**§7.1 内测最小访问保护** = **DECIDED**
  - 真 RBAC（角色过滤、"仅老板可见"）、PostgreSQL、多品牌换肤（四套以外）、数据可视化色板 = **DEFERRED**（表/位已预留，暂不实现）
  - 微前端、多独立系统拼门户 = **REJECTED**

### 7.1 内测期最小访问保护（M13，DECIDED：必做，不属于 P4）

一句话：**"不做重型权限中台"不等于"不对内网开放裸应用"**。平台即将交给内部员工真实使用，而它装着 HR（人员档案/工时/责任矩阵）与财务（合同额/毛利/台账）。这两件事在 §7 里曾被同一句"登录 DEFERRED"覆盖，于是零鉴权一直当"未来项"待着——直到体检把它当现实风险抓出来：Server Action 无鉴权，任何能到 3000 端口的人**可读且可写**。自家 `docs/DEPLOYMENT_INTERNAL_AND_CLOUD.md` 早就要求"正式内测前需补最小访问保护"，代码里此前一行都没有。

三层，缺一层就退化成"看起来有保护"：

> **⚠ 2026-10-17 用户拍板：口令保护已全面取消**（NAS 在公司内网、测试期无敏感数据）。Caddyfile 已去 basic_auth 与身份注入、`PLATFORM_GATE=off`、`.env` 口令变量非必需。以下三层描述为**历史口径**，恢复保护时照 git 历史还原。当前操作流水 `resolveActor()` 落占位 boss、启动日志有一条 `[accessGate]` 告警，均为预期。

- **应用不发布端口**。`compose.internal.yml` 里 `app` 服务**没有 `ports:`**，外部唯一入口是 `caddy`。别为调试方便把 `"3000:3000"` 加回去——那会同时绕过口令与身份注入两层。
- **Caddy 做 basic auth 并注入身份**。`Caddyfile` 里口令哈希经 `CADDY_USER` / `CADDY_HASH` 环境变量注入，**不入库**；缺任一项 Caddy 直接启动失败，是有意 fail-fast（免得"忘了配口令"变成静默敞开）。认证成功后 `header_up x-platform-user {http.auth.user.user}`——`header_up` 是 Set 语义会覆盖客户端自带同名头，加上应用只在内网可达，这个头**不可伪造**。
- **应用层闸 `src/middleware.ts`**（`PLATFORM_GATE=on` 时生效）。默认**全站都拦**，只放行 `/`、`/about`、`/api/health`、`/api/client-errors` 与 `/uploads/*`（见 `core/domain/accessGate.ts` 的 `isPublicPath`）。刻意不挑"/hr 与 /finance 才保护"——经营数据没有不敏感的那一页，挑两页上闸给的是虚假安全感。

两个连带口径：

- **流水终于能答"是谁改的"**：`operationLog.resolveActor()` 三级优先＝反代认证用户（按 `User.name` 匹配）→ 占位 boss → 占位任意用户。`PLATFORM_GATE` 未开时落回旧占位口径，行为逐字不变（集成门禁走 tsx、拿不到 headers 也走这条，故不破坏测试）。`actor` 仍是占位的这段时间，内测记录里"谁改的"答不了——这是有意的局限，别把流水当成问责依据。
- **`/api/health` 必须是公开且不查库的**：healthcheck 若打业务路径，开闸后会被自己的闸拦成 401、容器进入 unhealthy 重启循环；原先打的 `/api/notifications` 每 30 秒跑一遍全站聚合，只为证明进程活着却给 SQLite 加真实读负载。
- 启动时若闸未开，`middleware` 会打一条 `console.warn`。生产日志里看到它就说明这个部署**没有**访问保护。

### 7.2 内测部署环境事实（极空间 Z0220021，2026-10-15 实跑通）

当前唯一在跑的部署目标是这台 NAS，环境有五个反直觉之处，改动部署配置前先看这里：

- **aarch64，不是 x64**。所有基础镜像与二进制都要按 arm64 选；官方 `docker/compose` 镜像给的是 amd64 的 v1 二进制，装上也跑不起来。
- **没有 docker compose**。面板里能"编排容器"是极空间自己调 Docker HTTP API，不等于有 compose。所以 `deploy/nas-deploy.sh`（纯 docker CLI）才是这台的部署入口，`compose.internal.yml` 留给有 compose 的环境——**两者等价，改一个必须同步另一个**。
- **docker 需要 sudo**，当前用户不在 docker 组。
- **`scp` 不可用**：sshd 关了 sftp 子系统（`subsystem request failed`）。传文件走 `ssh "cat > 目标路径" < 本地文件`。
- **`/tmp` 会被周期性清空**，日志与中间产物不要只放 /tmp（部署日志落 `/opt/renovation-platform/`）；当前用户不在 `/etc/passwd` 里，`$HOME` 为空，脚本别依赖 `~`。
- 镜像与卷的 data-root 在 `/data_s002`（已用 96%），系统盘 `/` 剩 9G；`/data_s001`、`8080`、`8088`、`3000`、`3001` 都被极空间或既有容器占用，对外端口用 **8181**（经 `.env` 的 `CADDY_PORT` 覆盖，别在仓库里为某台机器改死）。

首次在这台机器上部署连续失败四轮，七个根因**全部是 x64/Windows 本机照不出来的**（本机 913 项门禁与 build 全绿照样通过）：pnpm 11 要 Node 22 的 `node:sqlite`、arm64 的 Prisma OpenSSL 引擎选择、构建期必须先有表、`.env` 里的 bcrypt 哈希不能被 shell `source`、Caddyfile 的 `basic_auth` 必须用块形式、`docker run` 不会自动注册 compose 式网络别名。逐条记录在 `docs/INTERNAL_DOCKER_RUNBOOK.md` 与 commit `ed8c151`，改 Dockerfile / Caddyfile / 部署脚本前先读，别凭本机经验推断。

**要亲手把一次提交部署上 NAS，照 `docs/NAS_DEPLOY_PLAYBOOK.md` 执行**（AI 操作者 playbook，含 SSH 登录、凭据位置、命令块、验收、回退）。两条最易踩的新坑先记住：① NAS 上 `/opt/renovation-platform` **不是 git 仓库**（整包放的），**不能 `git pull`**，只能用 `git archive` 铺文件；② Windows 宿主 `git core.autocrlf=true` 会让 `git archive` 把 `nas-deploy.sh`/`Dockerfile`/`Caddyfile` 的 LF 转成 **CRLF**，落地后 `sh` 报 `set: Illegal option -`、`docker build` 的 `RUN` 吃行尾 `\r` 失败——**必须 `git -c core.autocrlf=false -c core.eol=lf archive` 且落地后 `tr -d '\r'` 校验 CR=0 才 build**。凭据（NAS SSH 用户/密码）明文只存 gitignore 排除的 `_scratch/deploy/`，绝不进仓库/镜像/聊天。

## 8. 交付默认与协作

- 参考实现（**只作领域参考，禁止照抄数据/UI/文案**）：`docs/reference/renovation-budget-reference.html`。用来理解"装修预算报价"有哪些要素（科目/项目字段/SOP/材料/计算/打印）；界面与数据须原创、须遵循 §6 设计系统、须是 DB 驱动而非 localStorage。
- 质量门槛（M13 起有明确命令，不再靠"记得跑"）：
  - `pnpm verify` —— 纯函数门禁（13 道 / 753 项，2026-10-20 由 `scripts/run-gates.mjs` 实测）。改算法、口径、格式化、主题映射必跑。
  - `pnpm verify:integration` —— 追加隔离库集成门禁（8 道 / 358 项，各自 `_scratch/*.db`，**不碰 `dev.db`**；驱动器自己 reset 每个库）。改 schema、迁移、服务层写入、跨页联动必跑。
  - `pnpm build` + `npx tsc --noEmit` + `pnpm lint` —— 构建与类型。`next build` 的 standalone 步骤只在容器里开（`BUILD_STANDALONE=1`，见 `next.config.mjs`）：Windows 非特权进程不能建 symlink，会让本机 build 在编译与页面生成全绿之后 EPERM 失败，从而把这条门槛本身弄没。
  - 无控制台报错、迁移+seed 能跑、计算正确、中文、响应式、打印友好；关键页 1:1 目检设计语言保真。
  - **口径变更必须同批改门禁断言**（§4.6 第一条纪律）。判据很简单：门禁没红而行为变了，就是断言没跟上——这跟"门禁红了"一样是交付未完成，不是"测试太严"。
  - **门禁里不许硬编码"随日历漂移的基线数"**（2026-10-20 实见）。`verify-quality-flow` 的初态守卫写死 `节点 === 22`，而 seed 里 001 的完工态是**按今天推导**的（`plannedEnd < 今日 → completed`），节点数只增不减：写守卫那天 22，十天后 23。症状与"上次运行残留"**逐字相同**，于是干净 seed 被误判成残留，照提示去 reset 只会越 reset 越红。改法=换判据而非换数字：用与日期无关的不变量（seed 恒 1 条 open 问题，而任何一次运行都会新建问题或推进它）。同理 `seed.ts` 里凡"按今天自洽"的演示数据，其**行数都是易腐的**，门禁的残留判据必须避开它们。
  - 门禁清单由 `scripts/run-gates.mjs` 按 `verify-*.mjs` / `verify-*.mts` 自动发现，新脚本进目录即被跑到，不需要谁去记。
- 不擅自扩大范围：只完成当前被要求的里程碑；保留扩展位但不提前实现未来模块。发现值得做但未被要求的（§4.6 的"撤销确认"、镜像瘦身等），**登记进报告并说明为何本轮不做**，不要沉默地顺手做掉，也不要沉默地略过。

## 9. 工作区目录约定（2026-10-09 立规，2026-10-13 入册本契约）

立规原因：仓库根曾散落 `_view.log`（且被误提交）、`build_m1a.log`、`build_m1b_a.log`、`build_prod.log`、`start.log`、`docs/.wtest`，上级目录另留有一个一次性脚手架 `scaffold-rp`（327MB，已清理）。根因不是手滑，是**本契约此前没有规定临时产物放哪**，于是每个执行者都往最顺手的地方丢。

### 9.1 仓库内

- **非交付物一律进 `_scratch/`**，整目录 gitignore：日志 `_scratch/logs/`、验收截图 `_scratch/qa/`、一次性试验 `_scratch/tmp/`、临时库 `_scratch/*.db`、dev.db 备份 `_scratch/backup/`。
- **禁止在仓库根新建 `.log` 文件或下划线目录**。已被 gitignore 不等于可以留在根目录。
- **决策类与人看的产物归 `docs/`**（含 `docs/preview/`），不放根目录、不放 `_scratch/`——它是要留档的。手测清单、审查报告、任务卡、状态交接都在 `docs/`。
- 一次性脚手架（`create-next-app`、依赖试装等）**必须在系统临时目录或 `_scratch/tmp/` 里跑**，用完即弃，禁止与项目平级建目录。
- 遗留纠正项（2026-10-13 已收拾）：`qa-shots.mjs` 早期用 `--out _qa` 在仓库根留下 `_qa/`、`_qa_375/`、`_qa_tall*/`、`_qa_acceptance*/` 等下划线目录（虽被 `_qa*/` 规则忽略），一律改道 `_scratch/qa*/`。**脚本默认输出目录不改**（历史命令照用无碍），但新产物不得再落根目录。
- **凭据一律留在 `.env`（gitignore）与部署环境里，不进仓库、不进镜像**。这条在 M13 有个具体教训：`.dockerignore` 曾缺 `.env` 一条，而 builder 是 `COPY . .`，Next 的 standalone tracing 又会把根 `.env` 复制进产物，于是 `.env` 随最终镜像分发（实测到 `.next/standalone/.env` 确实存在）。当前它只含一个 `DATABASE_URL` 所以实害低，但机制性泄露通道一直开着，P4 的口令进来就是明文层泄露。凡"构建上下文会整体拷入"的步骤，都要单独确认忽略清单，别只盯 git。

### 9.2 仓库外（跨项目）

- **新建项目必须落在分组目录内**，不得再往 `E:\19 Python File\` 根平铺。建议分组：`家装业务/`（本平台及后续同业务模块）、`视觉语言/`、`影像后期/`、`内容运营/`、`工具与环境/`。
- **历史项目不主动迁移**。同盘移动虽多能存活，但 `.next`、`tsconfig.tsbuildinfo`、Prisma 生成物内全是绝对路径，移动后需重装依赖并重新生成，且目录授权会失效需重连——故只在项目自然重开时顺手挪。
- git linked worktree **必须与主仓同级或在其分组目录下**，禁止放进主仓工作树内部（git 视其为未跟踪目录，且与 `src/**` 构建 glob 冲突）。并行轨失效后应及时 `git worktree remove` + 删目录，只留分支承载历史。

## 10. 内容型页面与访问口径（2026-10-17 自全局 USER.md 迁入）

迁入原因：这是**本项目专属**的产品口径，按新的记忆分车道规则，不应占用跨项目的全局长期记忆（全局只留指针）。

- **内容型页面（如"平台说明"）走文档站形态**：左侧目录 + 正文分节、可长期扩充，而不是营销落地页。
- **内部经营口径类内容必须放在受登录/口令保护的区段**，公开入口只留不敏感门面。落地方式见 §6 视觉/UI 硬约束之外的访问模型：Caddy 口令（第一层）+ `accessGate.ts` 中间件 401（第二层，绕过反代直连端口时才生效）；语义是"默认全站保护、只放行白名单"，所以承载内部信息的页面（如 `/docs`）不加进白名单即自动受保护，公开只留 `/` 和 `/about`。
