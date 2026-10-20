# 装修经营管理数字化平台（renovation-platform）

面向装修经营全流程的数字化管理平台（**模块化单体**）：一个仓库、一套外壳、共享主数据（Project / Client / User / Organization）、可插拔功能模块。

> **当前状态（2026-10-20）：项目暂停开发，代码冻结在 `master`。** 已建成 10 个业务模块 + 平台设置 + 文档站，全部通过 21 道门禁 / 1111 项断言。冻结点、未闭环事项与恢复方法见 **[`docs/HANDOFF_PAUSE_2026-10-20.md`](docs/HANDOFF_PAUSE_2026-10-20.md)**；权威进度与决策状态见 [`docs/STATUS.md`](docs/STATUS.md)。

## 模块清单

按导航顺序（`src/modules/registry.ts` 为准，外壳据此渲染侧栏与首页，新增模块零改外壳代码）：

| 序 | 模块 | 入口 | 职责 |
|---|---|---|---|
| 0 | 数据驾驶舱 | `/dashboard` | KPI、健康矩阵、商务漏斗、现金折线、毛利率排行 |
| 2 | 商务线索 | `/crm` | 线索五阶段看板 / 列表、跟进、签约建项（手机号归并客户） |
| 3 | 项目管理 | `/projects` | 项目主数据、六合一详情、归档/恢复、操作流水、动态页 |
| 4 | 设计管理 | `/design` | 设计任务看板（双视角）、提交与审核状态机、设计日历 |
| 5 | 时间管控 | `/schedule` | 工序模板库、链式排程生成、甘特、进度与逾期预警 |
| 6 | 质量管控 | `/quality` | 验收节点四态流、问题台账与整改复验、质量档案与打印 |
| 7 | 装修预算报价 | `/budget` | 科目库、报价编辑器（快照）、A4 打印、变更单与确认门 |
| 8 | 财务管控 | `/finance` | 收支台账、五段付款计划（派生解锁）、毛利与回款口径 |
| 9 | 人员工控 | `/hr` | 人员档案、项目责任矩阵、工时 |
| 10 | 全景管理 | `/pano` | 全景导览成品归集（文件在磁盘、登记在库里） |

另有两个不进 registry 的平台页：`/settings`（主题插槽 + Logo + 自定义字段定义）与 `/docs`（11 页文档站）。

经营主线：**线索 → 签约建项 → 报价 → 排程 → 设计 → 施工验收 → 收款 → 归档**。

## 技术栈

| 项 | 选型 |
|---|---|
| 框架 | Next.js 14（App Router）+ TypeScript，全栈一体（页面 + Server Action 同仓） |
| 数据 | Prisma 5.22 + SQLite（16 条迁移、31 个 model；schema 保持可移植，多用户时一步迁 PostgreSQL） |
| 样式 | Tailwind 仅作原子工具类 + 设计系统派生的 CSS 变量令牌（`src/styles/tokens.css`）；**无成套组件库** |
| 包管理 | pnpm 11（需 Node 22+，实测 v24） |
| 部署 | 内网 Docker Compose 内测（已在极空间 NAS 跑通，端口 8181）· 阿里云 HTTPS 属未开工的 P3 |

设计语言唯一真源在仓库外：`MT-Visual-Language / HAE Creator Design System V0.3.md`（纸感底 + 全画面单点 accent + 默认无阴影 + 字号/间距令牌阶梯）。

## 本地运行

```bash
pnpm install
npx prisma generate        # 首次必须（新克隆不会自动执行）
pnpm db:migrate            # 建库 / 推进迁移
pnpm db:seed               # 演示数据（首次必须；幂等，可重跑）
pnpm dev                   # http://localhost:3000
```

生产预览：`pnpm build && pnpm start`。容器内构建需另置 `BUILD_STANDALONE=1`（见 `next.config.mjs`，Windows 非特权进程建不了 symlink）。

环境变量见 `.env.example`；只有 `DATABASE_URL` 是开发必需，其余都是部署期可选项。

## 质量门槛

