# AGENTS.md — 装修经营管理数字化平台（renovation-platform）

> 本文件是本项目对**所有 AI 编程助手（含 codebuddy）的权威契约**。任何模块开发前先读本文件 + `docs/`。
> 版本：契约 v0.4 · 更新：2026-10-13 · 维护人：HAE（AI 视频导演 / 家装业务数字化）
> v0.4 变更（M10-c 归档口径收口）：§4.3 改写为「**钱按事实 · 事按可见性**」二分（原句「全司读侧早已排除 archived」只对一半，事实类账不许因归档消失），并补：归档确认框须列未闭环事项、`OperationLog.before` 只能存机器值。
> v0.3 变更（M10-a 备料批）：新增 §4.3 归档/作废口径、§4.4 操作流水与错误现场、§4.5 主题插槽双声明锁；§6.1 局部预览依赖元素级插槽（同条锁死）。
> v0.2 变更：R1/R2 落地条款入册（§4.1 跨模块关联主键、§4.2 自定义字段 EAV、§5 报价明细排除、§6.1 主题、§6.2 浮层阴影）+ §9 工作区目录约定入册。原补丁文本在 `docs/PROPOSAL_M1.5.md` §4/§9，其中三处（accent 族值数、设置列名、软删口径）已被 M9-c/M9-d 实际实现取代，**以本文件为准**。

## 0. 项目定位（一句话）

这是一个**面向装修经营全流程的数字化管理平台**，由多个可插拔模块组成。当前只构建 **第 1 个模块：装修预算报价**。未来会陆续加入「项目管理系统」「设计管理系统」等，**全部集成进同一个平台外壳**，共享登录、主数据与视觉语言。

> 定位澄清（2026-10-08）：首期主打**数字化经营管理**，不预设 AI。**AI 辅助管理 = DEFERRED**（后期再加，不在首期范围，命名/界面均不强调 AI）。

- 目标形态：一个仓库、可部署到阿里云轻量服务器的 Web 平台；模块=平台里的一个功能区。
- 红线：**模块化单体**，不做微前端、不做多系统拼门户、不在第一个模块阶段做重型权限中台（DEFERRED）。

## 1. 技术栈（DECIDED，长期沿用）

- **框架**：Next.js（App Router）+ TypeScript，全栈一体（前端页面 + 后端 Route Handler/Server Action 同仓）。
- **ORM/数据**：Prisma。开发期与首个部署用 **SQLite**；`schema` 保持**可移植**（禁用 PG 专有类型如 `String[]` 数组、`dbgenerated` 特殊函数；枚举用 string + 常量）。**JSON 例外（2026-10-11 实测更正）**：本栈 **Prisma 5.22 + SQLite 不支持 `Json` 类型**（`prisma validate` 报 `The current connector does not support the Json type`）——需要存列表/结构时改用**纯文本约定**（如「每行一个选项」）或 JSON 字符串 + 服务层解析函数单点收口；迁 PostgreSQL 后再按需用 `Json`。上多用户/并发时**一步迁 PostgreSQL**（见 §7，列为 QA 关卡，非现在）。
- **包管理**：pnpm。
- **样式**：Tailwind（仅作原子工具类）+ 一层从设计系统派生的 **CSS 变量令牌**（`src/styles/tokens.css`）。**禁止**引入 Element / Antd / MUI 等成套组件库；基础组件在 `src/core/ui/` 手写，严格遵循设计系统。
- **部署**：Docker Compose（app + 反代 Caddy/HTTPS + 后期 postgres），目标阿里云轻量 2G。保持单运行时、少进程、省内存。

## 2. 目录结构（约定，勿漂）

