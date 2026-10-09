# 任务：修报价编辑器的版式（只改版式，不改功能）

工作目录 = 本仓库根（master）。上一轮报价编辑器已落地，构建与金额门禁全绿，**唯一问题是版式**。

## 症状（截图实测 1440×900）
`/budget/[projectId]` 的明细表总宽超出其容器：

- 单价（`w-24`）与数量（`w-20`）输入框被压到几乎看不清 —— 而这两个恰是编辑器最该能改的字段；
- 「操作」列被裁在右边缘，要横向滚动才看得见；
- 根因：`QuoteBoard.tsx` 里 `<section>`（表格）与 `<aside>`（预算汇总 + 项目信息）左右并排，
  表格各列 `min-w` 累加（`w-28` 顺序 + `min-w-[260px]` 编号/名称 + `w-16` 单位 + 单价 + 数量 + 小计 + 操作）
  超过了减去侧栏 380px 后的剩余宽度。

## 本轮要求：让明细表拿到全部横向空间

采用这个方向（不要另起方案）：

1. **页面改单栏**：明细表占满内容区宽度，不再与侧栏左右并排。
2. **预算汇总改成表格上方的一条紧凑汇总条**：直接费 / 税金 / 总价 / 单方造价 四项一行、标签在上数值在下、整体右对齐；窄屏允许折成两行。总价仍是全画面唯一的 accent 强调点。
3. **项目信息**（客户 / 面积 / 工期 / 设计 / 项目经理）移到明细表**下方**，用紧凑的定义列表排布，不抢表格空间。
4. 表格列宽相应放宽：编号与名称格给足宽度，单位/单价/数量输入框要能看清数字（单价、数量至少各容得下 `1,234.56` 七字符），「操作」列在 1280px 与 1440px 下都不得被裁。

## 硬约束
- **只改版式与布局结构**。数据流、草稿状态、脏判定、保存逻辑、`saveQuoteItemsAction`、`CatalogPicker` 的选入语义**一律不动**。
- 金额一律走 `src/modules/budget/lib/quote.ts`，**禁止**在组件里写乘法，禁止改该文件。
- 样式守 MT V0.3：**无 box-shadow**；全画面只留一个 accent 强调点；层级靠字重与底色差，不靠字号与粗线；数字列用 `.num` 且右对齐；中文标签与按钮不得折行。
- **不要引入越界刻度**：字号只用 12/13/15/17/20/28（禁 `text-sm`/`text-base`/`text-lg`）；间距只用 4/8/12/16/24/32/48 对应档（禁 `py-5`/`py-2.5`/`gap-1.5` 这类）。
- 窄屏（375px）要成立：表格可横向滚动，但汇总条与项目信息不得溢出。

## 禁止
- 不改：`prisma/*`、`src/styles/tokens.css`、`src/styles/globals.css`、`tailwind.config.ts`、
  `src/modules/budget/lib/quote.ts`、`src/modules/budget/server/*`、`src/app/budget/actions.ts`、
  `src/app/budget/catalog/*`、`src/app/budget/[projectId]/CatalogPicker.tsx`、`src/app/layout.tsx`、`src/core/ui/*`。
- 可改：`src/app/budget/[projectId]/QuoteBoard.tsx`、`src/app/budget/[projectId]/page.tsx`。
- 不加依赖、不 `git commit` / `push` / 切分支。

## 门（两条都要过）
1. `pnpm build` 绿。
2. `node scripts/verify-quote.mjs` 全过（17 项）。
**禁止运行 `pnpm dev`**，截图由集成者做。

## 简报（中文，短）
改了哪几处布局；1440 / 1280 / 375 三个宽度下你各自怎么判断成立；两条门的实际输出；有没有动到功能（应为"没有"）。
