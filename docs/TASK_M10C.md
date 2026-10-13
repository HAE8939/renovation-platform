# TASK_M10-c · 归档口径收口批（钱按事实 · 事按可见性）

> 2026-10-13 晚 · 状态：**改动落工作区，未 commit**（同日 M10-a/M10-b 正在被另一会话实时改写，commit 归集成者统一处理）
> 执行通道 = 集成者自己写 · 与 M10-a/M10-b **零文件交集**（见 §5 冲突面）
> 口径由 HAE 2026-10-13 在两个分叉上拍板：**「钱按事实 · 事按可见性」** + **归档「允许但提示」**

## 0. 这批为什么存在

M10-a 给平台加了归档/作废，并在 `AGENTS` §4.3 写下「全司读侧早已排除 `status="archived"`」。
实测**这句话只对了一半**：排除动作散在各处，有的做了、有的没做，于是同一时刻两页能给出两个数。

| 位置 | 改前的真实行为 | 造成的后果 |
|---|---|---|
| `finance/server/records.ts` 全司汇总 | 只有项目下拉排归档，**收支 / 合同额 / 变更 / 未付段全含归档项目** | `/finance` 已收含归档，驾驶舱现金线不含 → 归档一次，两页当场对不上账 |
| `quality/server/issues.ts` 问题列表 | 本体无 `project.status` 条件 | 归档项目的「未整改问题」在台账里数得到、驾驶舱待办里数不到 |
| `design/server/tasks.ts` 任务池 / 页头计数 / 日历 | 三处全无归档条件 | 设计看板含归档项目任务，驾驶舱「设计待审」不含 |

纯函数门禁（`verify-finance` 135 等）看不到跨表 `where`，`build`/`tsc` 更不会——**这类"口径只做一半"是门禁的盲区，只有真跑一遍数据才暴露**。

## 1. 落地口径（两条，HAE 拍板）

**① 钱按事实**：**已发生的**（已收、支出、合同额、变更、毛利、毛利率）**不因归档而消失**。
归档只是可见性开关，不是删除；八月实收的五万，不会因为十一月点了归档而在报表里凭空少一笔——那会让已经交付出去的对账数字变得不可信。

**② 事按可见性**：**还没做的**（待收款、计划未付付款段、未整改问题、待审设计任务、待办计数）随归档消失。
归档＝这个项目的经营事项已收场，不再挂账催收、不再出现在待办视野。

两条合起来才是一句话：**归档改变的是"还要做什么"，不是"发生过什么"**。
正因为两族口径不同，页面**必须把差异说出来**——沉默地少一个数字，比数字变小更糟。故 `/finance` 汇总条下新增说明行、`?projectId=` 深链到归档项目时问题台账给出解释。

## 2. 改了什么（6 个文件，全部只碰读侧）

- `finance/server/records.ts` — 汇总原料查询带上 `status`/`projectId`，按归档分区：事实类喂全量、前瞻类喂非归档子集（**算式仍只有 `ledger.ts` 一处**，只是换了输入集合，不另立第二套公式）；结果新增 `archivedFacts`（归档项目数与其历史已收/支出）与 `filteredArchived`。
- `app/finance/page.tsx` — 待收款/计划未付两格的 hint 补「不含已归档」；有归档参与时汇总条下出一行口径说明，无归档时一个字都不加。
- `quality/server/issues.ts` — 列表本体加 `project: { status: { not: "archived" } }`；深链命中归档项目时带回 `archivedProjectName`。
- `app/quality/issues/page.tsx` — 据上字段出诚实说明卡（「记录并未删除，恢复归档即回来」）。
- `design/server/tasks.ts` — 任务池、页头计数、日历色片、未排期计数四处同口径排归档。**`design/page.tsx` 未动**（该文件正被另一会话改写），它只是消费服务，自动跟着收窄。

