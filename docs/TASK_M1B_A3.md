# 任务：M1b-A3 —— 只做报价明细编辑器（A 轨最后一件）

工作目录 = 本仓库根（master）。科目库页已在上一轮落地，本轮只升级报价详情页。

## 开工前只读这三个（控制上下文体积，别通读全部文档）
1. `src/modules/budget/server/quote.ts` —— **数据层已完成**：`saveQuoteItems(projectId, rows)` 单事务整表替换、入参校验、order 重编号。**直接调用，禁止重写。**
2. `src/modules/budget/server/catalog.ts` —— 已提供 `listCatalogForPicker()`，**"从科目库选入"就用它**，不要另写查询。
3. `src/app/budget/[projectId]/QuoteBoard.tsx` + `src/modules/budget/lib/quote.ts` —— 现有看板与计算口径。

## 本轮交付
把 `/budget/[projectId]` 从「只读 + 临时改数量」升级为完整编辑器：

- **从科目库选入**：一个选入面板（用 `listCatalogForPicker()`），选中后按**快照**生成一行（把 category/code/name/unit/defaultPrice/defaultQty/materials/sop 复制进 QuoteItem），此后与模板脱钩。
- **改**：单价、数量、单位、材料、施工要求可行内编辑。
- **删 / 增空行 / 上下排序**。
- **保存**：调 `saveQuoteItems` 落库；保存后以数据库返回的行替换本地状态（id 与 order 会重分配，别把旧 id 留在 state 里）。
- 未保存改动要有可见提示（文字即可，别只靠颜色）。

## 硬约束
- 金额**一律**走 `lib/quote.ts`（`lineTotal` / `groupByCategory` / `computeTotals` / `formatCny`），**禁止**在组件里写 `unitPrice * quantity`，禁止改该文件。
- 快照语义：不得写任何"改模板要回写历史报价"的逻辑。
- **样式守 MT V0.3，且不要引入新的越界刻度**：字号只用 12 / 13 / 15 / 17 / 20 / 28（**禁 `text-sm` / `text-base` / `text-lg`**）；间距只用 4 / 8 / 12 / 16 / 24 / 32 / 48 对应档（**禁 `py-5` / `py-2.5` / `gap-1.5` / `py-10` 这类**）；**无 box-shadow**；浮层用底色差 + 气声描边表达；金额列用 `.num` 且右对齐。
- 中文按钮与表头不得折行（`Button` / `Th` 基类已加 `whitespace-nowrap`，复用共享组件即可，别自己写裸 `<button>`）。

## 禁止
- 不做打印导出、不做看板统计、不做项目设置/Logo、不做主题切换、不做自定义字段。
- 不改：`prisma/*`、`src/styles/tokens.css`、`src/styles/globals.css`、`tailwind.config.ts`、`src/modules/budget/lib/quote.ts`、`src/app/budget/catalog/*`、`src/modules/budget/server/*`、`src/app/layout.tsx`。
- 不加依赖、不 `git commit` / `push` / 切分支。

## 门（两条都要过）
1. `pnpm build` 绿（类型 + lint）。
2. `node scripts/verify-quote.mjs` 全过（17 项，含金额口径与快照契约断言）。
**禁止运行 `pnpm dev`**，起服务与截图验收由集成者做。

## 简报（中文，短）
新增/改了哪些文件；选入→编辑→保存的数据流；两条门的实际输出；没做完什么、为什么。
