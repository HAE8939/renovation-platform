# 任务：M1b — A 轨（报价编辑器 + 科目库 CRUD）

工作目录 = 本仓库根（master）。开工前完整读：AGENTS.md、CLAUDE.md、docs/BUILD_SPEC_M1.md（M1b 段）；UI 读 `E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md` 并严格遵守（纸感底、单点钴蓝、无阴影、层级靠字重对比）。

## 本轮范围（只做数据/编辑，别碰呈现/导出）
1. **报价明细编辑器**（`/budget/[projectId]`）：把现在的只读看板升级为可编辑——从科目库选入生成 QuoteItem 快照、改单位/单价/数量、增删行、行排序；「保存」经 Server Action 落库。计算仍走 `lib/quote.ts` 单一口径。
2. **科目库管理页**（新增 `/budget/catalog`）：CatalogCategory / CatalogItem 的完整 CRUD（增删改科目与项目、改单价/默认量/材料/SOP、排序、搜索）。编辑模板不回溯历史报价（快照语义，AGENTS §5）。

## 文件所有权（只有你能改这些）
- 可改/新建：`src/app/budget/[projectId]/QuoteBoard.tsx`、`src/app/budget/actions.ts`、`src/app/budget/page.tsx`、`src/modules/budget/server/*`（新增 quote.ts / catalog.ts）、`src/app/budget/catalog/*`（新增）、`src/modules/registry.ts`（仅加 catalog 二级导航项）。
- **禁止改**：`prisma/schema.prisma`、`prisma/migrations/*`（本轮不加字段，现有字段够用）、`src/app/layout.tsx`。新增 `src/core/ui/*` 组件可以，但别改既有组件签名。
- **不要做**：打印导出、看板统计、项目设置/Logo —— 那是并行的 B 轨，你碰了会冲突。

## 验证与交付纪律
- `pnpm install`（若缺）→ **`pnpm build` 必须绿**（类型 + lint 全过）。**不要前台运行 `pnpm dev`**（会卡住回合），起服务验证交给集成者。
- 严格守 AGENTS 契约，不擅自扩范围。遇到与契约冲突或需长期决策的点，停下在简报里说明并给建议。
- 最后用中文简报：改了/新增哪些文件、编辑与科目库的数据流、我如何验证、遗留/风险。
