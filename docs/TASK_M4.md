# 任务卡 M4 · 项目中心（`projects` 模块）

> 状态：**待执行**（拆 M4-a / M4-b） ｜ 承 `docs/PLAN_FULL_SERVICE_V1.md` v1.2 §5-M4
> 前置：M2-A 主脊（Project 全字段 + health.ts）+ M3（crm 签约已能建项目）均已合入
> 执行通道：codebuddy `hy3`，master 串行；集成者守 build + 断言 + 截图
> 动手前读：`AGENTS.md` §2/§4、`docs/TASK_M2A.md`（Project 现状）、`src/core/domain/health.ts`、`src/core/domain/types.ts`

---

## 0. 目标

新建可插拔 `projects` 模块 = **项目管理列表 + 六合一项目详情**，把「签约后的项目」聚成一个统一全貌页，平台第一次「像一个整体」。本期只做**只读聚合**：有真数据的 Tab 显真数据，上游模块（设计/工期/质量）未建的显**诚实空状态**，绝不造数。

## 1. 关键架构决策（先定，防跑偏）

1. **与 budget 列表的分工**：`/budget` 是「报价工作台」（报价视角列），`/projects` 是「项目管理台」（生命周期/健康视角列）。两个入口都列 Project，用途不同，符合 v5.1 把「项目管理」与「预算管控」分列。二者经 `projectId` 互链。
2. **跨模块数据边界（AGENTS §2）**：`projects` **不 import** budget/crm 的 server 内部函数；需要预算汇总时，**经共享 `core/db` 的 prisma 直读 `BudgetQuote`/`QuoteItem`**（共享库读取允许，模块内部逻辑不外借）。
3. **三色灯诚实占位**：工期/质量/预算灯的**数据源模块（M6/M7/M8）未建**，`health.ts` 虽会降级返回 green，但 UI **不得**据此显示「正常」——无数据时显「未接入」中性态（灰点 + 文案），避免"看着健康其实没数据"的误导。
4. **单用户视角**：列表的「角色视角过滤」用 `rbac.ts` 的 `can()` 占位（本期老板视角=全量），不接真登录。
5. **不动 schema**：Project 字段 M2-A 已齐（合同额/户型/风格/巡检/预算员/实际完工等）。

## 2. 拆两个单元（一次一个，防 429/半成品）

| 单元 | 内容 | 优先级 |
|---|---|---|
| **M4-a** | `projects` 模块注册（manifest + registry 加一行 + 从 `deferredModules` 移除 projects）；`/projects` 列表（卡片/表格双视图 + 按 status 筛选 + 生命周期列 + 行链到详情）；`/budget` 列表行加「项目详情」互链 | **P1** |
| **M4-b** | `/projects/[id]` 六合一详情：基础信息(真) + 人员分配(真) + 预算收支(prisma 直读汇总 + 链报价页) + 设计/工期/质量(诚实空状态) | **P1** |

---

## 3. M4-a 详细范围

- 新建 `src/modules/projects/manifest.ts`：`id="projects"`、`name="项目管理"`、`entryPath="/projects"`、`icon="▤"`(单字符非 emoji)、`order` 排在 crm 之后、budget 之前（生命周期视角）。
- `src/modules/registry.ts`：`modules` 数组加 `projectsManifest`；**从 `deferredModules` 删除 `projects` 那条**（它上线了）。
- `src/modules/projects/server/projects.ts`：`listProjectsForManagement(filter?)` —— 经 prisma 读 Project + client 名 + 报价总额（join BudgetQuote 求和，只读）。返回：编号/名称/客户/status/面积/合同额/设计师/项目经理/进度(暂 "未接入")/updatedAt。
- `src/app/projects/page.tsx`：卡片/表格切换（复用 crm 的 ViewToggle 思路或本地实现）；顶部按 `status` 下拉筛选（用 `PROJECT_STATUS_ORDER`）；每行/每卡链到 `/projects/[id]`。
- `src/app/budget/page.tsx`：项目行加一个「项目详情」链接到 `/projects/[id]`（不破坏现有报价入口）。

## 4. M4-b 详细范围

- `src/app/projects/[id]/page.tsx`：顶部项目名 + status 徽章 + 合同额 + 关键人员；六 Tab（客户端 tab 或 `?tab=` 深链）：
  1. **基础信息**：客户(名/电话)、房屋(地址/面积/户型/风格)、装修(开工/计划完工/实际完工)、合同(编号=code/合同额/签约态)、三色灯区（工期/质量/预算，**无数据源时显「未接入」灰态**，进度同理）。
  2. **设计进度**：空状态「设计管理模块开发中（M5）」+ 引导。
  3. **工期进度**：空状态「时间管控模块开发中（M6）」。
  4. **质量验收**：空状态「质量管控模块开发中（M7）」。
  5. **预算收支**：prisma 直读该 project 的 BudgetQuote 汇总（直接费/税/总价/单方）+ 分科目占比条（复用 budget 的 stats 口径思路，但**在 projects 侧独立只读**，不 import budget server）+ 「打开报价单」链到 `/budget/[id]`。
  6. **人员分配**：designer/pm/inspector/budgetAnalyst 字段展示 + 说明「绩效得分待人员管控模块（hr）」。
- 空状态遵循 V0.3（气声描边、无阴影、单点 accent、SVG 简插画的克制版或纯文字引导）。

## 5. 硬约束（两单元通用）

- 禁止 git、禁止 pnpm dev；**不动 schema、不跑 migrate**；唯一绿门 `pnpm build`。
- V0.3 刻度：字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48；无阴影、单点钴蓝；表头/按钮 `whitespace-nowrap`；375 不破版。
- 项目级入口不进 `manifest.nav`（拿不到 id）。
- 金额/汇总后端算、单一口径；聚合取 DB 真值不抄常量。
- 完成度闸门：宁交完整可编译，不留半成品。

## 6. 门禁与验收

- 每单元必跑：`pnpm build` + `verify-quote 17` + `verify-crm 11` + `verify-health 20`（不得回退）。
- 截图（1440/1280/375）：`/projects` 列表双视图 + 筛选；`/projects/[id]` 六 Tab（基础/预算/人员显真数据，设计/工期/质量显诚实空状态，**不得出现假绿/假数字**）。
- 手测：从 `/crm` 签约建项目 → `/projects` 列表出现 → 点进详情 → 预算 Tab 金额与 `/budget/[id]` 一致。

## 7. 阻塞回报优先于瞎猜

遇到「跨模块读预算是否该走 prisma 直读还是让 budget 暴露公共 API」「三色灯未接入态的具体视觉」等拿不准的，先停下回报集成者，别自作主张扩范围或造数。
