# 项目状态 — renovation-platform

> 更新：**2026-10-09 18:10** · 维护：QwenWork（集成者）
> 本文件是**唯一**状态真源。`docs/SURVEY_2026-10-09.md`（16:48 快照）已并入此处并删除；
> 10-08 深夜版 STATUS 中「M1b 暂停、两条 wip 分支待续」已作废——那两条废弃分支弃用未参考，M1b 由新轨道重做完成。
> **2026-10-09 下午**：吸收 `Full-Service Project Management/` 三份妙搭资料，全案重排为 `docs/PLAN_FULL_SERVICE_V1.md` v1.2（路线 B）；M2-A 主脊 schema 已合入。
> 下面每个数字都是本轮实测（`git log` / `pnpm build` / 门禁脚本 / grep 全量扫描），不是从旧文档抄的。

## 0. 一句话

**M1a 平台壳 + M1b 预算模块已全部落在 master 并通过门禁；M2-A「全案主脊 schema」已合入（Project 扩列、Lead/FollowUp 建表、User 11 角色常量、health.ts 派生层），schema 自 M1a 起从 1 条迁移增至 2 条、旧预算数据零破坏。全案按 `PLAN_FULL_SERVICE_V1.md` v1.2 路线 B（执行链优先）推进；**M3-a1（`createProject` 上收 + crm 模块骨架 + 线索列表/新建）已合入，M3 余下看板/抽屉/签约/漏斗待续。**

## 1. 已完成（M1b 最后一个代码提交 `6f4246a`；其后均为文档提交，`git log --oneline \| wc -l` 可自查）

| 里程碑 | 内容 | 验证 |
|---|---|---|
| M1a | 平台壳（registry 动态导航）+ 共享核心域 + 预算实体 + 只读报价页与实时看板 | build 绿、金额手算 |
| M1b-A2 | 科目库 `/budget/catalog`：Category/Item 全套 CRUD、搜索、上下排序、抽屉编辑 | build + 截图目检 |
| M1b-A3 | 报价明细编辑器：选入生成快照、行内改编号/名称/单位/单价/数量、增删行、排序、整表保存、脏状态文字提示 | build + 17 项断言 + 截图 |
| M1b-A4 | 编辑器改单栏版式：汇总条上移、项目信息下移、状态 Badge 改 outline 守单点 accent | 1440/1280/375 三档截图 |
| M1b-B1 | A4 打印 `/budget/[projectId]/print`：封面 + 费用汇总 + 分科目明细 + 签字栏，自有 `print.css` | **真 PDF 实测 3 页** |
| M1b-B2 | 科目分布 `/budget/[projectId]/stats`：占比条、填报完整度、汇总卡 | build + 截图 |
| M1b-B3 | 项目设置 `/budget/[projectId]/settings`：`updateProject` + 表单，编号唯一性排除自身 | build + 17 项断言 |
| **M2-A** | **全案主脊 schema**：`Project` +7 可空列（合同额/户型/风格/渠道/巡检/预算员/实际完工）+ status 纯新增 design/acceptance 两态（零行迁移）；`Lead`/`FollowUp` 建表；`User.department` + `USER_ROLE` 11 角色常量；`BudgetQuote.lockedAt`；`core/domain/health.ts` 派生层（进度+三色灯，无 prisma、非 emoji） | build 绿 + verify-quote 17 + **新 verify-health 20** + 活库截图详情页 ¥61,990.76 一致 |
| **M3-a1** | `createProject`/`updateProject`/`listProjects`/`suggestProjectCode` 从 budget 上收 `core/domain/projects.ts`（budget 留 re-export 兼容层，`QuoteItemRow` 在 core 内本地定义避免反向依赖）；新建 `crm` 模块（manifest+registry 接线、`rbac.ts` 骨架、`Lead` list/create/advanceStage、`/crm` 列表页+新建表单）。**M3 余 b 看板 / e 漏斗（c 抽屉、d 签约已完成）** | build 绿 + verify-quote 17（上收未破预算）+ verify-health 20 + `/crm` 活库截图列出 2 条 seed 线索 |
| **M3-d1** | `createProject` 加可选 `clientId`/`clientPhone`/`style`/`source`/`contractAmount`（向后兼容，预算零改动）；`signLead` 事务内按手机号归并 Client（命中不覆盖 name）、幂等、建项目回写 `Lead.projectId`+stage=signed；抽 `leadMatch.ts` 纯函数 + 新 `verify-crm.mjs`。运行期 DB 归并行为待 d2 集成验 | build 绿 + verify-quote 17（扩展未破预算）+ verify-crm 11 + verify-health 20 |
| **M3-d2** | 签约 UI 接 `signLead`：新 `core/ui/Modal.tsx`（V0.3 L1 遮罩+L3 浮层）、`SignLeadModal.tsx`、`signLeadAction`；`/crm` 加「签约/项目」列（quoted 及之后显签约、已签约显「查看项目」链接）。**集成测试抓出并修复真 bug**：`signLead` 与 `createProject` 各开独立事务、SQLite 下后者看不见前者未提交的 Client → 改为 `createProject(input, tx?)` 事务传播 | build 绿 + verify-quote 17 + verify-crm 11 + verify-health 20 + **新 `verify-sign.mts` 集成 12/12** + `/crm` 截图签约按钮按阶段门控正确 |
| **M3-c** | 线索详情抽屉 + 跟进：新 `core/ui/Drawer.tsx`（右侧滑出，复用 Modal 遮罩/浮层令牌）、`LeadDrawer.tsx`；抽纯 `crm/stages.ts`（无 prisma，供客户端安全引用）；`getLeadDetail`/`addFollowUp` 服务 + `getLeadDetailAction`/`addFollowUpAction`；`/crm` 行可点开抽屉（基础信息+跟进时间线倒序+添加跟进表单），未签约且超 3 天未跟进的「最后跟进」标 danger 红 | build 绿 + verify-quote 17 + verify-crm 11 + verify-health 20 + **隔离库 addFollowUp 集成 6/6** + `/crm` 截图确认超 3 天标红、d2 签约列未破 |

