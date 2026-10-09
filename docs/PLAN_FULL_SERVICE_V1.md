# 装修全案经营管理平台 — 可执行方案 v1.2

> 更新：**2026-10-09** · 维护：QwenWork（集成者）
> 本文档 = **计划层真源**（做什么、按什么顺序、每步完成条件）。与另两份正交：
> `AGENTS.md`=规范层｜`STATUS.md`=状态层。
> 来源整合：`Full-Service Project Management/` 三份资料 + 本仓已建成预算模块。
> **v1.2**：用户定路线 **B（执行链优先）**——设计/工程/质量上位治工期·质量，财务基础退 M8。§1.1-K 转 DECIDED，§5 重排。承 v1.1（外部评审 ChatGPT 8.5/10 处理）。
> 面向执行者：动手前先读 `AGENTS.md` + 本文件 + `STATUS.md`。

---

## 0. 一句话结论

把资料里为「飞书妙搭无代码 + 多维表格」设计的全案系统**翻译成真实 Next.js 应用**，沿已验证的「薄路由 + 模块逻辑 + Prisma 真库 + V0.3 视觉」模式：**先修通"客户线索 → 项目 → 签约"主脊，随即投入执行链（设计→工程→质量）治工期与质量失控**，财务与绩效随后。本期单用户免登录、站内视角、不做通知自动化。10 模块 / 11 角色 / 移动端 / 绩效算法保留为路线终点，**但一次只做一块**。

---

## 1. 关键决策（与用户确认）

| # | 决策 | 内容 | 状态 |
|---|---|---|---|
| A | 视觉语言 | 全站守 **HAE V0.3**。v5.1 §3 靛蓝+玻璃拟态+阴影**只取业务不取皮**。三色灯渲染成 **V0.3 色点，非 emoji**（v5.1 的 🔴🟡🟢 作废）。 | DECIDED |
| B | 推进方式 | **垂直切片·主脊优先**，广度铺薄壳作废。 | DECIDED |
| C | 登录与权限 | **单用户 + 角色切换模拟视角**；真登录/RBAC DEFERRED；模型预留 user/role。 | DECIDED |
| D | 通知与客户确认 | **本期不做**通知/群机器人/公开表；状态机副作用照做，通知抽 `notify()` no-op。 | DECIDED |
| E | 里程碑重排 | 原 M1.5（预算专属打磨）重定向为全案主脊；预算主题自助/Logo 降级独立小项。 | DECIDED |

### 1.1 v1.1 评审增补决策（v1.2 更新 K）

| # | 决策 | 内容 | 状态 |
|---|---|---|---|
| F | M2 彻底拆分 | M2-A 只建**全模块共享主脊表**（Project/User/Lead/FollowUp）；模板/SOP、EAV、变更单、预算多版本**下沉各自消费模块**。共享表早定、私有表随模块。 | DECIDED |
| G | 客户身份归并 | 签约时 `Lead → Client` 按**手机号归并**（无则新建），Client 仍 1—N；化解既有 upsert-by-name 冲突。FK 走 `Lead.projectId`（单向），不加 `Project.leadId`。 | DECIDED |
| H | Project 补字段 | 加 `source`（渠道，供驾驶舱归因）+ **status 纯新增 `design`/`acceptance` 两态**（现有 draft/in_progress/completed/archived 已对应筹备/施工/竣工/归档，**零行迁移**）。 | DECIDED |
| I | EAV 降级 | 自定义字段推迟 M9、作用域仅 Project+Client，只服务"看板按自定义字段筛选"。机制仍 EAV（承 R2-②，非 JSON 列）。 | DECIDED |
| J | 财务锚点前置 | `contractAmount`/`actualEndDate` 等在 M2-A 落 `Project`（共享主数据），避免日后反复改主脊。**不建空表**（红线：无源不建死表）。 | DECIDED |
| K | **财务纵切排期** | 用户定 **路线 B**：执行链（设计/工程/质量）先做、**财务基础退 M8**。理由：v5.1 §1 痛点工期·质量在前。 | **DECIDED（B）** |

---

## 2. 范式转换：资料（妙搭）→ 真实应用

### 2.1 因换平台而消失的限制（v5.1 / v2.0 §6、§8 整表基本作废）

| 妙搭限制 | 真实应用解法 |
|---|---|
| 行级过滤逐组件手配 | server 层 `where` 按"当前视角角色=自己"集中过滤 |
| 公式列性能随量下降 | 派生值（进度/灯/毛利）后端纯函数算，必要时缓存列 |
| 无雷达图/圆环进度 | React + 原生 SVG（v5.1 §3.5 图表规范适用） |
| 公开视图不支持附件 | 后期真对象存储 + 鉴权；影像字段先建位、上传 DEFERRED |
| 外部客户无法登录 | 平台自带客户视图路由（需部署+免登录令牌） |
| 无自动打印 | **已解决**：预算 A4 真 PDF 已上线（M1b-B1） |