```
renovation-platform/
  prisma/schema.prisma  prisma/seed.ts
  src/
    app/                       # Next App Router：平台外壳 + 各模块路由
      layout.tsx               # 全局外壳：左侧模块导航(由注册表动态生成)+ 顶栏
      page.tsx                 # 平台首页：模块入口卡片网格
      budget/                  # 预算模块路由（app/router 层，薄，调用 modules/budget）
    modules/                   # ★ 可插拔业务模块（每个未来功能=一个目录）
      registry.ts              # 模块注册表（单一清单，外壳据此渲染导航/首页）
      budget/
        manifest.ts            # 实现 ModuleManifest（见 §3）
        components/  server/  types.ts  lib/
    core/                      # ★ 跨模块共享，不属于任何单一模块
      domain/                  # 共享主数据服务：project、client、org、user
      ui/                      # 设计系统派生的基础组件(Button/Card/Input/Table/Modal...)
      db/                      # prisma client 单例
    styles/tokens.css globals.css
  docs/                        # 契约、构建规格、参考副本
  AGENTS.md  CLAUDE.md(指针对本文件)  README.md
```
要点：**路由层薄、逻辑归 `modules/<id>/server`、UI 原子归 `core/ui`、主数据归 `core/domain`**。模块之间不互相 import 内部实现，只通过 `core` 与注册表协作。

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

## 4. 共享核心域（core/domain，Prisma 实体）

即便暂只有预算用到，也从一开始建模留位，避免后续模块各存一套：

- `Organization`（占位，当前单一默认行）
- `User`（占位表已建，暂不接入登录）
- `Client`（甲方：名称、电话、备注…）
- `Project`（★主数据：code、name、地址、面积、client→Client、designer、pm、status、dates）——预算/项目管理/设计管理都挂在 Project 下。

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

### 4.4 操作流水与错误现场（M10-a，DECIDED）

立这两件的原因不是"想要审计功能"，而是：平台即将交给内部员工真实使用，**逻辑问题只能在真实使用中暴露**；而员工说"这个数上周还不是这样 / 页面打不开"时，此前我们**没有任何手段**重建现场。

- **操作流水**唯一入口是 `core/domain/operationLog.ts` 的 `recordOperation()`；模块与页面**不得**自行 `prisma.operationLog.create()`。埋点散开必然漏，漏了就等于没有。
- 三条不变量：① **best-effort**——记流水失败绝不把业务写入带下水（内部吞掉并转 telemetry，返回值只供测试断言）；② **写人话**——`summary`/`before`/`after` 是给业务同事读的中文，SQLite 无 `Json`（§1），要结构化就加列，不塞花括号文本；③ **动作层埋点，不在服务层**——服务函数多在 `prisma.$transaction` 内，日志一旦进事务，记流水失败会连业务一起滚掉。
- `actor` 现阶段是占位用户（最早的 boss，缺则最早任意用户，再兜底 `user-local`）；P4 接登录后换成 session 的 userId，列已预留，届时 `modules/finance/currentUser.ts` 与本处一并收口。
- **错误现场**在 `core/domain/telemetry.ts`：`logAppError(tag, error, ctx?)` 与 `console.error` 同形（全站 42 处 catch 已替换），一行 JSONL 同时写 stdout 与 `logs/app-errors.jsonl`（stdout 那份是给 Docker/pm2 采集用的，不能只留文件）。生产构建把 RSC 渲染错误详情隐去、只给页面一个 digest，故 `app/error.tsx` 会把 digest + 路径 POST 到 `/api/client-errors`，让"错误编号"能反查到现场。
- `logs/` 是 **§9 禁止仓库根散落日志的唯一例外**：运行期错误日志必须由应用自己落盘，不能等人工搬进 `_scratch/`；已 gitignore，超 2MB 自动滚档。

### 4.5 主题插槽有两条选择器，必须同步（M10-a 补）

`tokens.css` 里每套插槽声明**两份**：`:root[data-theme="k"]` 管全站换肤，元素级 `[data-theme="k"]` 管**组件内局部预览**（设置页四张主题卡各自显色）。只有前者时局部预览拿不到插槽色，四张卡看起来"四套没区别"（HAE 意见 4 的真相）。两处必须同键集合同值，由 `verify-theme` 的双声明锁钉死——**只改一处比不改更糟**（全站与预览分叉）。

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
- **设计令牌阶梯（M9-e §4-2 固化，硬约束）**：**字号只用 `12/13/15/17/20/28`px、间距只用 `4/8/12/16/24/32/48`px**（对应 V0.3 §3.1/§7.4）。Tailwind 默认刻度未关，写任意值或 off-ladder 工具类（`text-[22px]`、`p-5`、`gap-7`、`text-lg` 等）即越界——新页面/改动必须走这套阶梯，收口批已把历史越界清零，勿再引入。（`text-xs`/`text-sm` 等命名字号作为既定 body 尺寸保留，约束针对**任意值与自造档**。）
- 本仓 `src/styles/tokens.css` 是把 V0.3 token **首次**落成 CSS 变量的地方（设计系统等这个"首个真实项目验证"）。令牌值以 V0.3 为准，不得凭感觉。
- 反 AI 模板：避免千篇一律的圆角大卡片堆叠、避免彩虹渐变/玻璃拟态/emoji 满屏；遵循 V0.3 的"反模板清单"与页面节奏。