**路由 7 条**（M2-A 无新增路由，纯数据层）：`/`、`/budget`、`/budget/[projectId]`、`/budget/[projectId]/print`、`/budget/[projectId]/stats`、`/budget/[projectId]/settings`、`/budget/catalog`。

**数据基线**：4 科目 / 16 模板项 / 16 报价明细；直接费 ¥60,185.20 · 税 ¥1,805.56 · 总价 ¥61,990.76 · 单方 ¥482.04/㎡（128.6㎡）。

## 2. 门禁与工具链（五个脚本，均可重跑）

| 脚本 | 拦什么 | 备注 |
|---|---|---|
| `scripts/verify-quote.mjs` | **17 项断言**：行小计、分组不漏项、税、总价、单方、行序唯一、快照列检查、一项目一报价、**科目库非空且无空科目**、模板 code 唯一、单一口径（`lib/quote.ts` 之外不得出现 `unitPrice×quantity`） | 直接 `import` 生产代码（Node 24 原生跑 TS）+ 独立整数分预言机复算。另抄一遍算法的假测试不做 |
| `scripts/qa-shots.mjs` | 起生产构建逐页无头截图，支持 `--viewport` | 已修两处：自动挑空闲端口 + 比对 `BUILD_ID` 防残留服务假绿；`execFileSync` 阻塞杀进程树防泄漏孤儿服务 |
| `scripts/print-pdf.mjs` | 把打印视图导成真 A4 PDF | 屏幕截图看不出分页与打印媒体样式，打印类改动必须走这个 |
| `scripts/verify-health.mjs` | **20 项断言**：`health.ts` 四纯函数（进度均值/工期灯/质量灯/预算灯）边界 + 输出不含 emoji | M2-A 新增；仿 verify-quote，Node 24 原生 import 生产 health.ts + 独立枚举预言机 |
| `scripts/verify-sign.mts` | **签约端到端集成门禁**：真跑生产 `signLead`，断言幂等（签两次同项目不覆盖）+ 手机号归并（同 phone 只 1 Client、第二条 lead 复用同 Client 另建项目）+ lead 回写 | 需 tsx 解析 `@/` 别名 + 临时库；运行配方见脚本头。M3-d2 靠它抓出事务传播 bug。**纯函数断言覆盖不到这层** |

