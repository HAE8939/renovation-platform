# 任务卡 M3 · 商务线索闭环（`crm` 模块）

> 状态：**待 M2-A 合入后执行** ｜ 里程碑：**M3**（承 `PLAN_FULL_SERVICE_V1.md` v1.2）
> 前置依赖：**M2-A 已合入 master**（本卡假设 `Lead`/`FollowUp`/`Project` 新列/`status` 六态 均已落库、门禁绿）
> 执行通道：codebuddy `hy3`，**M2-A 之后串行**（同 master 工作树，勿与 M2-A 并行，见 §0 纪律）
> 集成者守：`pnpm build` + 全部门禁脚本 + 三档截图；codebuddy 禁 git / 禁 pnpm dev
> 动手前读：`AGENTS.md` §2/§3/§4 + `docs/TASK_M2A.md`（已合入的真实 schema）+ 本卡 + STATUS §6

---

## 0. 一句话目标

新建可插拔 `crm` 模块：客户线索看板 + 详情抽屉 + 跟进记录 + **签约 → 自动建项目（按手机号归并客户，不重复）** + 商务漏斗看板。跑通「录线索 → 跟进 → 报价 → 签约 → 项目出现在项目列表」主链。

---

## 1. 硬约束（红线）

1. **禁止 git commit / 禁止 pnpm dev**；唯一绿门 `pnpm build`。改动留工作区给集成者。
2. **不重定义核心域**：`Lead`/`FollowUp`/`Project`/`Client` 归 `core/domain`（M2-A 已建），crm 模块**只读写、不改 schema**。本卡原则上 **不动 `prisma/schema.prisma`**（若发现字段缺口，写进「阻塞回报」交集成者定，别自己加列）。
3. **registry 加模块 = 新目录 + manifest + registry 数组加一行**（AGENTS §3），不改外壳代码。
4. **项目级入口不进 `manifest.nav`**（拿不到 leadId/projectId，STATUS §5 死链坑）；二级导航/详情入口放页面内带真实 id 链接。
5. **金额/日期/计数后端算**；聚合取 DB `count`（不抄常量）。
6. **V0.3 视觉**：无阴影、单点钴蓝、色点非 emoji；令牌收口见 §6。
7. **完成度闸门**：宁交完整可编译的 P1，不留半成品。

---

## 2. 建议拆成 codebuddy 运行单元（一次一个界面，防 429/半成品）

| 单元 | 内容 | 优先级 |
|---|---|---|
| **M3-a** 服务层 + 模块注册 | `core/domain/projects` 里 `createProject` 提干上收 + `crm/server/leads.ts`（CRUD/stage/signLead归并）+ manifest/registry + `rbac.ts` 骨架 + `/crm` 列表页（表格，先能列能建） | **P1 必做** |
| **M3-b** 线索看板 + 阶段推进 | 5 阶段看板（按钮推进，拖拽可后做）；卡片显示姓名/楼盘/面积预算/负责人/意向/最后跟进 | P1 |
| **M3-c** 详情抽屉 + 跟进 | 侧滑抽屉：基础信息 + 跟进时间线（最新在上）+ 添加跟进（内容+下次时间）；超 3 天未跟进标红 | P1 |
| **M3-d** 签约表单 + 建项目 | 「方案报价」阶段显签约按钮 → Modal 表单 → `signLead` 归并建项目 + 回写 `Lead.projectId`/stage=signed | **P1 核心** |
| **M3-e** 商务看板 | SVG 漏斗（各阶段数）+ 当月签约列表 + 待跟进提醒 | P2 |

> M3-a/M3-d 是主链骨架，必过；M3-e 可留 P2。

---

## 3. 架构债处理：`createProject` 上收到 `core/domain`（M3-a 内先做，小重构）

现状：`createProject` 在 `modules/budget/server/projects.ts`（预算独占时期）。现 crm 签约也要建 Project → **两处造项目**。
- **本卡先做**：把 `createProject`/`updateProject`/`listProjects` 等**核心域项目服务移到 `src/core/domain/projects.ts`**，budget 模块改从新位置 import。行为不变、纯搬迁。
- 理由：Project 是跨模块主数据（AGENTS §4），不能让 crm import budget 内部实现（AGENTS §2 模块不互相 import 内部）。
- 迁移后必回归：`/budget` 全流程 + `verify-quote` 17 仍绿。

---

## 4. 客户身份归并规则（§1.1-G 落地，本卡最关键断言点）