### 6.1 主题可换（R1，DECIDED：客户自助切换）

- `--accent` 一族是**唯一**可随主题替换的变量族；`--canvas` 等底色是**对比度零点，锁定不可调**——换主题不许动它，否则全站对比度基线失效。
- 预置插槽只按 V0.3 §2.4 取值，**禁止自造色值、禁止在设置页开取色器**。客户品牌色不在四套内时，走"按 V0.3 §2.4 补一套插槽并入规范"，而不是现场调色。
- 状态存 DB（`PlatformSetting.themeKey`），**不用 localStorage**——本仓红线是 DB 驱动。
- 配置面收在独立的「平台设置」（`/settings`），**不进模块 registry、不出现在侧栏与首页卡片**（业务模块与平台自身配置两条线不混）；顶部色块预览用 `data-theme` 作用域吃 CSS 变量，不写死 hex。选中后须点「应用主题」才写库（预览与生效分离，不做即点即改全站）。
- 主题应用是**外壳级事实**：改完须 `revalidatePath("/", "layout")` 让全站跟着换色；首页必须保持动态渲染（`force-dynamic`），否则构建时的插槽色被烘死、切完落地页不变色。

### 6.2 浮层与阴影（修正 §6「无阴影」的过度简化）

- V0.3 §4 的纪律是**默认 L0 无阴影**，不是禁止阴影：Modal / 抽屉 / 命令面板**允许**按 L1–L3 使用 `--shadow-1/2/3`，受 Shadow Budget 约束（同屏累计不超一档预算）。
- **当前落地**：本仓零 `box-shadow`（`globals.css` 有声明）。浮层分层用 42% 深色遮罩 + `bg-surface` + `border-line` 描边达成，未消耗阴影预算。这不视为违规，视为"预算未动用"。
- 若将来需要引入浮层阴影，前置条件是**先在 `tokens.css` 落 `--shadow-1/2/3` 三档令牌**并在此条更新口径；**禁止**直接用 Tailwind 默认 `shadow-*` 工具类（与字号/间距越界同类，见 `docs/DESIGN_AUDIT_M1A.md`）。

### 6.3 启动页首屏是 V0.3 的**成文例外**（M10-b，HAE 2026-10-13 拍板）

- 首页 `/` 的启动首屏（`HeroSplash` + `globals.css` 的 `.splash-*`）**不受 §6 视觉硬约束管辖**：允许展示级字号（`clamp(40px,7.2vw,76px)`，超出 12/13/15/17/20/28 阶梯）、深色主按钮、径向柔光背景、入场动画与滚动提示。原因：HAE 明确要"高大上的启动页"，而 V0.3 §Benchmark ≠ Style 红线（禁止把"高级"理解成大标题+黑底+巨图+滚动动画）与该诉求正对——由人拍板开洞，不由实现者自行破规或自行拒做。
- **例外只锁在 `.splash-*` 一个作用域内**：业务页一律不得引用这些类，不得把展示级字号、深色块、柔光背景带进内页；跨页复用的组件（`core/ui/*`）不得为首屏改形态。越界即按 §6 令牌阶梯的"任意值越界"同类处理。
- 两条不豁免的硬要求：**① 配色仍全部取本仓 CSS 变量**（纸底 + 当前主题 accent 族），不为首屏引入新 hex——换主题时首屏必须跟着换；**② `prefers-reduced-motion` 必须支持**（全局规则压时长 + 脚本跳过逐字写入），这是 V0.3 §5.1 的无障碍底线，不在例外范围内。
- 首屏是 `fixed` 覆盖层，不改变 `/` 的既有 DOM：收起即原模块索引页，回归面为零。

