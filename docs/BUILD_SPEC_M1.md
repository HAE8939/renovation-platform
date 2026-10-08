# BUILD SPEC — M1（平台壳 + 预算模块）

> 执行者：codebuddy。先读 `AGENTS.md`、`CLAUDE.md`、本文件，再读 MT 设计系统 V0.3。
> 严格分两段：**M1a 地基（本次先做，必须能跑起来给我验收）** → 我 QA → **M1b 补全（我验收 M1a 通过后再做）**。
> 不要跳过验收把 M1a+M1b 一次全做完。

## M1a —— 地基与骨架（目标：一个能 `pnpm dev` 跑起来、MT 风格、SQLite 有真数据的平台壳 + 预算可看可建项目）

### 1. 脚手架
- `pnpm create next-app`（App Router、TypeScript、Tailwind、src/ 目录、pnpm、ESLint）。端口默认 3000。
- 建 `src/core/db/index.ts`（PrismaClient 单例）。`prisma/schema.prisma` provider=`sqlite`，`.env` 放 `DATABASE_URL="file:./dev.db"`。

### 2. 设计令牌与基础组件（MT V0.3）
- `src/styles/tokens.css`：把 V0.3 的 token 落成 CSS 变量——背景纸感色、文字三档对比度、**单点 accent=钴蓝 `#3368A0`** 一族、气声描边色、间距阶梯、圆角、字体（中文字体栈 PingFang SC/Microsoft YaHei）。`globals.css` 引用。**无 box-shadow**（V0.3 明令）。
- `src/core/ui/`：手写最小组件 `Button` `Card` `Input` `Table` `Badge` `Nav`，只用 tokens 变量，禁成套组件库。
- 自检：整体观感须"干净、克制、单一强调色、层级靠字重对比"，不是模板味。

### 3. 平台外壳 + 模块注册（可插拔机制）
- `src/modules/registry.ts` 导出 `modules: ModuleManifest[]`；`src/modules/budget/manifest.ts` 实现预算模块清单（id=budget, name=装修预算报价, order=1, entryPath=/budget）。`ModuleManifest` 接口见 AGENTS §3。
- `src/app/layout.tsx`：左侧**模块导航由 registry 动态渲染**（外壳不得写死预算），右侧内容区 + 顶栏（平台名 + 当前模块名）。当前免登录。
- `src/app/page.tsx`：平台首页=已注册模块入口卡片；为体现"平台"可扩展，再渲染 2 个 `DEFERRED` 占位卡（项目管理/设计管理）标"即将上线"，不可点。

### 4. 数据模型（Prisma migrate + seed）
- 核心域：`Organization` `User`(占位) `Client` `Project`（字段见 AGENTS §4）。
- 预算：`CatalogCategory` `CatalogItem` `BudgetQuote` `QuoteItem`（字段见 AGENTS §5）。
- `prisma/seed.ts`：建 1 个默认 Organization、1 个 Client、1 个演示 Project、给该 Project 建 1 张 BudgetQuote + 若干 QuoteItem；再灌一批**原创**装修科目模板（3–4 个科目、每科 3–5 项，示例名称/单位/单价/材料/SOP 自拟，**不得逐字复制参考文件里的行**——参考文件仅用于理解领域要素）。

### 5. 预算可看可建（M1a 只做：列项目+建项目+查看报价与合计，只读为主）
- `/budget`：列出 Project 卡片（名称/编号/面积/客户/状态）+「新建项目」表单（Server Action 写库）。
- 点项目进 `/budget/[projectId]`：报价明细表（科目分组、单价、数量、小计）+ 右侧**实时预算看板**（直接费/税/总价/单方造价）+ 顶部项目信息。**数量可临时改并即时重算**即可，明细的增删/科目库管理留 M1b。

### M1a 验收标准（我会逐条测）
- `pnpm build` 绿；`pnpm dev` 起在 http://127.0.0.1:3000；`prisma migrate` + `seed` 成功、`dev.db` 有数据。
- 首页能看到"预算"入口 + 2 个占位卡；侧栏来自 registry（改 registry 会反映到导航——用可扩展性证明）。
- `/budget` 列出 seed 的项目、能新建并持久化；`/budget/[id]` 表格与合计数字**计算正确**、改数量总价跟着变。
- 界面符合 MT V0.3：单点钴蓝、无阴影、纸感底、克制；**不是对参考 HTML 的复制**（布局/配色/文案/数据均原创）。
- 控制台无报错；中文；窄屏不破版。

## M1b —— 补全为完整预算系统（M1a 通过后再做）
- 报价编辑器：从科目库选项加入 / 增删改明细行、改单位/单价/材料/SOP、排序。
- 科目库（零件库）管理页：Category/Item 的完整 CRUD + 搜索 + 恢复默认（不影响已有报价，因 QuoteItem 是快照）。
- 项目设置：编辑 Project 信息 + Logo 上传（存本地/`public`）。
- 数据中心看板：科目分布统计、填报完整度进度、占比条。
- 导出：A4 打印友好（封面+汇总表+分科明细+签字栏），`window.print()` + 打印样式。
- 收尾：README（启动/部署/迁移到 PG 的说明）、`.env.example`、Docker 部署文件放 P3。

## 交付纪律
- 一次只交当前里程碑；不确定处以 AGENTS.md 为准，AGENTS 没写且影响方向的，停下来问，别自行扩大范围。
- 代码里注释解释"为什么"，别解释"是什么"。命名英文、界面文案中文。
