# 任务：M1b — A 轨（科目库 CRUD + 报价编辑器）

工作目录 = 本仓库根（分支 master）。

## 开工前必读（按顺序，读完再动手）
1. `AGENTS.md`（项目权威契约：技术栈、目录约定、模块契约、数据模型、视觉硬约束）。
2. `docs/BUILD_SPEC_M1.md` 的 **M1b 段**。
3. UI 设计系统 `E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md`，严格遵守：纸感底、**全画面单点 accent（钴蓝 #3368A0）**、气声描边、**无 box-shadow**、层级靠字重与对比度而非字号和粗线。
4. 现有代码：`src/modules/budget/lib/quote.ts`（计算口径单一真源）、`src/modules/budget/server/projects.ts`、`src/app/budget/[projectId]/QuoteBoard.tsx`、`src/core/ui/*`（可复用组件）。

## 分支纪律
- `git log --oneline -3` 确认自己在 master 上再开工。
- 本机另有 `wip/m1b-a`、`feat/presentation` 两条**废弃半成品分支**：**不要 checkout、不要 merge、不要参考其中任何代码**，本次全部重写。
- **禁止任何 `git commit` / `git push` / 改分支**，提交由集成者统一做。

## 本轮范围（只做数据与编辑，别碰呈现/导出/设置）

### P1 · 科目库管理页（新增 `/budget/catalog`）——先做这个
- `CatalogCategory` / `CatalogItem` 的完整 CRUD：增删改科目与科目项，编辑 code/name/unit/defaultPrice/defaultQty/materials/sop，科目与科目项均可排序，支持按名称/code 搜索。
- **快照语义**（AGENTS §5）：改模板**不回溯**已生成的历史报价；页面文案需体现这一点，代码上不得写任何回写 QuoteItem 的逻辑。
- 数据读写放 `src/modules/budget/server/catalog.ts`（新建），写操作用 Server Action。

### P2 · 报价明细编辑器（升级 `/budget/[projectId]`）
- 把现在的只读看板升级为可编辑：从科目库选入 → 生成 QuoteItem **快照**；改单位/单价/数量；增删行；行排序；「保存」经 Server Action 落库。
- 计算**必须**继续走 `src/modules/budget/lib/quote.ts` 的单一口径，**禁止**在组件里另写一套金额算法，禁止修改该文件的计算逻辑。
- 数据读写放 `src/modules/budget/server/quote.ts`（新建）。

### 完成度闸门（重要）
- 若上下文或时间不足以做完 P1+P2：**优先保证 P1 完整可用且 `pnpm build` 绿**，然后在简报里写清 P2 未做、已留了什么接口。**严禁留下编译不过的半成品。**

## 文件所有权
- 可改/新建：`src/app/budget/[projectId]/QuoteBoard.tsx`、`src/app/budget/actions.ts`、`src/app/budget/page.tsx`、`src/app/budget/catalog/*`（新建）、`src/modules/budget/server/quote.ts`、`src/modules/budget/server/catalog.ts`、`src/modules/registry.ts`（**仅**加 catalog 二级导航项，别动其它）、`src/core/ui/*`（新增组件可以，**不得改既有组件签名**）。
- **禁止改**：`prisma/schema.prisma`、`prisma/migrations/*`（本轮不加字段，现有字段够用）、`prisma/seed.ts`、`src/app/layout.tsx`、`src/styles/tokens.css`、`src/modules/budget/lib/quote.ts`。

## 验证与交付纪律
- 需要依赖时先 `pnpm install`。
- **唯一绿门 = `pnpm build` 通过**（类型 + lint 全过）。**禁止前台运行 `pnpm dev`**（上一轮就是卡死在这里）；起服务与截图验收交给集成者。
- 界面文案全中文；窄屏不破版；不擅自扩大范围（不做打印、看板统计、项目设置、Logo、登录权限）。
- 遇到与契约冲突、或需要改 schema 才能继续的点：**停下来**，在简报里说明并给建议，不要自己动手改。

## 最终交付（中文简报，必须包含）
1. 新增/修改了哪些文件（逐个一行）。
2. 科目库与报价编辑各自的数据流：UI → Server Action → Prisma → 计算口径。
3. 你实际跑过的验证命令与其输出结论（`pnpm build` 是否绿）。
4. 遗留项与风险；P2 若未完成，明确说明缺什么。
