# AGENTS.md — 装修经营管理数字化平台（renovation-platform）

> 本文件是本项目对**所有 AI 编程助手（含 codebuddy）的权威契约**。任何模块开发前先读本文件 + `docs/`。
> 版本：契约 v0.1 · 更新：2026-10-08 · 维护人：HAE（AI 视频导演 / 家装业务数字化）

## 0. 项目定位（一句话）

这是一个**面向装修经营全流程的数字化管理平台**，由多个可插拔模块组成。当前只构建 **第 1 个模块：装修预算报价**。未来会陆续加入「项目管理系统」「设计管理系统」等，**全部集成进同一个平台外壳**，共享登录、主数据与视觉语言。

> 定位澄清（2026-10-08）：首期主打**数字化经营管理**，不预设 AI。**AI 辅助管理 = DEFERRED**（后期再加，不在首期范围，命名/界面均不强调 AI）。

- 目标形态：一个仓库、可部署到阿里云轻量服务器的 Web 平台；模块=平台里的一个功能区。
- 红线：**模块化单体**，不做微前端、不做多系统拼门户、不在第一个模块阶段做重型权限中台（DEFERRED）。

## 1. 技术栈（DECIDED，长期沿用）

- **框架**：Next.js（App Router）+ TypeScript，全栈一体（前端页面 + 后端 Route Handler/Server Action 同仓）。
- **ORM/数据**：Prisma。开发期与首个部署用 **SQLite**；`schema` 保持**可移植**（禁用 PG 专有类型如 `String[]` 数组、`dbgenerated` 特殊函数；枚举用 string + 常量；JSON 用 `Json`）。上多用户/并发时**一步迁 PostgreSQL**（见 §7，列为 QA 关卡，非现在）。
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

## 5. 预算模块数据模型（modules/budget 自有实体）

- `CatalogCategory` 工程科目：id、name、order。（全局模板库，可增删改）
- `CatalogItem` 科目项模板：category→CatalogCategory、code、name、unit、defaultPrice、defaultQty、materials(文本)、sop(文本/多行)、order。
- `BudgetQuote` 报价单：project→Project（唯一或多版本）、taxRate(默认 0.03)、status(draft/confirmed)、created/updated。
- `QuoteItem` 报价明细（**快照自 CatalogItem，非引用**——改模板不回溯历史报价）：quote→BudgetQuote、categoryName、code、name、unit、unitPrice、quantity、materials、sop、order。
- 计算口径：`itemTotal=unitPrice×quantity`；按科目分组小计；`directSubtotal=ΣitemTotal`；`tax=directSubtotal×taxRate`；`grand=directSubtotal+tax`；`unitCost=grand/Project.area`。金额后端算+前端展示一致，两位小数。

## 6. 视觉 / UI（硬约束）

- **UI 相关任务必读并遵守 `E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md`**（唯一真源，一行指针引用，不在本仓复制全文）。
- 设计语言：纸感底、**全画面单点 accent**、气声描边、**无阴影**、层级靠字重与对比度，不靠字号与粗线。中文段落排版/负空间按 V0.3 §3.1、§7.4。
- **accent 选钴蓝 `#3368A0` 主题**（V0.3 默认铁锈红会与 danger 状态色撞车——见 V0.3 红线）。换主题只动 `--accent` 一族变量。
- 本仓 `src/styles/tokens.css` 是把 V0.3 token **首次**落成 CSS 变量的地方（设计系统等这个"首个真实项目验证"）。令牌值以 V0.3 为准，不得凭感觉。
- 反 AI 模板：避免千篇一律的圆角大卡片堆叠、避免彩虹渐变/玻璃拟态/emoji 满屏；遵循 V0.3 的"反模板清单"与页面节奏。

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
