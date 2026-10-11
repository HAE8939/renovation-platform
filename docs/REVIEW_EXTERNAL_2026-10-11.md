# 《项目现状审查与“一切皆插件”架构优化报告》

审查基于当前源码、Prisma Schema、生产构建、数据库现状和浏览器巡检完成。未修改代码、未创建文件、未执行写库重构。

结论先说：

- 当前项目是**结构清晰的模块化单体**。
- 还不是“真正的插件化平台”。
- 现有 `ModuleManifest + registry` 属于**编译期模块注册**，不是 Plugin Runtime。
- 领域计算、状态机、快照和事务处理质量较好。
- 最大风险集中在：权限未接入、Core 已耦合业务表、没有事件/API/服务扩展协议、部分服务端规则可被绕过。

## 一、验证结果

| 检查项        | 结果                                                         |
| ------------- | ------------------------------------------------------------ |
| `pnpm build`  | 通过                                                         |
| `pnpm lint`   | 通过                                                         |
| 主要路由 HTTP | 首页、预算、CRM、项目、设计、排程、质量、财务及动态页均返回 200 |
| 浏览器控制台  | 未发现应用级错误                                             |
| 移动端检查    | 当前项目中心、预算详情未复现页面级横向溢出                   |
| 纯函数门禁    | quote 37、CRM 11、health 20、design 28、schedule 55、quality 108、finance 115 全部通过 |
| 交互写回      | 未完整执行，因为本次任务限定为只读审查                       |

## 二、架构判断

当前技术选型合理：

- Next.js App Router + TypeScript + Prisma + SQLite 适合当前单体阶段。
- `src/modules`、`src/core`、`src/app` 的目录职责基本清楚。
- 预算、设计、排程、质量、财务都有独立服务层和状态机。
- 报价、健康度、财务计算已经上收为纯函数，避免了大量重复算式。
- 快照设计合理，模板变化不会回溯历史报价、排程和验收数据。

但模块化边界仍然偏“代码目录化”：

- `ModuleManifest` 只有 `id/name/order/entryPath/nav` 等导航元数据，没有能力、服务、权限、事件、数据迁移或生命周期定义：[src/modules/types.ts (line 6)](E:/19 Python File/renovation-platform/src/modules/types.ts:6)
- registry 是静态 import，新增模块必须修改平台源码：[src/modules/registry.ts (line 1)](E:/19 Python File/renovation-platform/src/modules/registry.ts:1)
- 各模块大量直接访问 Prisma。
- Server Actions 分散在 `app/` 和 `modules/`。
- 项目中心聚合器直接读取预算、排程、设计、质量、财务表。
- 没有独立 API 层、Service Contract 或 SDK。

因此当前准确定位是：

> **模块化单体已成立；插件化运行时尚未成立；具备部分插件化演进基础。**

## 三、“一切皆插件”符合度

| 能力                       | 当前状态                           | 判断                       |
| -------------------------- | ---------------------------------- | -------------------------- |
| Plugin Manifest            | 有，但只有导航信息                 | 表面具备                   |
| Plugin Lifecycle           | 无安装、启用、停用、升级、卸载     | 缺失                       |
| Plugin SDK                 | 无                                 | 缺失                       |
| Plugin API                 | 无 Route Handler、无公共 API 规范  | 缺失                       |
| UI Extension               | 只有模块入口和静态二级导航         | 很弱                       |
| Data Extension             | 通过 Prisma Schema 加表            | 编译期扩展，不是运行期扩展 |
| Permission Extension       | 有 RBAC 草稿，但未被调用           | 未落地                     |
| Event System               | 无 Event Bus；跨模块靠直接函数调用 | 缺失                       |
| Workflow Extension         | 各模块各自有状态机                 | 局部存在，平台级缺失       |
| Configuration              | 无插件配置空间和配置生命周期       | 缺失                       |
| Dependency / Version       | 无                                 | 缺失                       |
| Install / Enable / Disable | 无                                 | 缺失                       |
| Third-party Plugin         | 无安全边界、沙箱、版本协议         | 不具备                     |

`requiresAuth` 当前只是字段，外壳并未执行；RBAC 的 `can()` 也没有形成真实安全边界：[src/core/domain/rbac.ts (line 4)](E:/19 Python File/renovation-platform/src/core/domain/rbac.ts:4)。

## 四、主要耦合点

### 高耦合

1. **Core 直接操作业务模块表**