```bash
pnpm verify               # 13 道纯函数门禁 / 753 项（直接 import 生产代码 + 独立预言机复算）
pnpm verify:integration   # 追加 8 道隔离库集成门禁 / 358 项（各自 reset _scratch/*.db，不碰 dev.db）
npx tsc --noEmit          # 类型
pnpm lint                 # ESLint
pnpm build                # 唯一绿门
```

门禁清单由 `scripts/run-gates.mjs` 按 `verify-*.mjs` / `verify-*.mts` 文件名**自动发现**，新增脚本放进目录即被跑到，不需要人记。

一条用代价换来的纪律：**build 绿 + 断言过 ≠ 页面正确**。历史上的真缺陷多数由逐页截图目检、真 A4 PDF、或无头浏览器真点击（`scripts/acceptance/`）抓出来，门禁拦不住跨表 where 只做一半。所以：

```bash
node scripts/qa-shots.mjs --out _scratch/qa      # 逐页无头截图（自动挑空闲端口 + 比对 BUILD_ID 防假绿）
node scripts/print-pdf.mjs --path /quality/archive/RP-2026-003/print   # 打印视图导真 PDF
```

## 目录结构

```
src/app/           # 路由层（薄）：平台外壳 + 各模块页面 + /docs 文档站
src/modules/       # 可插拔业务模块（registry.ts 单一注册表；每模块 manifest.ts + server/ + components/）
src/core/          # 跨模块共享：domain（主数据与口径单点）/ ui（基础组件）/ db / storage
prisma/            # schema + 16 条迁移 + seed（演示数据按不变量写，可幂等复跑）
scripts/           # 21 道门禁 + 验收台 + 截图/PDF 工具
docs/              # 契约、计划、状态、任务卡、部署手册、审查与验收报告
```

分层铁律：路由层薄、逻辑归 `modules/<id>/server`、UI 原子归 `core/ui`、主数据与**口径**归 `core/domain`；模块之间不互相 import 内部，只经 `core` 与注册表协作；派生值不落库。

## 文档索引

| 文档 | 作用 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **项目契约（所有 AI 编程助手的权威入口）**：技术栈 / 目录 / 模块契约 / 数据口径 / 视觉红线 / 部署环境事实 |
| [`docs/HANDOFF_PAUSE_2026-10-20.md`](docs/HANDOFF_PAUSE_2026-10-20.md) | **冻结与恢复交接**：当前状态、未闭环项、单机资产、恢复第一步 |
| [`docs/STATUS.md`](docs/STATUS.md) | 项目状态真源：里程碑逐条、门禁清单、决策状态、踩坑记录 |
| [`docs/PLAN_FULL_SERVICE_V1.md`](docs/PLAN_FULL_SERVICE_V1.md) | 全案计划（路线 B，M1→M15 里程碑） |
| [`docs/NAS_DEPLOY_PLAYBOOK.md`](docs/NAS_DEPLOY_PLAYBOOK.md) | 内网 NAS 部署 playbook（SSH 登录、CRLF 陷阱、验收、回退） |
| [`docs/PLATFORM_INTRODUCTION_V1.md`](docs/PLATFORM_INTRODUCTION_V1.md) | 平台说明母本（线上渲染为 `/docs` 文档站 11 页；内测期口令已取消，随全站对内网开放） |
| [`docs/HEALTH_CHECK_2026-10-14.md`](docs/HEALTH_CHECK_2026-10-14.md) | M13 系统性体检报告：逐条证据与修复 |

## 范围边界（有意不做的部分）

- **首期主打数字化经营管理，不预设 AI**；AI 辅助管理属后期，界面与命名均不强调。
- 真 RBAC / 多用户登录、PostgreSQL、数据可视化色板、多品牌白标换肤 = **DEFERRED**（表与扩展位已留，未实现）。内测期的口令保护已于 2026-10-17 按用户决定取消（内网 + 测试数据）。
- 微前端、多独立系统拼门户 = **REJECTED**。
- 项目**没有硬删除业务数据**的入口，误操作一律走归档 / 作废 / 撤销确认（口径见契约 §4.3、§4.6）。
