# 任务：M1b-B1 —— 只做 A4 打印导出（一轮一件事）

工作目录 = **`E:\19 Python File\renovation-b1`**（分支 `feat/m1b-b1`，与主仓 A3 轮隔离并行）。
报价编辑器与科目库正在主仓落地，本轮只加一个打印视图，**产出必须是纯新增文件**，便于无冲突合并。

## 开工前只读这三个
1. `src/modules/budget/lib/quote.ts` —— 分组与金额口径唯一真源，**只调用、禁止修改、禁止另写算法**。
2. `src/modules/budget/server/projects.ts` 的 `getProjectDetail()` —— 项目/客户/报价数据来源。
3. `src/app/budget/[projectId]/page.tsx` —— 看它怎么取数，打印页用同一套取数方式。

## 本轮交付
新增路由 `/budget/[projectId]/print`（独立 Server Component，不进侧栏导航）：

- **封面块**：项目名 / 编号 / 地址 / 面积 / 客户与设计·PM / 报价日期 / 税率。
- **汇总表**：按科目分组的小计 + 直接费 + 税金 + 总价 + 单方造价。
- **分科目明细表**：编号、名称、单位、单价、数量、小计、材料说明、施工要求。
- **签字栏**：甲方 / 乙方 两栏，留签字与日期空位。
- 页面顶部放一个「打印」按钮触发 `window.print()`，该按钮本身在打印时隐藏。
- 打印样式写在本路由自己的 `print.css` 里并 `import`，**不要改 `src/styles/globals.css`**：
  隐藏外壳导航与按钮、A4 纵向、`@page` 边距、表格跨页不切断行、避免大面积底色（省墨，纸感底保留）。

## 硬约束
- 金额一律走 `lib/quote.ts`；数字列用 `.num` 且右对齐。
- 样式守 MT V0.3：**无 box-shadow**、单点钴蓝、气声描边、层级靠字重。
- **不要引入越界刻度**：字号只用 12/13/15/17/20/28（禁 `text-sm`/`text-base`/`text-lg`）；间距只用 4/8/12/16/24/32/48 对应档。
- 中文标签不得折行（复用 `src/core/ui` 的 `Button`/`Th`/`Td`，别写裸 `<button>`/`<th>`）。
- 屏幕态与打印态都要成立：屏幕上它是可读的一页，不是只给打印机看的裸表格。

## 禁止
- 不做看板统计、不做项目设置/Logo 上传、不做主题切换、不做自定义字段。
- **本轮只准新增文件，不准修改任何既有文件**（并行轨要无冲突合并）：
  打印页所需的数据取数与组件一律通过 import 复用，不改它们。
- 不改：`prisma/*`、`src/styles/tokens.css`、`src/styles/globals.css`、`tailwind.config.ts`、
  `src/modules/budget/lib/quote.ts`、`src/modules/budget/server/*`、`src/app/budget/catalog/*`、
  `src/app/budget/actions.ts`（A3 正在改它）、`src/app/budget/[projectId]/QuoteBoard.tsx`、
  `src/app/budget/[projectId]/page.tsx`（只读参考）、`src/core/ui/*`、`src/app/layout.tsx`。
- 不加依赖、不 `git commit` / `push` / 切分支。

## 门（两条都要过）
1. `pnpm build` 绿（类型 + lint）。
2. `node scripts/verify-quote.mjs` 全过。
**禁止运行 `pnpm dev`**；截图与打印预览由集成者验。

## 简报（中文，短）
新增/改了哪些文件；打印样式具体做了哪几条（分页、隐藏项、省墨）；屏幕态与打印态各自怎么成立；两条门的实际输出；没做完什么、为什么。