`src/core/domain/acceptance.ts` 直接读写 `ScheduleTask`、`AcceptanceNode`、`CheckItem`，Core 已经知道排程和质量的具体数据模型：[src/core/domain/acceptance.ts (line 34)](E:/19 Python File/renovation-platform/src/core/domain/acceptance.ts:34)。

这与“Core 只提供基础设施”的理念冲突，是当前最明显的架构问题。

1. **项目中心成为跨模块聚合中心**

`projectDetail.ts` 直接读取设计、排程、质量和财务表：[src/modules/projects/server/projectDetail.ts (line 168)](E:/19 Python File/renovation-platform/src/modules/projects/server/projectDetail.ts:168)。

目前这样做能快速形成项目全貌，但未来每新增模块都可能要修改项目中心，形成“隐形 Core”。

1. **Project 已携带大量业务字段和模块关系**

`Project` 同时承载设计师、项目经理、巡检、预算员、合同额，以及预算、设计、排程、质量、财务等关系。它目前是装修业务主脊，不是通用平台核心。

1. **模块间通过字符串协作**

付款计划依赖工序名称，质量检查项依赖 `stage == task.name`。改名会导致静默失配，属于隐性硬编码。

1. **路由与刷新路径硬编码**

Server Actions 中大量直接写 `/budget`、`/quality`、`/finance` 等路径。未来若插件可安装、路径可配置，现有方式需要重构。

## 五、当前真实质量问题

### P1：服务端可绕过线索阶段规则

UI 只允许相邻阶段推进，但服务端 `advanceStage()` 接受任意合法阶段，没有校验当前阶段与目标阶段的关系：[src/modules/crm/server/leads.ts (line 101)](E:/19 Python File/renovation-platform/src/modules/crm/server/leads.ts:101)。

同时 Action 捕获异常后只记录日志，不向 UI 返回错误：[src/modules/crm/actions.ts (line 57)](E:/19 Python File/renovation-platform/src/modules/crm/actions.ts:57)。

### P1：所有写操作没有真实权限边界

当前免登录状态下，预算、CRM、质量、排程、财务等 Server Actions 都可被直接调用。单用户本地阶段可以接受，但部署到可访问网络后，任何人都可能执行写操作。

### P1：项目状态服务端未严格校验

`updateProject()` 直接接受传入的 `status`，没有使用 `PROJECT_STATUS` 做白名单校验：[src/core/domain/projects.ts (line 303)](E:/19 Python File/renovation-platform/src/core/domain/projects.ts:303)。

恶意或错误请求可以写入未知状态。

### P2：编号生成存在并发竞争

项目编号和线索编号都是 `count + 1`：

- [src/core/domain/projects.ts (line 38)](E:/19 Python File/renovation-platform/src/core/domain/projects.ts:38)
- [src/modules/crm/server/leads.ts (line 119)](E:/19 Python File/renovation-platform/src/modules/crm/server/leads.ts:119)

并发创建时可能产生重复编号，最终表现为数据库唯一约束错误。

### P2：多组织数据隔离尚未成立

虽然存在 `Organization`，但多数列表查询没有按组织过滤，项目、线索、财务等读取基本是全库查询。未来接入多租户时存在数据串读风险。

### P2：交付物链接未做协议校验

`assetRef` 直接进入 `<a href>`：[src/app/design/[id\]/page.tsx (line 77)](E:/19 Python File/renovation-platform/src/app/design/[id]/page.tsx:77)。

应限制为 `https://`、`http://` 或受控文件协议，否则存在危险 URL 和钓鱼跳转风险。

### P2：质量页文案已经过期

质量页实际已经有节点详情、问题台账和质量档案，但页面仍写“将在后续单元上线”：[src/app/quality/page.tsx (line 90)](E:/19 Python File/renovation-platform/src/app/quality/page.tsx:90)。

这是明显的产品一致性问题。

### P2：缺少统一错误和加载边界

未发现统一的 `loading.tsx`、`error.tsx`、`not-found.tsx` 页面级处理。部分服务端异常只能返回通用“请稍后重试”，缺少恢复路径和可诊断信息。

### P2：交互测试不足

当前验证偏重：

- 纯函数；
- 数据库集成；
- 构建；
- 截图。

但缺少稳定的点击级测试，例如：

- 新建后列表是否更新；
- 拖拽推进失败是否反馈；
- 标记付款后汇总是否同步；
- 权限拒绝是否真正阻止写入；
- 删除、审核、复验的重复提交行为。

### P3：视觉系统执行仍不完全收口