**验收纪律**：`build` 绿 + 断言过 ≠ 页面正确。今天三个真缺陷全部由**截图 / PDF 目检**发现（科目库空壳、编辑器列宽挤压、打印 5 页），门禁一个都没拦住。

## 3. 关键决策（状态标注）

**DECIDED**
- 技术栈与架构：Next.js App Router + TS + Prisma + SQLite + pnpm + Tailwind 手写令牌、无组件库；模块化单体 + registry 动态导航。
- 报价明细 = CatalogItem 的**快照**，改模板不回溯历史报价。
- **R1 主题 = 客户自助切换**（方案 B）：`PlatformSetting` **只存插槽键名**（cobalt/rust/emerald/teal），不存自由色值——否则客户可自助调出对比度不达标的主题，拆掉 V0.3 的对比度零点纪律。品牌色不在四套内走"补一套插槽并入规范"，不在设置页开取色器。
- **R2-① 跨模块关联主键**：脊柱已存在（`Project.id` 程序内关联、`Project.code` 对外且唯一）。**只需写进契约，不占工期。**
- **R2-② 自定义字段 = 客户自助定义**，选 **EAV**（`CustomFieldDef` + `CustomFieldValue`），**作用对象仅 `Project` 与 `Client`**。排除 `QuoteItem` 的技术理由：报价保存走整表替换（`deleteMany`+`createMany`、id 每次重分配），挂明细行的字段值会在保存时**静默变孤儿**。客户若坚持要，前置里程碑是先改成按 id upsert。
- 里程碑顺序（**v1.2 路线 B 重排，取代旧 M1.5/M1.6 说法**）：M1b（禁改 schema，已完成）→ **M2-A 主脊 schema（已完成）→ M3 商务线索 → M4 项目中心 → M5 设计 → M6 工程排程 → M7 质量 → M8 财务基础 → M9 财务深化+驾驶舱+EAV**。共享主脊表集中在 M2-A 一次定稳，私有表随模块下沉。
- **全案四决策（2026-10-09 与用户确认，详见 `PLAN_FULL_SERVICE_V1.md` §1）**：① 视觉守 V0.3（v5.1 靛蓝/玻璃拟态作废，三色灯渲色点非 emoji）；② 垂直切片·主脊优先；③ 单用户 + 角色切换模拟视角（真 RBAC/登录 DEFERRED）；④ 本期不做通知/群机器人/公开表，状态机副作用照做、通知抽 `notify()` no-op。
- **M3 两处架构决定（已定）**：`createProject` 从 budget 模块上收 `core/domain`（crm 签约也要建项目，模块不互 import 内部）；签约按**手机号归并** Client，有意取代既有「按客户名 upsert」。
- **M2-A 角色偏差纠正**：codebuddy 曾把 `USER_ROLE` 编成通用公司角色（foreman/engineer/accountant…），集成者已改回 v5.1 §4.1 装修 11 角色（boss/ops/biz_mgr/designer/design_asst/floor_plan/construction/rendering/budget_mgr/pm/inspector + viewer 占位）；`USER_ROLE` 现无消费者，M3 建 `rbac.ts` 时接。
- 执行通道：默认 **`hy3`**（腾讯内置，标 x0.00 credits，192k 上下文 / 64k 输出）；sensenova 自定义通道降为备份。
- Logo 上传从 B3 拆出，归 M1.5 与 `PlatformSetting` 一起做（无表可存文件路径，硬做只能靠约定猜文件名）。
- 工作区约定：非交付物一律进 `_scratch/`（日志/截图/试验分子目录）、**禁止在仓库根新建 `.log` 或下划线目录**、决策类产物归 `docs/`、一次性脚手架禁止与项目平级建目录。

**EXPLORING**：自定义字段的类型集合（要不要"金额"这种带单位数字型）；字段是否所有模块共享可见（决定 `FieldDef` 要不要模块作用域）；字段级校验做到哪层（建议首期仅 `required`+`type`）。

