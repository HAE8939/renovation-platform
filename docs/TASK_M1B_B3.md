# 任务：M1b-B3 —— 只做项目信息编辑（不含 Logo）

工作目录 = 本仓库根（分支 `feat/m1b-b1`，已含 A 轨与打印、看板）。

## 范围说明（为什么没有 Logo）
Logo 上传需要持久化"当前用的是哪个文件"，而本轮禁改 schema、也没有配置表可存。
硬做只能把文件丢进 `public/` 再靠约定猜文件名，属于埋雷。**Logo 随 M1.5 的 `PlatformSetting` 一起做。**
本轮只做 Project 基础信息的编辑。

## 开工前只读这三个
1. `src/modules/budget/server/projects.ts` —— 已有 `getProjectDetail` / `createProject` / `listProjects`，**照它的写法与校验风格新增 `updateProject`**（复用同文件的 `ValidationError`）。
2. `src/app/budget/CreateProjectForm.tsx` —— 现有新建表单，字段与校验口径与它保持一致。
3. `src/app/budget/actions.ts` —— Server Action 包装的既有写法（含 `ValidationError` 转中文文案）。

## 本轮交付
- 新增路由 `/budget/[projectId]/settings`：编辑 Project 的名称、编号、地址、面积、客户名称与电话、设计、项目经理、状态、工期起止。
- `src/modules/budget/server/projects.ts` 新增 `updateProject(projectId, input)`：
  校验规则与 `createProject` 一致（名称/客户必填、面积非负数字、编号唯一且排除自身），
  编号重复时报中文文案。
- `src/app/budget/actions.ts` 新增 `updateProjectAction`，**不动既有 action**。
- 从报价详情页进入设置页的链接放在**页面内**（带真实 `project.id`）——
  全局 `manifest.nav` 是静态清单、拿不到 projectId，挂进去会变成死链（已踩过一次）。
- 保存成功后给一条文字反馈并跳回详情页（或原地提示，二选一，别用 `window.alert`）。

## 硬约束
- 金额与报价逻辑完全不涉及，别去碰 `lib/quote.ts`、`QuoteBoard.tsx`、`stats/*`、`print/*`、`catalog/*`。
- 样式守 MT V0.3：无 `box-shadow`、单点 accent、气声描边、层级靠字重；中文标签与按钮不折行（复用 `core/ui` 的 `Input`/`Button`/`Field`）。
- **注意 `Input` 基类硬写 `w-full`**：要给某个输入框定宽，请用外层容器限宽，别指望传 `w-24` 生效（会被静默压掉）。
- 字号只用 12/13/15/17/20/28（禁 `text-sm`/`text-base`/`text-lg`）；间距只用 4/8/12/16/24/32/48 档。
- 状态字段是字符串常量（`draft` / `in_progress` / `completed` / `archived`），界面显示中文标签，**禁止改 schema 或加枚举**。

## 禁止
- 不改：`prisma/*`（含 schema 与迁移）、`src/styles/*`、`tailwind.config.ts`、
  `src/modules/budget/lib/quote.ts`、`src/core/ui/*`（只复用不改）、`src/app/layout.tsx`、`src/modules/registry.ts`。
- 不做 Logo 上传、不做主题切换、不做自定义字段、不做导出。
- 不加依赖、不 `git commit` / `push` / 切分支。

## 门（两条都要过）
1. `pnpm build` 绿。
2. `node scripts/verify-quote.mjs` 全过（17 项）。
**禁止运行 `pnpm dev`**。

## 简报（中文，短）
新增/改了哪些文件；`updateProject` 的校验规则与唯一性怎么排除自身；入口链接放在哪；两条门实际输出；没做完什么。