源码中仍有大量任意 Tailwind 尺寸，例如 `text-[28px]`、`w-[280px]`、`tracking-[0.14em]`。同时全仓存在 `duration-150`，但设计契约要求尊重 `prefers-reduced-motion`，当前未发现对应降级实现。

### P3：README 已经失真

README 仍是 create-next-app 默认说明，不能反映当前平台模块、SQLite、Prisma、部署和维护方式。

## 六、产品与信息架构

当前信息架构基本能支撑装修经营主流程：

> 商务线索 → 项目 → 设计 → 排程 → 质量 → 财务

项目详情的多 Tab 聚合是合理的，能体现共享 Project 主脊。

但仍存在几个长期问题：

- 首页目前更像模块目录，不是真正的经营驾驶舱。
- 项目中心、预算、财务、质量之间存在多套入口，层级关系还不够统一。
- 没有全局搜索、全局待办、通知、操作记录和审计时间线。
- 人员、附件、变更单、利润分析、组织设置均缺失。
- “已注册模块”与“未来插件”仍是静态展示，不代表可组合运行环境。

## 七、未来插件场景承受能力

### 新增完全不同的业务插件

如果只新增独立路由和独立表，改动较小；如果要接入项目中心、导航、权限和首页，就需要修改 registry、项目聚合器、Schema 和多个页面。

结论：**能承受官方模块增加，不能承受真正运行时插件增加。**

### AI 能力插件

目前没有能力注册、模型配置、密钥隔离、权限声明、事件订阅或任务队列。AI 插件需要直接改 Core 和页面。

结论：**没有 AI Plugin 接入边界。**

### 第三方集成插件

没有公共 API、Webhook、OAuth/凭据配置、事件出站机制或版本兼容协议。

结论：**第三方接入会变成一次性定制开发。**

### 独立数据插件

可以通过 Prisma 加表，但需要重新迁移、重新编译和重新部署。没有插件级数据迁移、启停和卸载语义。

结论：**是 Schema 扩展，不是数据插件。**

## 八、渐进式优化建议

### Phase 1：立即修复

优先级最高：

- 服务端补齐状态机校验，禁止直接跳阶段。
- 所有写操作统一做身份和权限入口。
- 严格校验项目状态、金额、面积、日期和 URL 协议。
- 修复质量页过期文案。
- 增加统一 `loading/error/not-found` 边界。
- 加入组织过滤和资源归属校验。
- 为编号生成改为数据库序列或事务内安全生成。
- 为关键 Server Actions 增加直接调用测试。

这些改动不改变产品范围，值得现在做。

### Phase 2：架构调整

- Core 只保留数据库、组织、身份、权限、配置、事件、文件和基础 UI。
- 将 `syncAcceptanceNodes` 从 Core 业务层移为质量插件的集成服务。
- 将项目中心改成“插件聚合接口”，不要直接读取每个模块的 Prisma 表。
- 给模块定义 Service Contract，而不是让页面和模块互相 import 内部实现。
- 将 `Project` 中明显业务专属字段逐步迁移到对应模块。

### Phase 3：为 Plugin Runtime 做准备

先做轻量、进程内的插件协议，不要立刻引入复杂动态加载：

```
PluginManifest
PluginCapabilities
PluginServices
PluginEvents
PluginPermissions
PluginConfig
PluginVersion
```

至少定义：

- 能力注册；
- 事件发布与订阅；
- 菜单和页面扩展点；
- 服务调用接口；
- 权限声明；
- 配置读取；
- 数据迁移归属；
- API 版本兼容规则。

### Phase 4：开放第三方插件

只有当第二、第三个外部插件真实出现后，再考虑：

- 插件安装、启停、升级、卸载；
- 依赖解析；
- 签名和来源验证；
- 权限审批；
- 沙箱或隔离进程；
- 插件级日志和健康检查；
- 公共 SDK 与开发文档；
- 数据迁移回滚策略。

## 最终判断

当前项目适合继续作为：

> **装修经营领域的模块化单体产品**

不适合现在就宣称为：

> **可安装、可组合、可由第三方持续加载能力的开放式插件平台**

最合理的路线不是马上重写成复杂插件系统，而是先修复服务端规则、权限、组织隔离和数据边界，再把现有模块之间的直接调用逐步替换为服务接口和事件协议。

当前工作区未修改源码；`git status` 中仅有原先的未跟踪审查文档 `docs/REVIEW_PLATFORM_2026-10-11.md`。