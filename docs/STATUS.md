# 项目状态与交接 — renovation-platform

> 更新:2026-10-08 深夜(24:00 停电前收尾)。明天照本文件无缝续。

## 一句话
平台契约 + **M1a(平台壳 + 预算骨架)已完成并验收通过、已提交**;M1b 因商汤免费模型太慢 + 今晚停电**暂停**,半成品已存分支,明天续。

## ✅ 已完成 & 已验证(M1a · master @ `2398b15`)
- 栈:Next.js 14 App Router + TypeScript + Prisma(**SQLite**) + pnpm + Tailwind(手写令牌、**无组件库**)。
- 平台壳:侧栏/顶栏由 `src/modules/registry.ts` **动态渲染**(可插拔机制已验证;首页有"项目管理/设计管理"DEFERRED 占位)。
- 数据:共享核心域(Org/User/Client/Project)+ 预算实体(Catalog/Quote/QuoteItem 快照);schema **便携化**(无 String[]/枚举,为 P5 迁 PG 留好);`migrate` + 原创 `seed`。
- 页面:`/budget` 项目列表 + 新建(Server Action 落库)、`/budget/[id]` 报价明细 + 实时看板。
- 设计:MT V0.3 落成 `src/styles/tokens.css`,钴蓝 accent、纸感底、无阴影、层级靠字重——截图核验保真、**非照抄参考**。
- 质量:生产 `pnpm build` **绿**(类型 + lint)、页面 HTTP 200、金额**手算核对正确**(直接费 60,185.20 / 税 1,805.56 / 总价 61,990.76 / 单方 482.04 每㎡)。
- 验收截图:`C:\Users\huaiw\_qa_m1a\{home,budget,detail}.png`

## ⏸ 暂停中(M1b)—— 半成品,当参考不当成品
- 分支 `wip/m1b-a`:报价编辑器 + 科目库 CRUD —— **只写了 server 层半成品**(`quote.ts`/`errors.ts` + 改 `projects.ts`),无 UI/路由,未验证。
- 分支 `feat/presentation`(工作树 `E:\19 Python File\rp-b`):打印/看板/设置 —— **只写了 server 半成品**(`logo.ts`/`projectSettings.ts`),未验证。
- 两条都大概率编译不过,明天以任务卡重跑覆盖即可。

## ▶ 明天怎么续(建议)
1. **串行**、一次一轨(商汤免费但很慢,并行不提速、只同时慢)。
2. 每轨用现成任务卡驱动 codebuddy:主仓 `docs/TASK_M1B_A.md`;B 轨 `rp-b/docs/TASK_M1B_B.md`。
   - 硬规则:只以 `pnpm build` 为绿门,**禁止前台 `pnpm dev`**(上次卡死在这),禁改 schema。
3. 跑完由我做**集成**:把 B 轨新文件并入主仓 + 接打印/设置/看板入口与导航 → 统一 `build` → 多端口起服务截图验收。
4. 之后:P3 docker-compose 部署阿里云轻量;P5 SQLite→PostgreSQL 迁移(QA 关卡)。

## 关键决策(状态标注)
- DECIDED:Next+Prisma+SQLite-first;模块化单体 + 模块注册表;UI 手写守 MT V0.3 钴蓝;默认模型 = 商汤 `sensenova-6.8-flash-lite`(免费)。
- 鉴权:免登录单用户,User/Org 表已建留位。
- DEFERRED:登录/RBAC、PostgreSQL、数据可视化色板。REJECTED:微前端、多独立系统拼门户。

## 环境备忘
- 本机**无 Docker、无本地 PG** → 故 SQLite-first。codebuddy 已全局装、默认走商汤。
- 模型坑:商汤慢(单轮 30–40 min);切回腾讯内置模型方法已记(可能受账号额度限制,真要切先冒烟测)。
- 参考文件(仅理解领域、禁照抄):`docs/reference/renovation-budget-reference.html`。