### 2.2 新增的自由度

报价快照纪律（改模板不回溯）· 单一口径+断言门禁（`verify-quote.mjs` 17 项）· 可移植 schema（一步迁 PG）。全案每处"算钱算分算灯"都照此立整数/枚举预言机。

---

## 3. 数据架构映射（妙搭 16 表 → Prisma，按 core + 模块分层）

> 落位规矩（AGENTS §2/§4）：跨模块主数据归 `core/domain`，模块私有表归 `modules/<id>`，经 `projectId` 引用核心域，**不得重定义 Project/Client/User/Org**。

### 3.1 共享核心域 `core/domain`

| 模型 | 现状 | 全案要补 | 落在 |
|---|---|---|---|
| `Organization` | ✅ 占位行 | 不动 | — |
| `User` | ⚠️ role 仅 4 值 | `department`(4 线) + role→**11 常量**（types.ts）。**不接认证**。 | M2-A |
| `Client` | ✅ | 归并按 phone；EAV 挂此（M9） | M2-A / M9 |
| `Project`（主脊） | ⚠️ 字段薄 | `contractAmount`·`houseType`·`style`·`source`·`inspector`·`budgetAnalyst`·`actualEndDate`；status +`design`/`acceptance`。进度/三色灯**不落库**走 `health.ts`。 | M2-A |

### 3.2–3.6 各模块私有表（随其里程碑建）

| 模块 · 里程碑 | 表 | 关键 |
|---|---|---|
| **crm · M3** | `Lead` / `FollowUp`(1-N) | stage·source·intentLevel·`projectId @unique`（签约回写）；跟进时间线 |
| **design · M5** | `DesignTask` / `TaskSubmission` | type·assignedTo·deadline·status；版本化含退回原因→返修率 |
| **schedule · M6** | `ScheduleTask` / `ProcessTemplate` | 自引用依赖中间表·categoryId 关联科目·按面积档工期 |
| **quality · M7** | `AcceptanceNode` / `CheckItem` / `Issue` | 检查项来源 SOP·severity·状态机；影像 DEFERRED |
| **finance · M8** | `FinanceRecord` / `PaymentNode` | 手工收支·5 段付款·关联 AcceptanceNode 解锁 |
| **budget · M9** | `ChangeOrder` / 报价多版本 | **挂 quote 级禁挂 QuoteItem**；lockedAt 已在 M2-A |
| **hr · M9 后** | `Performance` | 综合+4 维；`User.role` 即《员工角色》不单建 |

### 3.7 砍掉 / 降级

- 妙搭《客户展示》同步表 → **不建**（按 projectId 直查主数据）。
- `PlatformSetting`（主题+Logo）/ `CheckIn`/`SitePhoto`/`FileAsset`（附件）→ DEFERRED。

---

## 4. 角色体系（11 角色 · 本期模拟视角）

「角色切换」下拉模拟登录，落位建议 URL `?as=pm` 或内存态，**不新增 DB 表**。权限矩阵照搬 v5.1 §4.3 → `core/domain/rbac.ts` 纯函数 `can(role, action)`（随 M3 视角过滤落地时建）。本期"视角过滤"非安全边界，真鉴权待 P4。

```
management: boss · ops
business:   biz_mgr
design:     designer · design_asst · floor_plan · construction · rendering · budget_mgr
engineering: pm · inspector
```

---

## 5. 里程碑序列（路线 B · 一次只推一块）

> 共享主脊表集中在 M2-A 一次定稳，之后模块只"读已建表 + 建自己的私有表"。

### M2-A · 主脊 schema（唯一早期动表批次，无 UI 除设置页选项）
- **做什么**：升级 `Project`（§3.1，纯新增可空列 + status 两态）；`User.department`+`USER_ROLE` 11 常量；新建 `Lead`/`FollowUp`；`BudgetQuote.lockedAt`；派生 `core/domain/health.ts`（进度/三色灯纯函数，无数据时优雅降级，**返回语义 token 非 emoji**）。
- **不做什么**：模板/SOP/EAV/变更单/预算多版本/财务表/任何通知/认证/UI 页面。
- **完成条件**：迁移可从干净库重跑 + 旧预算数据零破（无行迁移）+ `verify-quote` 17 绿 + 新 `verify-health` 断言绿 + build 绿 + §11 全项。
- 详见 `docs/TASK_M2A.md`。

### M3 · 商务线索闭环（`crm`）
- 线索看板（5 阶段）/详情抽屉（跟进时间线+添加）/签约表单→`createProject`(筹备中)+回写 `Lead.projectId`；商务看板（SVG 漏斗+超 3 天待跟进）。
- 归并规则（§1.1-G）按手机号。建 `rbac.ts` 支撑视角过滤。
- 完成：录线索→跟进→报价→签约→进项目列表 一条龙手测；三档截图无溢出。

