# 任务：M1b-B2 —— 只做科目分布看板（独立路由，不碰编辑器）

工作目录 = 本仓库根（分支 `feat/m1b-b1`，已快进到 master 合并点）。

## 开工前只读这三个
1. `src/modules/budget/lib/quote.ts` —— 分组与小计唯一真源（`groupByCategory` / `computeTotals`），**只调用、禁止修改、禁止另写算法**。
2. `src/modules/budget/server/projects.ts` 的 `getProjectDetail()` —— 取数方式照抄详情页。
3. `src/core/ui/` 的 `Card` / `Badge` / `Table` / `Th` / `Td` / `SectionTitle` —— 优先复用。

## 本轮交付：新增路由 `/budget/[projectId]/stats`
一个只读的科目分布看板，回答三件事：**钱花在哪、报完没报全、哪科占比高**。

1. **科目占比列表**：每个科目一行，显示小计金额、占比百分数、以及一条**水平占比条**。
   按金额降序。占比条用 `div` 宽度百分比实现，**不要用图表库、不要加依赖**。
2. **填报完整度**：已填明细行数、涉及科目数 / 总科目数（后者用 `listCatalogForPicker()` 取全量科目数对比），
   以及"缺材料说明"与"缺施工要求"的行数——这三项是装修报价最容易漏的，比笼统进度条有用。
3. **汇总卡**：直接费 / 税金 / 总价 / 单方造价，全部走 `computeTotals`。
4. 在 `src/modules/budget/manifest.ts` 的 `nav` 里加一条「科目分布」二级导航（现有机制，照「科目库」那行的写法）。

## 设计系统硬约束（这一节最重要）
- **AGENTS §7 已把「数据可视化色板」列为 DEFERRED**，所以：占比条**只允许**用 `--accent` 实色 + `--surface-sunken` 底槽，
  **禁止**多色/彩虹/渐变/按科目分配不同颜色。要区分主次只靠**长度与字重**。
- 全画面单点 accent：占比条是本页唯一 accent 出口，页面标题与数字不得再用 accent 上色。
- 无 `box-shadow`；气声描边；层级靠字重与底色差；纸感底不动。
- 数字一律 `.num` 且右对齐；金额用 `formatCny`、占比用 `formatPercent`、数量用 `formatQty`。
- 字号只用 12 / 13 / 15 / 17 / 20 / 28（**禁 `text-sm` / `text-base` / `text-lg`**）；
  间距只用 4 / 8 / 12 / 16 / 24 / 32 / 48 对应档（**禁 `py-5` / `py-2.5` / `gap-1.5` 这类**）。
- 中文标签与按钮不得折行（复用 `core/ui` 组件，别写裸 `<button>` / `<th>`）。
- 窄屏 375px 不破版。

## 禁止
- 不改 `QuoteBoard.tsx`、`CatalogPicker.tsx`、`print/*`、`catalog/*`（并行稳定区）。
- 不改：`prisma/*`、`src/styles/tokens.css`、`src/styles/globals.css`、`tailwind.config.ts`、
  `src/modules/budget/lib/quote.ts`、`src/modules/budget/server/*`、`src/app/budget/actions.ts`、
  `src/core/ui/*`、`src/app/layout.tsx`。
- 不做项目设置 / Logo 上传、不做主题切换、不做自定义字段、不做导出。
- 不加依赖、不 `git commit` / `push` / 切分支。

## 门（两条都要过）
1. `pnpm build` 绿。
2. `node scripts/verify-quote.mjs` 全过（17 项）。
**禁止运行 `pnpm dev`**，截图由集成者做。

## 简报（中文，短）
新增哪些文件；三个指标各自的数据来源与口径；占比条怎么做到"零彩色也能分主次"；两条门的实际输出；没做完什么。