## 7. 阶段与状态（DECIDED / EXPLORING / DEFERRED / REJECTED）
- 开发分期：P0 契约(本文) → **P1 平台壳+预算端到端(SQLite)〔进行中〕** → P2 补全预算交互+导出 → P3 部署到阿里云 → P4 引入登录/多用户 → P5 迁 PostgreSQL（QA 关卡）→ P6 项目管理模块 …
- 状态：
  - 技术栈、模块契约、设计指针、SQLite-first = **DECIDED**
  - 登录/角色权限、PostgreSQL、多品牌换肤、数据可视化色板 = **DEFERRED**（表/位已预留，暂不实现）
  - 微前端、多独立系统拼门户 = **REJECTED**

## 8. 交付默认与协作

- 参考实现（**只作领域参考，禁止照抄数据/UI/文案**）：`docs/reference/renovation-budget-reference.html`。用来理解"装修预算报价"有哪些要素（科目/项目字段/SOP/材料/计算/打印）；界面与数据须原创、须遵循 §6 设计系统、须是 DB 驱动而非 localStorage。
- 质量门槛：`pnpm build` 通过、无控制台报错、迁移+seed 能跑、计算正确、中文、响应式、打印友好；关键页 1:1 目检设计语言保真。
- 不擅自扩大范围：只完成当前被要求的里程碑；保留扩展位但不提前实现未来模块。

## 9. 工作区目录约定（2026-10-09 立规，2026-10-13 入册本契约）

立规原因：仓库根曾散落 `_view.log`（且被误提交）、`build_m1a.log`、`build_m1b_a.log`、`build_prod.log`、`start.log`、`docs/.wtest`，上级目录另留有一个一次性脚手架 `scaffold-rp`（327MB，已清理）。根因不是手滑，是**本契约此前没有规定临时产物放哪**，于是每个执行者都往最顺手的地方丢。

### 9.1 仓库内

- **非交付物一律进 `_scratch/`**，整目录 gitignore：日志 `_scratch/logs/`、验收截图 `_scratch/qa/`、一次性试验 `_scratch/tmp/`、临时库 `_scratch/*.db`、dev.db 备份 `_scratch/backup/`。
- **禁止在仓库根新建 `.log` 文件或下划线目录**。已被 gitignore 不等于可以留在根目录。
- **决策类与人看的产物归 `docs/`**（含 `docs/preview/`），不放根目录、不放 `_scratch/`——它是要留档的。手测清单、审查报告、任务卡、状态交接都在 `docs/`。
- 一次性脚手架（`create-next-app`、依赖试装等）**必须在系统临时目录或 `_scratch/tmp/` 里跑**，用完即弃，禁止与项目平级建目录。
- 遗留纠正项（2026-10-13 已收拾）：`qa-shots.mjs` 早期用 `--out _qa` 在仓库根留下 `_qa/`、`_qa_375/`、`_qa_tall*/`、`_qa_acceptance*/` 等下划线目录（虽被 `_qa*/` 规则忽略），一律改道 `_scratch/qa*/`。**脚本默认输出目录不改**（历史命令照用无碍），但新产物不得再落根目录。

### 9.2 仓库外（跨项目）

- **新建项目必须落在分组目录内**，不得再往 `E:\19 Python File\` 根平铺。建议分组：`家装业务/`（本平台及后续同业务模块）、`视觉语言/`、`影像后期/`、`内容运营/`、`工具与环境/`。
- **历史项目不主动迁移**。同盘移动虽多能存活，但 `.next`、`tsconfig.tsbuildinfo`、Prisma 生成物内全是绝对路径，移动后需重装依赖并重新生成，且目录授权会失效需重连——故只在项目自然重开时顺手挪。
- git linked worktree **必须与主仓同级或在其分组目录下**，禁止放进主仓工作树内部（git 视其为未跟踪目录，且与 `src/**` 构建 glob 冲突）。并行轨失效后应及时 `git worktree remove` + 删目录，只留分支承载历史。