### M4 · 项目中心 + 六合一详情（`projects` 聚合）
- 列表双视图 + 角色视角过滤；详情 6 Tab **只读聚合**（基础含三色灯；设计/工期/质量/预算/人员各读 server 汇总，未建模块走空状态）。
- 完成：有预算数据的 Tab 正确；未建 Tab 空状态优雅；`code` 唯一性沿用 B3。

### M5 · 设计任务（`design`）【执行链起】
- 任务看板双视角 / 审核通过·退回（原因必填→状态机→返修率）/ 提交版本历史 / 设计日历。
- **纠正**：报价编制留 budget 模块，设计管理只放任务看板+跳预算链接。
- 完成：分配→提交→退回→再提交→通过 闭环；版本历史完整。

### M6 · 工程排程（`schedule`）
- 甘特（原生 SVG 双轨、状态配色、悬停详情、点工序跳验收）；建 `ProcessTemplate` 按面积档一键生成；拖拽调期；预警看板；100%+完成→建 `AcceptanceNode`（状态机，无通知）。
- 完成：模板→排程→进度→触发验收节点 数据链贯通；依赖拓扑无环。

### M7 · 质量管控（`quality`）
- 建 `CheckItem`（SOP 灌 seed）；验收节点列表+详情（影像占位/审核通过·退回）；退回→自动建 `Issue`；问题台账（严重度/状态筛选，整改→复验→关闭）；质量档案（时间轴+打印）。**验收通过→置 `PaymentNode` 待付（M8 建表后回环）**。
- 完成：提交→退回→整改→重提→通过 状态机全绿 + 断言。

### M8 · 财务基础（`finance`）
- 手工收支台账 `FinanceRecord`（收/支双 Tab）+ 毛利粗算（读 M2-A 合同额）+ 付款计划 `PaymentNode`（5 段，接 M7 验收解锁）。单一口径：毛利/收款进度纯函数+断言。
- 完成：录支出→毛利即时正确变化；M7 验收通过→对应付款节点解锁 联动断言。

### M9 · 财务深化 + 驾驶舱 + 自定义字段
- `ChangeOrder` 变更管理（挂 quote 级；累计超合同额 5%→预算灯；需按明细挂则前置＝报价保存改按 id upsert）；报价多版本；EAV `CustomFieldDef`/`Value`（§1.1-I）；驾驶舱 4 KPI/健康矩阵/待办中心/绩效排行（数据未全则灰/空）。
- 完成：驾驶舱指标真实聚合、可点跳模块；**禁用 mock 兜底数字**。

### 后续（DEFERRED，仅留位）
绩效算法（M9 后）· 利润分析 · 移动端客户中心/巡检打卡 · 真登录/RBAC · 通知自动化 · 部署阿里云 · 迁 PG · 满意度问卷回流 · PlatformSetting 主题/Logo · 多品牌白标。

---

## 6. 复用已建成的（别重造）

`Client→Project→BudgetQuote` 链（挂载模板）· registry+`ModuleManifest`（加模块=新目录+manifest+registry 一行）· `lib/quote.ts` 单口径（算钱范式母版）· A4 打印/截图/断言门禁 · V0.3 令牌+`core/ui`。

**registry 目标模块**（导航顺序）：`dashboard · crm · projects · design · schedule · quality · budget(已建) · finance · hr`。DEFERRED 占位 `pm`/`design` 随上线转实。

---

## 7. 关键坑与风险（动手前必读）

1. **动 `Project` = 动预算依赖**（中，v1.2 降级）：status 改为**纯新增两态、零行迁移**；`health.ts` 无 schedule/quality/finance 数据前**优雅降级**（返回 neutral/green，别造数）。穷举 `Record<ProjectStatus,…>` 编译期逼补 label/badge 两处；**唯 `ProjectSettingsForm.STATUS_OPTIONS` 是普通数组、TS 抓不到、必须手改**（M2-A 任务卡点名）。
2. **变更/自定义字段不能挂 `QuoteItem`**（高，已验证）：报价保存 `deleteMany`+`createMany`、id 重分配，挂明细的值静默变孤儿。挂 quote 级；按明细需先改 upsert。
3. **单一计算口径**（中）：进度/三色灯/毛利/绩效分只出现在 `health.ts`/`quote.ts`，各立预言机断言，禁页面各写。
4. **三色灯非 emoji**（中）：v5.1 用 🔴🟡🟢，V0.3 禁 emoji → health 返回 `green|yellow|red` token，UI 渲成 V0.3 色点。
5. **`manifest.nav` 拿不到 projectId**（中，已验证）：项目级入口放页面内带 id 链接。
6. **派生值不落库**（中）；**通知=延后但 `notify()` no-op 留钩子**（低）；**客户二维码需部署+令牌，M4 显示占位**（低）。
7. **验收纪律**（承 STATUS）：build 绿+断言≠页面对，三脚本每里程碑跑，真缺陷历史上全靠目检。
8. **免费通道 429/502**（承 STATUS）：一轮只给一个界面单元，失败原卡重跑。