`signLead(leadId, contractInput)` 事务内：
1. 规范化 `phone`（去空格；仅本地格式，不引国际库）。
2. **按 `orgId + phone` 找既有 `Client`**：命中 → 复用（若 lead.name 与既有 client.name 不同，**不覆盖**，保留既有客户记录为准，只在 lead→project 快照带 lead.name；此为防串改共享主数据的保守策略，UI 给提示）。未命中 → 建 `Client`。
3. `createProject`（用归并到的 `clientId`，带 `contractAmount`/`style`/`area`/`source`=lead.source，`status`=PROJECT_STATUS.draft「筹备中」，designer/pm 由表单选填）。
4. 回写 `Lead.projectId`=新 project.id、`stage`=`signed`。
5. **幂等**：同一 lead 二次 `signLead` → 检测已有 `projectId` 直接返回、不重复建项目/客户。

> **口径已确认（2026-10-09 用户拍板）**：归并键=手机号，`createProject` 上收 `core/domain` 均为 DECIDED，按此实现。签约按 phone 归并**有意取代**既有「按客户名 upsert」，避免同名不同人被并成一个。命中既有 Client 时**不覆盖其 name**（保守，防串改共享主数据），仅在 lead→project 快照带 lead.name 并给 UI 提示。

---

## 5. 权限与视角（rbac.ts 骨架，**别过度实现**）

- 建 `core/domain/rbac.ts` 纯函数 `can(role, action): boolean`，先覆盖 crm 用到的动作（view/edit/sign/export）+ 老板/商务经理两类，其余角色**留空位不臆造**。
- 单用户「角色切换」落位：建议顶栏读 URL `?as=<role>` 或轻量 cookie（**不新增 DB 表、不接认证**）。本期视角=数据过滤 + 按钮显隐，**非安全边界**。
- 红线：别为「以后 11 角色」把 RBAC 做成中台（AGENTS §7 DEFERRED、PLAN §4）。

---

## 6. UI / 令牌收口约束（防越界复发）

新页面字号**只用** 12/13/15/17/20/28、间距**只用** 4/8/12/16/24/32/48（STATUS §4-2 实证：卡里写死刻度→该轮零越界）。看板/抽屉/Modal 遵循 V0.3：气声描边、无阴影（浮层用 L1–L3 令牌）、单点 accent 钴蓝、空状态有引导。中文折行守 `whitespace-nowrap`（按钮/表头）。

---

## 7. 门禁与验收（DoD）

**必跑**：`pnpm build` + `verify-quote.mjs`（17 仍全绿，证 §3 上收没破预算）+ `verify-health.mjs`（不受影响仍绿）+ 新增 `verify-crm.mjs`（见下）。
**新增 `scripts/verify-crm.mjs`（整数/幂等预言机，Node24 原生 import 生产 `signLead`/归并函数）断言至少**：
- phone 归并幂等：同 phone 两次签约 → 只 1 个 Client、只 1 个 Project。
- 未命中新建 → Client 数 +1。
- 同 lead 二次 signLead 不重复建（幂等）。
- 建出的 Project：status=筹备中、contractAmount 正确、clientId 归并正确。

**UI 目检三档**（1440/1280/375，无横向溢出）：
- `/crm` 看板五列渲染、卡片推进阶段生效、超 3 天标红；
- 详情抽屉打开/加跟进写库；
- 签约 Modal → 提交后 `/budget`/项目列表出现新项目、客户未重复。

**手测主链**：录线索 → 跟进 → 推到方案报价 → 签约 → 项目列表可见且金额一致 → 再签同一线索不重复建。

---

## 8. 交付物清单（按单元）

- 新：`src/modules/crm/manifest.ts`、`src/modules/crm/server/leads.ts`、`src/core/domain/projects.ts`（上收）、`src/core/domain/rbac.ts`、`src/app/crm/`（page + board + drawer + 签约 Modal 组件）、`scripts/verify-crm.mjs`
- 改：`src/modules/registry.ts`（加 crmManifest 一行）、`src/modules/budget/server/projects.ts`（改为 re-export/调用上收后的服务）、外壳顶栏角色切换控件（`src/core/ui/Topbar.tsx`，若 §5 走 cookie/URL）
- **不改**：`prisma/schema.prisma`（缺口走阻塞回报）

---

## 9. 阻塞回报优先于瞎猜

遇到以下情况**停下回报集成者**，不要自作主张：
- M2-A 实际落库字段/枚举与本卡假设有出入；
- `signLead` 归并需要 schema 支持（如 Client.phone 需唯一约束）；
- createProject 按 phone 归并的口径与现网数据冲突。

> 本卡依赖 M2-A 已合入的真实 schema；开跑前集成者会用合入后的 `schema.prisma` 校一遍本卡 §4 假设。