**顺带修一处独立小 bug**：建筑面积三处输入框写的是 `step="0.1"`（`budget/CreateProjectForm.tsx`、`budget/[projectId]/ProjectSettingsForm.tsx`、`crm/NewLeadForm.tsx`），全站无 `noValidate`，而面积与单方造价按**两位小数**记账 → 填 `89.55` 会被浏览器以 step mismatch **静默拦下、表单根本不提交**。属 STATUS §5「拒绝发生在浏览器而不是服务端」那条的同族。改 `step="0.01"` 并在三处各留一句注释防被"收拾"回去。

## 3. 验收记录

`npx tsc --noEmit` 0 错 · **十道纯函数门禁全过零回退**（quote 89 / crm 19 / health 20 / design 28 / schedule 55 / quality 108 / finance 135 / dashboard 86 / fields 89 / theme 31）· **`verify-finance-flow` 76/76** · **`verify-quality-flow` 94/94**（两道都跑在**本批专用的库副本** `_scratch/m10c-*.db` 上，避免与另一会话同时在跑的 `_scratch/finance-flow.db` 互踩）。

**新建归档口径实值检查 `_scratch/m10c_archive_check.mts` · 40 项全过**（隔离库 `_scratch/m10c-archive.db` 真跑生产服务，归档→复算→恢复四段）：

- **A 基线 12 项**：库里无归档时，各格与独立复算逐字相同 → 本批改动对现有数据**零行为差异**（这也是 76 条 flow 断言不必改写的根据）。
- **B 事实 6 项**：归档后已收/支出/合同额/毛利/毛利率**一格未动**（实测 136,600 → 136,600）。
- **C 前瞻 17 项**：待收款 613,400 → **506,000**、计划未付 → 112,000，均精确等于未归档项目之和；台账/任务池/日历/页头计数同口径收窄；深链归档项目带回项目名且行数为 0；单看归档项目时历史收支读得到而待收归 0。
- **D 可逆 6 项**：恢复归档后前瞻数分毫回来，且全程 `financeRecord` 行数不变（**证明归档真的只翻一个位，没动钱**）。

归档对象由脚本**按实库真值动态选**（有钱的 / 有问题的 / 有设计任务的项目各挑一个），不写死 code——承 §4-20「锚点漂移」那条教训。

## 4. 未做四件（都不是遗漏，是有意留给下一手）

1. ~~**驾驶舱现金折线与本月签单额仍排除归档项目**~~ **[已收口 · M10-b/c 合流]** —— 这是本口径**没合上的另一半**：按「钱按事实」，`dashboard/server/overview.ts` 主查询把归档项目整体剔除，连带把它的**历史钱**也剔了，故归档会让历史月份的收款线凭空掉一截。落点文件正被 M10-a/M10-b 实时改写（`overview.ts` 已 +106 行、`dashboard/page.tsx` 本批期间又变了 431 行），**不在那里抢改**。驾驶舱改版落地时应按本条口径一并修，并同步 `_scratch/accept/dash-data.mjs` 那份预言机（它现在也整体排除）。
2. ~~**归档「允许但提示」的确认框**~~ **[已收口]** —— HAE 已拍板：归档一个还有未整改问题 / 未收付款段的项目时，确认框里如实列出这些未闭环事项，知情后才归档、数据一律保留。落点 `projects/ArchiveButton.tsx`、`projects/page.tsx`、`core/domain/projects.ts` 全在另一会话手上（`LeadArchiveButton.tsx` 同为新建未跟踪文件），**本批一行未碰**。要做的是给归档入口配一个「未闭环事项」读数（问题 open 数 + 未付段数 + 金额），守卫仍在服务层。
3. ~~**`AGENTS` §4.3 补「事实/前瞻」二分 + `STATUS` 行**~~ **[已入册 · 契约 v0.4]** —— 两个文件都在被改写，改完由集成者一并入册；本文即入册素材（口径见 §1，逐字可搬）。
4. **`pnpm build` 与 `qa-shots` 目检** —— 两套构建抢同一个 `.next` 会互相打坏，且此刻工作树里有另一会话的半成品页面。留给驾驶舱那一路收口时统一跑；本批 UI 只加了两处文案块，复用既有 `rounded-card border-line bg-surface px-4 py-3` + `text-[13px] leading-relaxed text-secondary` 形态，未引入新令牌值。