---

## 8. 绩效考核算法（终点，排数据链跑通后）

v5.1 §9 六套角色公式完整保留 → `modules/hr/server/perf.ts` 纯函数、每因子可测。客户满意度因子本期无源→暂 0 权重重归一或老板手录。等级 S/A/B/C/D 照搬 §9.4。不提前做绩效 UI。

---

## 9. SOP / 检查项来源

`装饰施工管理系统.html`（89 项）→ 只取数据灌 `CheckItem`/`ProcessTemplate` seed（M6/M7），不照抄 UI。`装修预算.html`（在 `docs/reference/`）→ 零件库 11 科目灌 `CatalogItem`（当前 4，可补齐）。铁律：禁照抄数据/UI/文案；DB 驱动、非 localStorage。

---

## 10. 下一步

1. 用户已定路线 B → **M2-A 任务卡已出**（`docs/TASK_M2A.md`），评审后交 codebuddy（`hy3`）串行执行，我守 build+断言+截图门禁。
2. M2-A→M3→M4 主脊跑通后，进执行链 M5（设计任务）。

---

## 11. 每里程碑验收标准总表（交付前逐项打勾）

**通用模板**
- 数据正确性：涉算→整数/枚举预言机；聚合→DB `count` 取数（不抄常量）；外键→删改不破链。
- 页面体验：1440/1280/375 三档无横向溢出；V0.3 令牌收口；空/加载/错误态齐；`prefers-reduced-motion`。
- 回归范围：列本 M 触碰的既有路由/表；跑 `build` + 全部既有门禁 + 上一里程碑手测主链。
- 不破坏旧模块：核心域列只加不改语义；旧 seed/迁移可重跑；受影响既有页重新目检。

| 里程碑 | 关键回归对象 | 本 M 新增断言/门禁 |
|---|---|---|
| M2-A | 预算全路由 + `verify-quote` 17；B3 设置页 status | status 两新态后旧四态报价仍算；`verify-health` 灯/进度边界；穷举 map 编译过 |
| M3 | 预算（签约后入列表） | 手机号归并幂等；lead→signed→project 外键闭合；STATUS_OPTIONS 含 6 态 |
| M4 | 预算详情/设置 | 六 Tab 空状态无报错；三色灯=health 单函数、非 emoji |
| M5 | M4 | 退回版本历史保留；返修率计数正确 |
| M6 | M5 | 模板生成排程数量正确；依赖拓扑无环；100%→建验收节点 |
| M7 | M6 | 提交→退回→重提→通过 状态机；通过→置付款待付（M8 建表前占位） |
| M8 | 预算快照 | 毛利/收款进度整数预言机；支出增删即时重算；M7 解锁联动 |
| M9 | 全部 | 驾驶舱指标与明细逐项核对一致；无 mock 兜底 |

---

## 12. 外部评审处理记录（ChatGPT 8.5/10 → 逐条对照红线）

| 评审点 | 结论 | 落地 | 理由 |
|---|---|---|---|
| ① M2 拆 A/B | 采纳（更彻底） | §1.1-F：M2-A 只共享表，私有表随模块 | 降 blast radius + 合"不提前实现" |
| ② 客户生命周期归并 | 采纳 | §1.1-G + M3 | 戳中既有 upsert-by-name 地雷 |
| ③ Project 加 status/source | 采纳（降级为纯新增） | §1.1-H + M2-A | status 实为新增两态、零迁移，风险大降 |
| ④ EAV 谨慎 | 采纳 | §1.1-I：M9、收窄作用域 | 与上版一致；机制仍 EAV |
| ⑤ Finance 提前 | **拒绝"提前"、采纳"锚点前置"** | §1.1-J + 用户选路线 B（K） | 不建空模型（红线）；执行链先做、财务退 M8 |
| ⑥ 绩效最后 | 采纳 | §8 | 数据链未通做绩效必假数 |
| ⑦ 验收标准总表 | 采纳 | §11 | 固化"断言≠正确、靠目检"教训 |
| 最大风险 M2 过重+边界失控 | 认同 | §1.1-F 收窄 + §11 | — |

> 不采纳项留痕：⑤"M4/M5 建空 FinanceRecord 模型"——违背红线三"不提前实现"，死表无门禁会腐烂；其目标（少改 Project）改由 M2-A 落 contractAmount 达成。⑤"财务提前到 M5"——用户依 v5.1 痛点顺序选路线 B，财务退 M8。
