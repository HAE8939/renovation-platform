# 任务：M1b-A2 —— 只做科目库管理页（一轮一件事）

上一轮 codebuddy 在速率限制中断前已写完数据层，本轮**只补 UI 与接线**，范围严格收在这一个页面。

## 开工前只读这三个（不要读其它文档，控制上下文体积）
1. `src/modules/budget/server/catalog.ts` —— **数据层已完成**，直接用它的导出函数（listCatalog / createCategory / updateCategory / deleteCategory / setCategoryOrder / createItem / updateItem / deleteItem / setItemOrder）。**禁止重写或另造一套数据访问。**
2. `src/core/ui/` 下已有组件（Button / Card / Input / Table / Badge / SectionTitle 等）—— 优先复用，缺什么再新建，不改既有组件签名。
3. `AGENTS.md` 的 §6 视觉约束：纸感底、单点钴蓝、**无阴影**、层级靠字重。

## 本轮交付（就这三样）
- `src/app/budget/catalog/page.tsx`：Server Component 取数 + 渲染；科目分组展示、搜索框（前端即时过滤即可）、增删改科目与科目项、上下排序。
- 一个客户端组件承载编辑交互（行内编辑或抽屉均可，但**不得使用阴影**；焦点态用 accent 描边）。
- `src/app/budget/actions.ts` 里**新增** catalog 相关 Server Action 包装（既有的 project action 一个字节都不要动）。
- `src/modules/registry.ts` 里给预算模块加一条二级导航「科目库」。

## 禁止（越界即返工）
- 不做报价编辑器、不做打印、不做看板统计、不做项目设置 —— 那些是后续轮次。
- 不改：`prisma/*`、`src/styles/tokens.css`、`src/styles/globals.css`、`src/modules/budget/lib/quote.ts`、`src/app/budget/[projectId]/*`、`src/app/layout.tsx`。
- 不加任何新依赖、不新增 npm script。
- 不执行 `git commit` / `git push` / 切分支。

## 门
- `pnpm build` 必须绿（类型 + lint）。**禁止运行 `pnpm dev`**。
- 中文界面；窄屏不破版；数字用等宽（`.num` 类已有）。

## 简报（中文，短）
新增/改了哪些文件；四个 CRUD 动作各自怎么从 UI 走到 catalog.ts；`pnpm build` 实际结果；没做完什么、为什么。