另有两件小的顺带记下：`fields/actions.ts` 的 `createFieldAction` / `updateFieldAction` 全站零引用（`FieldsAdmin` 只用 `saveFieldAction`），属可删死码，但该文件在别人手上；`design/page.tsx` 的空态文案将来可补一句「不含已归档项目」。

## 4.5 收口记录（集成者，同日 M10-b 之后统一落）

留的三件已全部合上，本批与 M10-b 的改动现已在同一棵树上互相验证：

- **驾驶舱另一半**：`dashboard/server/overview.ts` 主查询改为**含已归档**，派生出 `liveRows` 只喂前瞻类（风险计数、健康度表、告警行）；`archivedFacts`（归档项目数 + 历史已收/支出）随概览返回，`dashboard/page.tsx` 页头据此出说明行，无归档时一个字不加。`_scratch/accept/dash-data.mjs` 那份预言机同步成同一二分口径。
- **归档提示**：`listProjectsForManagement` 加两条 groupBy 带出 `unclosed`（未整改问题数 / 未收段数 / 未收金额，不做 N+1），`ArchiveButton` 的确认框如实列出。
- **入册**：`AGENTS` §4.3 改写为事实/前瞻二分（契约 v0.4），`STATUS` 同步。
- 新增验收套件 **`s12-archive-facts`**：动态挑一个有历史收入的项目 → 读基线 → UI 点归档（含确认框文案断言）→ 验「签单额/回款率/现金合计一格未动、健康表少一行、待办按未闭环数收窄、说明行带出历史已收」→ 验 `/finance` 已收含归档而待收款不含 → 恢复 → 验一切分毫回来且 `financeRecord` 行数全程不变、流水 `before` 是机器值。

## 5. 冲突面自证（与同日的 M10-a / M10-b 零交集）

本批只改：`finance/server/records.ts`、`app/finance/page.tsx`、`quality/server/issues.ts`、`app/quality/issues/page.tsx`、`design/server/tasks.ts`、三个面积输入框。
M10-a/b 在改：`layout` `Nav` `Topbar` `page.tsx` `HeroSplash` `tokens.css` `globals.css` `settings/*` `crm/*` `projects/*` `dashboard/*` `schema.prisma` `AGENTS.md` `STATUS.md` `operationLog` `telemetry`——**两边无一重合**。
`prisma/schema.prisma`、`seed.ts`、`core/domain` 既有口径本批**零改动** → 按 `STATUS` §8 规则 `sign` / `schedule-gen` 两道集成门禁免重跑（本批只读侧加分区条件，不产生任何写入路径变化）。

## 6. 复跑配方

```bash
# 归档口径实值检查（本批新建，隔离库）
DATABASE_URL="file:../_scratch/m10c-archive.db" npx prisma migrate reset --force --skip-generate
DATABASE_URL="file:../_scratch/m10c-archive.db" npx tsx --tsconfig tsconfig.json _scratch/m10c_archive_check.mts

# 受本批影响的两道集成门禁（用本批专用副本，别共用 _scratch/finance-flow.db）
DATABASE_URL="file:../_scratch/m10c-finance-flow.db" npx prisma migrate reset --force --skip-generate
DATABASE_URL="file:../_scratch/m10c-finance-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-finance-flow.mts
DATABASE_URL="file:../_scratch/m10c-quality-flow.db" npx prisma migrate reset --force --skip-generate
DATABASE_URL="file:../_scratch/m10c-quality-flow.db" npx tsx --tsconfig tsconfig.json scripts/verify-quality-flow.mts
```
