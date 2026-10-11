# 装修经营管理数字化平台（renovation-platform）

面向装修经营全流程的数字化管理平台（**模块化单体**）：一个仓库、一套外壳、共享主数据（Project / Client / User / Organization）、可插拔功能模块。当前覆盖经营主脊：

> 预算报价 → 商务线索 → 项目中心 → 设计管理 → 时间管控（排程）→ 质量管控 → 财务管控

## 当前进度

M1a→M8 全部合入并通过门禁（预算 / 线索 / 项目 / 设计 / 排程 / 质量 / 财务 七个业务模块 + 平台壳）；M8.5 小修复批次后进入 **M9（财务深化 + 驾驶舱 + EAV 自定义字段）**。权威进度、决策状态与交接见 **`docs/STATUS.md`**。

## 技术栈

| 项 | 选型 |
|---|---|
| 框架 | Next.js（App Router）+ TypeScript，全栈一体（页面 + Server Action 同仓） |
| 数据 | Prisma ORM + SQLite（开发与首个部署；schema 保持可移植，多用户时一步迁 PostgreSQL） |
| 样式 | Tailwind 仅作原子工具类 + 设计系统派生的 CSS 变量令牌（`src/styles/tokens.css`）；无成套组件库 |
| 包管理 | pnpm（Node ≥ 18） |
| 部署目标 | Docker Compose（app + Caddy 反代）· 阿里云轻量 2G（暂缓，先本地跑通） |

## 目录结构（约定，勿漂）

```
src/app/       # 路由层（薄）：平台外壳 + 各模块页面
src/modules/   # 可插拔业务模块（registry.ts 单一注册表；每模块 manifest.ts + server/ + components/）
src/core/      # 跨模块共享：domain（主数据/口径）/ ui（基础组件）/ db（prisma 单例）
prisma/        # schema + 迁移 + seed
scripts/       # 门禁与工具脚本（verify-* / qa-shots / print-pdf）
docs/          # 契约、计划、状态、审查记录
```

分层铁律：路由层薄、逻辑归 `modules/<id>/server`、UI 原子归 `core/ui`、主数据归 `core/domain`；跨模块只经 core，不互相 import 内部；口径单点、派生值不落库。

## 本地运行

```bash
pnpm install
pnpm db:migrate    # 建库 / 推进迁移（prisma migrate dev）
pnpm db:seed       # 演示数据（首次必须）
pnpm dev           # 开发：http://localhost:3000
```

生产预览：`pnpm build && pnpm start`。

## 验证与门禁（合入前必跑）

- **唯一绿门**：`pnpm build`；类型检查：`npx tsc --noEmit`。
- **纯函数门禁**（直接 import 生产代码，含独立预言机复算）：
  `node scripts/verify-quote.mjs`(37) · `verify-crm.mjs`(11) · `verify-health.mjs`(20) · `verify-design.mjs`(28) · `verify-schedule.mjs`(55) · `verify-quality.mjs`(108) · `verify-finance.mjs`(115)
- **隔离库集成门禁**（会改临时库，跑前先 `migrate reset --force`，配方见各脚本头注）：
  `verify-sign.mts`(12) · `verify-schedule-gen.mts`(27) · `verify-quality-flow.mts`(94) · `verify-finance-flow.mts`(55)
- **页面级**：`node scripts/qa-shots.mjs`（无头截图逐页巡检）；`node scripts/print-pdf.mjs`（打印视图真 A4 PDF）；375 布局争议用同源 iframe DOM 探针量 `scrollWidth`（勿凭截图肉眼）。
- 纪律：**build 绿 + 断言过 ≠ 页面正确**——历史真缺陷多由截图 / 目检发现。

## 文档索引

| 文档 | 作用 |
|---|---|
| `AGENTS.md` | **契约（唯一真源）**：技术栈 / 目录 / 模块契约 / 视觉红线 / 协作约定 |
| `docs/STATUS.md` | **项目状态真源**：进度 / 门禁 / 决策状态 / 踩坑记录 / 交接 |
| `docs/PLAN_FULL_SERVICE_V1.md` | 全案计划（路线 B，M1→M9+ 里程碑） |
| `docs/PLATFORM_EVOLUTION_V0.1.md` | 平台演进方向（插件化话题的单一裁决记录） |
| `docs/REVIEW_PLATFORM_2026-10-11.md` · `docs/REVIEW_EXTERNAL_2026-10-11.md` | 整站审查：自包含简报 + 外部报告 |