**DEFERRED**：登录/RBAC、PostgreSQL、数据可视化色板、多品牌白标换肤、Logo 上传。
**REJECTED**：微前端、多独立系统拼门户、自研 Typora 平替。
**按用户指示暂缓**：P3 部署阿里云、P5 迁 PG（"先本地跑成功了再说"；本机现无 Docker、无本地 PG）。

## 4. 已知缺陷与待办

| # | 事项 | 状态 |
|---|---|---|
| 1 | **375px 页面横向溢出**（标题行「草稿」被顶出右缘） | **成因未定位**。已排除：`flex-wrap` 本就在、`main`/内容区/`section`/`Table` 的 `min-w-0` + `overflow-x-auto` 链条完整。**不打猜测性补丁**，需单开一次量 DOM 的排查 |
| 2 | **设计令牌收口** | 未做。实测越界：**字号 32 处**、**间距 11 个文件**（含 5 个 `core/ui` 组件）。根因＝Tailwind 默认刻度未关。**有效证据**：B1/B2/B3 卡里写死了"字号只用 12/13/15/17/20/28、间距只用 4/8/12/16/24/32/48"，这几轮新文件**零越界**；A2 没写，一轮漏进 13 处 → 约束必须固化进 AGENTS 契约 |
| 3 | **`prefers-reduced-motion` 全仓缺失**（V0.3 §5.1/§5.2/§6.9 硬要求，实测 `globals.css` 命中 0） | 未修，一处 CSS。顺带 hover 应为 120ms 而非 150ms |
| 4 | 看板页四张汇总卡均分且同权重 | 违反 §7.4「慎用 50/50、尺寸要成阶梯」，总价应明显重于其余三项 |
| 5 | ~~M1.5 schema 批次~~ → **M2-A 主脊 schema 已合入**；`PlatformSetting`（主题键名+Logo）与 EAV 自定义字段按路线 B **降级到 M9**（EAV 仅作用 Project+Client，服务看板筛选） | M2-A ✅；PlatformSetting/Logo/EAV 未开始 |
| 6 | AGENTS 契约未更新：R1/R2 落地条款、§9 工作区约定、两处规范冲突（AGENTS「无阴影」过度简化 vs V0.3 浮层 L1–L3；accent 族"4 值"说法与实际浅色 3 值不符） | 补丁文本已在 `docs/PROPOSAL_M1.5.md` §4 与 §9，**待应用** |
| 7 | 交互写回路径尚未经人手验证（科目库增删改排序、报价选入保存、项目设置保存、Ctrl+P 打印） | 服务已起 `http://127.0.0.1:3000`，待用户亲手点 |

## 5. 踩过的坑（每条都有代价，防返工）

- **`core/ui/Input.tsx` 基类硬写 `w-full`**：Tailwind 生成 width 工具类时 `full` 排在数字档之后，单实例传 `w-24` **被静默压掉**。表现是编号框撑到 410px、名称框反被挤窄。正解：外层容器定宽、Input 只填满容器。**别改 Input**，会波及全站。
- **`manifest.nav` 是全局静态清单，拿不到 `projectId`**：写 `/budget/[projectId]/xxx` 会按字面量渲染成死链（实测 404），且 `Nav` 的 `subActive` 精确匹配永不为真。**项目级入口只能放页面内部**带真实 id 的链接。
- **`Client` 是 1—N 共享主数据**：项目设置页改客户名会连带改掉该客户名下所有项目的显示，且 `createProject` 也按客户名 `upsert`。行为合理（一处改处处生效）但属意外副作用，已在表单加 `hint` 明示。
- **seed 日志按源数组常量算数**：M1a 的 `seed.ts` 只建了 `catalogCategory`、一条 `CatalogItem` 没写，日志却打印"模板 16 项"，漏项被自己的日志盖了一整天——报价明细是快照，详情页看不出模板库空，直到 M1b 建了第一个真读该表的页面才暴露。**报数一律取 DB `count` 并加自检断言。**
- **残留服务造成假绿**：`next start` 没被真杀掉时，占端口的旧进程会应答探活，于是"服务就绪 ✓"截的是旧构建（实测两次截图字节数完全一致）。`spawn("taskkill")` 异步 + 立刻 `process.exit()` 等于没杀，必须 `execFileSync` 阻塞杀进程树。
- **嵌套事务不共享连接（M3-d2 真 bug，集成门禁才抓得到）**：`signLead` 在 `prisma.$transaction` 内新建 Client，却调用 `createProject`——而后者又自开**独立** `$transaction`。SQLite 下内层事务看不见外层未提交的行 → 签约报「指定的客户不存在」。**正解：`createProject(input, tx?)` 接受外部事务客户端，`signLead` 把自己的 `tx` 传进去，全程一个事务**。教训：跨函数复用事务必须显式传 `tx`，别在事务里再调另一个开事务的服务；build/纯函数断言都拦不住，只有端到端集成能抓。
- **免费编码通道有两种死法**：429 是 TPM 速率限制（非当日额度，冷却可续）、502 ECONNRESET 是传输层瞬断且**零写盘**。对策都是**一轮只给一个界面单元** + 失败原卡重跑。
- **新建 git worktree 后 `pnpm install` 不会自动 `prisma generate`**：直接跑 seed 报 `@prisma/client did not initialize yet`。准备序列是 `install → prisma generate → migrate deploy → db seed`。
- **linked worktree 不能放进主仓工作树内部**（git 视其为未跟踪目录，且与 `src/**` 构建 glob 冲突），必须同级；并行轨失效后及时 `git worktree remove` + 删目录，只留分支承载历史。

## 6. 并行执行规约（当前生效）

- 主仓 `renovation-platform`（master）＝ 集成者地盘：门禁、截图、合并、契约。
- `renovation-b1`（分支 `feat/m1b-b1`）＝ M1b 三件轨道的工作树，**已全部并入 master 并于 10-09 17:16 清理删除**，分支保留作历史。下一轮需要并行时按 §5 的准备序列重建。
- 一次一轨串行；只有**纯新增文件**的轨道才值得并行（B1 即此前提，合并零冲突）。
- 任务卡必须写全：必读清单（控上下文体积）、文件所有权与禁区、唯一绿门 `pnpm build`、**禁止 `pnpm dev`**、禁止自行 `git commit`、**刻度约束**（写了就真能防住，见 §4 第 2 条）、完成度闸门（宁交完整的 P1，不许留编译不过的半成品）。
- 卡内禁区与交付要求**不能自相矛盾**：B3 卡既写"别碰 QuoteBoard"又要求"入口放页面内"，而入口只能加在 QuoteBoard——是模型的判断纠正了我的卡。

## 7. 参考与产物位置

- 契约：`AGENTS.md`（v0.1；**R1/R2 与 §9 目录约定尚未写入**，补丁文本见 `docs/PROPOSAL_M1.5.md`）。
- 设计真源：`E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md`（一行指针，不在本仓复制）。
- 决策与审计：`docs/PROPOSAL_M1.5.md`、`docs/REQUIREMENTS.md`、`docs/DESIGN_AUDIT_M1A.md`、`docs/BUILD_SPEC_M1.md`。
- 全案计划真源：`docs/PLAN_FULL_SERVICE_V1.md`（v1.2，路线 B；整合 `Full-Service Project Management/` 三份妙搭资料）。
- 任务卡：`docs/TASK_M1A.md`、`TASK_M1B_A.md`、`_A2`、`_A3`、`_A4_FIX`、`_B1`、`_B1_FIX`、`_B2`、`_B3`、**`TASK_M2A.md`（已执行）、`TASK_M3_CRM.md`（待 M2-A 后执行）**。
- 配色决策产物：`docs/preview/theme-picker.html`（四套 accent × 同一张报价单，含无障碍实测与撞色风险）。
- 本地产物（不入库）：`_scratch/logs/`、`_scratch/qa/`（截图与 PDF）、`_scratch/backup/`（dev.db 备份）。
- 废弃分支（仅存档，勿参考勿 checkout）：`wip/m1b-a`、`feat/presentation`、`pre-m1b-checkpoint`。
