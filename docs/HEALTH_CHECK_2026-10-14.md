# 平台系统性体检报告 · 2026-10-14

> 体检对象：`renovation-platform` @ `ad8809c`（含 codex 近期四提交 `f90ea94`/`df512c9`/`21db1cc`/`ad8809c`）
> 体检方式：实测门禁 + 静态核对 + 契约双向比对。性质＝**只诊断，未改任何代码**。
> 基准：`AGENTS.md` 契约 v0.4（2026-10-13）。
> 标注：✅＝本机实测证实 · 🔍＝读码核实（证据位置可复核）· ⚠️＝推断，尚待验证

## 1. 结论

**骨架是健康的，两处不该现在就上生产。** 类型系统零错误、665 条纯函数断言全绿、22 个路由页面全部静态生成成功、13 条迁移无漂移、核心域未被污染、模块边界守得住。问题集中在**一个数据口径的静默断裂**与**一个访问控制的完全缺位**，两者都直指"交给内部员工真实使用"这个既定目标。

- 把握度高：**变更单金额口径**那条（第 3 节）是实测跑出来的，不是读码猜的——门禁红了，根因追到了迁移 SQL 第 59 行。
- 把握度中：**部署阻塞**那条依赖"真实库是否已有变更单"，本机库因经 seed 重建过恰好不受影响，所以它是**升级路径上的地雷**而非已爆的事故。

## 2. 实测门禁结果（本轮全跑）

| 检查 | 结果 | 证据 |
|---|---|---|
| `prisma validate` | ✅ 通过 | schema valid |
| `tsc --noEmit` | ✅ 0 错误 | 无输出 |
| `next lint` | ✅ 通过，3 条 `<img>` 警告 | `PlatformShell:33`、`EvidencePanel:64`、`SettingsPanels:217` |
| 纯函数门禁 ×11 | ✅ 全 PASS，共 **665 项** | quote 89 / crm 19 / health 20 / design 28 / schedule 55 / quality 108 / finance 135 / dashboard 86 / fields 89 / theme 31 / hr 5 |
| 隔离库集成门禁 ×5 | ❌ **223 项中 2 条 FAIL** | `verify-finance-flow` 变更联动断言；sign 12 / quality-flow 94 / schedule-gen 27 / evidence-flow 14 全绿 |
| `next build` | ⚠️ **编译与 22 页生成成功，末段 standalone 复制 EPERM 失败** | `_scratch/logs/build-healthcheck.log:6,24,96` |
| 迁移健康 | ✅ 13 条单调递增、无空迁移、`migrate status` = up to date | 3 处 `DROP TABLE` 均为 SQLite RedefineTables 模式，数据随行复制 |
| `dev.db` 完整性 | ✅ 跑完全部集成门禁后 md5 未变 | 隔离库均在 `_scratch/` 下 |

## 3. 阻塞级问题（2 条）

### B-1 · 存量变更单的金额会在升级时静默消失 🔍✅

**事实链**（每一环都可复核）：

1. `21db1cc` 给 `ChangeOrder` 引入四段状态机 `status: draft|pending|client_confirmed|rejected`，默认 `draft`（`prisma/schema.prisma:583`），并把读侧口径改为**只计已确认**：`projectDetail.ts:358` 与 `finance/server/records.ts:147` 均加 `status: "client_confirmed"`。
2. 对应迁移 `20261014074812_m13_internal_closure/migration.sql:59` 的 SQLite 重建语句，`INSERT INTO new_change_orders (…) SELECT amount, createdAt, createdBy, date, id, kind, note, quoteId, title, updatedAt`——**列表里没有 `status`**。存量行因此全部取 `DEFAULT 'draft'`。
3. 后果：任何"已有变更单数据、执行 `migrate deploy` 升级"的库，其历史变更金额会从累计变更、毛利、毛利率、应收分母（`paidDenom = contractAmount + changeTotalVal`）、变更预警里**同时消失**，且界面不给任何提示。

这正面违反契约 §4.3「钱按事实」——该条款的立论原话就是"发生过的事不因归档消失，否则已经交付出去的对账数字变得不可信"。这里是比归档更糟的情形：数据没丢，但**算没了**。

**当前实害**：本机 `dev.db` 两条变更单（RP-2026-001 +3200、RP-2026-002 +2800）状态均为 `client_confirmed` ✅，因为该库经 seed 重建。**所以本机没爆，不等于升级不爆**——`compose.internal.yml` 的 `renovation_db` 卷若挂已有数据，即触发。

**症状已在**：`verify-finance-flow` 的 2 条 FAIL 就是这件事的显性表现（`createChange → changeTotal === 4200` 实得 3200）。门禁没错，是代码改了口径没同步门禁。

**建议**：① 部署前对目标库跑一次性回填 `UPDATE change_orders SET status='client_confirmed' WHERE status='draft' AND submittedAt IS NULL AND createdAt < <上线时刻>`，并把该步骤写进 `INTERNAL_DOCKER_RUNBOOK` 的升级前置；② 该逻辑**不能做成永久迁移**，否则会把上线后员工新建的草稿也确认掉；③ 更新 `verify-finance-flow` 断言为"draft 不计入 → 确认后计入"，并新增一条锁死"存量回填行为"的断言；④ 契约 §5 补一句变更单进金额口径的条件。

### B-2 · 零鉴权应用直接绑到宿主所有网卡 🔍

`compose.internal.yml:9` 为 `"3000:3000"`（未加 `127.0.0.1:` 前缀）；全仓无 `middleware.ts`、无 session 库；9 个模块 manifest 的 `requiresAuth` **全为 false**；四处 `currentUser.ts` 用占位用户。Server Action 无鉴权，可被 curl 直调写。

于是 HR（人员档案／工时／责任矩阵）与财务（合同额／毛利／台账）对**全内网可读且可写**。而仓库自己的 `docs/DEPLOYMENT_INTERNAL_AND_CLOUD.md:8` 已写明"正式内测前需补最小访问保护"——代码里一行都没有。连带后果：`operationLog.ts:23` 的 `FALLBACK_ACTOR="user-local"` 使契约 §4.4 立流水的初衷（"员工说这个数上周不是这样时能重建现场"）在内测期**结构性回答不了是谁改的**。

**建议最低线**（不动 P4 的真 RBAC）：`"127.0.0.1:3000:3000"` 只绑回环 + 反代层 basic auth 或 IP 白名单；`/hr`、`/finance` 未授权不可见。契约 §7 应加一条"内测期最小访问保护"必做项——它现在是现实风险，不是未来项。

## 4. 高危（4 条）

**H-1 · 本机 `pnpm build` 被这轮改动打断** ✅
`output: "standalone"` 正是 `ad8809c` 新加的（此前 `nextConfig = {}`）。standalone 复制依赖 symlink，Windows 非特权进程不允许 → EPERM，构建末段失败。**Linux/容器内不受影响**，但契约 §8 的门槛「`pnpm build` 通过」在本机已不可复现——而本机是唯一的手工验收环境。建议：standalone 改为按环境变量启用（`output: process.env.BUILD_STANDALONE ? "standalone" : undefined`），Dockerfile 里显式置位；或本机开 Windows 开发者模式并在 §8 记一句。

**H-2 · `.env` 会被烘进最终镜像** 🔍✅
`.dockerignore` 全文 8 行**没有 `.env`**，`Dockerfile:11` 却 `COPY . .`；Next 的 standalone tracing 会把根 `.env` 复制进产物，`Dockerfile:22` 整份 standalone 进 runner。已实测确认 `.next/standalone/.env` 存在（97 字节／1 变量）。当前只有 `DATABASE_URL`，实害低；但 P4 的口令、OSS key 一旦入 `.env` 就是明文层泄露。**一行修掉**：`.dockerignore` 补 `.env`，镜像只靠 compose `environment` 注入。

**H-3 · 新容器是空库且没有任何引导路径** 🔍
`core/domain/projects.ts:14-16` 无 Organization 即 throw「请先运行 prisma db seed」。全仓 `prisma.user.create` 命中 **0**——没有任何 UI 或代码能创建用户。`Dockerfile:31` 只跑 `migrate deploy`（不 seed）。结果：`INTERNAL_DOCKER_RUNBOOK` 验收第 1 步必失败；`/hr` 加责任关系与建工作记录都需既有 `userId`，全部无法完成。建议：加一条幂等 bootstrap（只建 Organization + 首个 User，不灌演示数据），或在 runbook 明确"先 `docker compose exec app pnpm db:seed` 再手工清演示数据"。注意 seed 会往 pilot 库灌演示客户/财务/线索，与"真实使用"直接冲突。

**H-4 · HR 两个主按钮的前景色静默失效** 🔍
`src/app/hr/page.tsx:60,105` 用了 `text-accent-fg`，但 `tailwind.config.ts:22-26` 的 accent 只映射了 `DEFAULT/ink/tint` **三值**，契约 §6 定的是**四值族**（含 `--accent-fg`）。该 class 在 Tailwind 里无解，按钮前景落回继承色，视觉接近正常但语义错乱、且切主题时不跟随。由 `21db1cc` 引入。**根因值得单独修**：补齐 tailwind 的 `fg` 映射（一处修、全站受益），而不是逐点改成 `text-[color:var(--accent-fg)]` 这种绕过写法——`core/ui/Button.tsx:18` 正是被迫切成绕过写法的证据。

## 5. 中危（6 条）

| # | 问题 | 证据 | 依据 | 建议 |
|---|---|---|---|---|
| M-1 | 项目详情页归档横幅**把口径说反了**："该项目已归档：不再计入驾驶舱、财务与质量口径"——事实类（已收/支出/合同额/毛利/现金线）**仍计入**财务与驾驶舱 | `projects/[id]/page.tsx:47`；`ArchiveButton.tsx:61-63` 自注确认框已修、页头漏改；流水 `summary` 同样写错（`app/projects/actions.ts:44`） | §4.3「沉默地少一个数字，比数字变小更糟」→ 这里是**说错** | 改文案 + 改流水 summary |
| M-2 | 重复归档会**中毒恢复链**：幂等路径返回 `before:"archived"`，action 无条件写流水，恢复取最新一条 → `restoreTo="archived"` 合法通过校验 → 恢复变静默无操作却返回成功 | `core/domain/projects.ts:385-386`、`app/projects/actions.ts:39-50,70-75` | §4.3「恢复必须回到归档前那一态」 | 幂等路径不写流水，或恢复时跳过 `before==="archived"` 的条目 |
| M-3 | 设置表单可**绕过归档流程**直改 status：状态选项含「已归档」，`updateProject` 直写，无确认框、无 `project.archive` 流水 → 这样归档的项目**没有流水可恢复**（恢复回落 `draft`） | `ProjectSettingsForm.tsx:31`、`core/domain/projects.ts:306-354` | §4.3「归档入口两处」+「归档动作必须写流水」 | 从下拉里摘掉 archived，或改走同一服务函数 |
| M-4 | 间距阶梯**系统性越界**（字号则 609 处 `text-[Npx]` 全在阶梯内，零越界）。复扫精确清单：值 `5`(20px) 34 处、`1.5`(6px) 18 处、`10`(40px) 13 处、`0.5`(2px) 7 处、`2.5`(10px) 6 处、`16`(64px) 2 处 ＝ **80 个越界 token**（上一轮抽样报的"约 77"偏少；实际改写 87 处，差额来自同一 class 串内的多处）。主体是 `ProjectTabs.tsx` 的 `p-5` 12 次与 `px-5` 4 次。`src/app/budget/[projectId]/print/print.css:24` 与 `src/app/quality/archive/[projectId]/print/print.css:25` 早已明文承认 `py-2.5` 越界并在打印态归一（原句"复用组件自带的 py-2.5(10px) 不在间距阶梯内，归一为 3/6"） | 计数见左 | §6 令牌阶梯 | M9-e 曾把"任意间距越界"收口为 0，三个月后重新累积到 80 —— 靠人记得的约束必然回潮，必须机器钉 |
| M-5 | 11 处 `bg-accent` + `text-white` 绕过 `--accent-fg`，切到 teal 主题时白字对 `#81D8D0` 约 1.6:1，触发 V0.3 对比度红线。**非本轮引入**（M5-d 10-09、M6-b/M7-a/M8-a 10-10），但一直没人管 | `design/page.tsx:269`、`finance/page.tsx:135`、`quality/page.tsx:108`、`schedule/…/GanttChart.tsx:164,396,407` 等 11 处（`Button.tsx:23` 的 `hover:text-white` 是 danger 态，合理） | §6「teal 浅青上主按钮用深墨，非白」 | 真正的问题是这些页面绕开 `<Button variant="primary">` 自己拼 class → 改用组件，11 处一起消失 |
| M-6 | **16 道门禁无一挂进 `package.json`**，全部靠人记得手跑；另有 `tsconfig.scripts-check.tsbuildinfo` 残留而 `tsconfig.scripts-check.json` **已不存在** → 一条 scripts 类型检查门禁消失了 | `package.json:5-13`；仓库根 `.tsbuildinfo` | §8 质量门槛 | 加 `pnpm verify` 串纯函数门禁、`verify:integration` 串隔离库门禁；查回 scripts-check 那条 |

另：HR 模块内部分层不一致——`WorkLog` 走了 `modules/hr/server/worklogs.ts`，`ProjectMember` 的重复校验与增删**全写在 server action 里**（`app/hr/actions.ts:19,24,41`），而同模块的 `roles.ts` 校验却在模块内。§2「逻辑归 `modules/<id>/server`」。同模块两套分层比全漏更糟，因为没有理由。`verify-hr` 仅 5 条断言（其余门禁 19–135 条），新模块覆盖最薄。

## 6. 低危与在册债务

**已在册、本轮确认未恶化**：§4-17 净变更为负时 `grossProfit`/`marginRate` 走 `safeAmount`（实测 `ledger.ts:44` = `Number.isFinite(n) && n > 0 ? n : 0`，负数归 0），而 `changeTotal` 带符号。2026-10-11 已拍板保持现状。**但有一个新增表现**：驾驶舱同一张健康表里，`margin` 走 `marginRate()`（钳负，`overview.ts:374`）而 `profit` 用带符号原值（`overview.ts:481`）——若真出现净负变更项目，**同行两个字段自身就不自洽**，比原登记范围更大。建议把这条增量补进决策 17 的登记。

**其余**：EAV 读绕过 repo 收口 3 处（`app/fields/actions.ts:88,117`、`app/projects/[id]/actions.ts:37`，均为取 before 值写流水，写仍走 repo）；`OperationLog.before` 混入中文 4 处（`modules/crm/actions.ts:143,218` 等，无恢复消费者、实害低但稀释了规则）；`recordOperation` 埋在服务层 2 处（`hr/server/worklogs.ts:29,37`，当前无事务包裹故无现实回滚风险，违反 §4.4-③ 纪律）；`src/modules/fields/` 空目录残留（`/fields` 已 redirect 到 `/settings#custom-fields`）；`core/ui/NotificationBell.tsx:16` type-only 反向依赖 dashboard；`app/projects/page.tsx:12` 借 budget 的 re-export 而非直取 `core/domain/pricing`；Dockerfile 把整份 `node_modules`（691MB）复制进 runner 而 standalone 本体仅 23MB、`CMD ["sh","-c",…]` 使 PID1 为 sh 导致 SIGTERM 不转发（SQLite 写中断风险）、`package.json` 无 `packageManager` 字段而 `pnpm-workspace.yaml` 用了 pnpm 11 语法（corepack 回落 pnpm 10 会拦 engines postinstall）、`/dashboard` 页头口径行无条件常显（§4.3 要求无归档时一个字不加）、`overview.ts:79,514,547` 三处注释与实现相反、根目录 2 个 `.tsbuildinfo` 应进 `_scratch/`。

**修复轮补记与更正（2026-10-14 同日）**：

- 上一条里的两处要更正。① `overview.ts` 注释与实现相反的位置实为 `:79`、`:241`、`:522`、`:555` 四处（原记 `:514`/`:547` 系行号漂移），全部写"非 archived 范围"，而实测主查询 `project.findMany` 根本不带 status 过滤、**含归档**——行为是对的、注释是反的，危害在于下一个人会照注释把对的行为"修"成错的。② **"`/dashboard` 页头口径行无条件常显、与 §4.3 不符"这条撤回，是我的误判**：常显那句是两族口径的**定义**（任何时候都成立的规则说明），而"哪些格子含归档项目、含多少"的具体参与说明本来就是 `archivedFacts.projectCount > 0` 条件渲染的（`page.tsx:76-85`）。契约要求的是后者，实现无误。该条来自子代理结论、我未复核即采信——记此教训。
- 另抓出一处原报告未列的：`prisma/seed.ts` 建的「管理员」账号 `role="owner"`，而 `USER_ROLE` 常量表里的老板值是 `boss`、**没有 `owner`**。此前一直靠 `resolveActor()` 的"缺 boss 则取最早的任意用户"兜底才没出错——是巧合不是设计。已在 `prisma/bootstrap.mjs` 用正确值，并对老库同 email 账号做角色补齐。

**做对了、不该动的**：主题双声明锁实测 31/31 全过；`box-shadow` 与 Tailwind `shadow-*` 真为 0；`.splash-*` 严格锁在作用域内无泄漏；零组件库、零 `localStorage`；组件内零硬编码色值；反 AI 模板目测合格（纸底＋描边扁卡＋13px 主口径，无渐变无 emoji）；`QuoteItem` 仍是快照非引用、保存仍整表替换；§5 计算口径单一真源、`area≤0 → unitCost=null` 无除零、浮点有 EPSILON+round2 收口；核心域无重复定义；`modules/**` 44 条相对 import 全部同模块内；`operationLog.create` 全仓仅 1 处唯一入口、35 个 `$transaction` 内零埋点；`entityKind` 严格限 project\|client 且对未知值抛错；归档确认框如实列未闭环事项且无 N+1；`public/uploads` 走 uuid 命名＋MIME 白名单＋防穿越；seed 全为假数据无隐私风险；**归档两族口径实测 12 项中 11 项完全正确**（唯一"半对"即 §4-17）。

## 7. 契约漂移双向核对

| 条款 | 契约 v0.4 | 代码实际 | 该改哪边 |
|---|---|---|---|
| §0/§7 模块范围 | 只构建第 1 个模块（预算），P1 进行中 | 9 模块已注册（`registry.ts:19-27`）+ `/settings` + 2 api route，`deferredModules=[]` | **改契约** |
| §5 数据模型 | 只列 budget 四实体 | **30 个 model**，跨 7 模块 | **改契约**（各模块实体节或指针指向 schema） |
| §2 目录 | core 只有 domain/ui/db | 另有 `core/storage/`、`core/platform.ts`；`scripts/` 18 个门禁未入册 | **改契约** |
| §4 共享核心域 | 4 个实体 | `core/domain/` 15 文件（ledger/health/rbac/telemetry/pricing/…），Project 已扩 `contractAmount` | **改契约** |
| §4.3 归档二分 | 覆盖 `Project.status`、`Lead.archived` | 新增 **`WorkLog.archived`**——工时是"发生过的事实"却被可见性开关抹掉，人效/绩效聚合口径无话 | **需拍板**（归档工时是否仍进统计）后改契约 |
| §4.3 钱按事实 | 变更额属事实类照算 | 变更单新增确认门，未确认不进金额口径（合理的产品演进），但**存量未回填** | **两边都改**：回填存量 + 契约补口径条件 |
| §7 权限 | 登录/RBAC DEFERRED、不做权限中台 | `core/domain/rbac.ts` 已有 `can(role,action)` 骨架（自注非安全边界）；内测把零鉴权变成现实风险 | **改契约**：加"内测期最小访问保护"必做条 |
| §1/§7 部署 | Compose（app + Caddy/HTTPS）→ 阿里云 2G | 仅 `compose.internal.yml`，无 Caddy/HTTPS、无云版；可直连 3000 绕过反代 | **改代码或改 §7 时间线**（NAS 内测 ≠ P3） |
| §8 质量门槛 | build + 迁移 + seed 能跑 | build 本机已断（H-1）；16 道门禁无一处挂 scripts | **两边都改** |
| §4.4 流水 actor | P4 换 session | 内测期 actor 恒 `user-local`，"谁改的"答不了 | **改契约措辞**（明写内测期局限） |
| `docs/STATUS.md:127,261` | "P3 部署暂缓、本机无 Docker" | `ad8809c` 已提交 Docker 内测准备 | **改文档**（顶部已补，127/261 未同步） |

## 8. 对 codex 这轮四提交的独立评价

净收益（应保留）：`m13` 的四段确认流是真实业务需求的方向；验收证据链（`EvidencePanel` + `verify-evidence-flow` 14 项全绿）、工作流水活动页、质量项目筛选、`FileAsset` 落盘抽象都干净；EAV 死码 `createFieldAction`/`updateFieldAction` 确实删掉了；STATUS/TASK_M11 声称的 M11-A/B/C/D 抽验**属实**。

引入的问题：B-1（迁移未回填 status，且未同步门禁）、H-1（standalone 打断本机 build）、H-4（`text-accent-fg` 无解类）、M-6 的一部分（新增 `verify-hr` 仍未挂 scripts）、HR 分层不一致、以及 `docs/PLATFORM_INTRODUCTION_V1.md`（389 行新文档）里对"变更单录入即生效"的描述**已与代码不符**——它写的仍是旧口径。

一句话判断：改动本身**方向对、收口粗**。三类症状同源——改了口径没同步门禁、加了 config 没验证本机、用了 class 没验证映射。这恰是 `AGENTS.md` §8 门槛本该拦住的事，而门槛没挂进 scripts（M-6）导致它靠人记得。

## 9. 建议处理顺序

1. **B-1 存量回填**（上线前必须，一次性 SQL + 门禁同步）
2. **B-2 最小访问保护**（改一行 ports + 反代 basic auth）
3. **H-2 `.dockerignore` 补 `.env`**（一行）与 **H-3 bootstrap 引导**（runbook 与幂等 seed 二选一）
4. **H-1 standalone 按需启用**（恢复本机 build 这个验收前提）
5. **M-1 归档横幅文案 + M-2/M-3 归档链路**（三者同类，一次收口；它们共同决定员工会不会信这些数）
6. **H-4 + M-5**（补 tailwind `fg` 映射，再把 11 处内联按钮换成 `<Button>`）
7. **M-6 门禁挂进 `pnpm verify`**（把上面所有事变成以后能被自动拦住的）
8. **契约升 v0.5**（第 7 节表格里标"改契约"的 8 行 + §4.3 需你拍板的 `WorkLog.archived`）
9. M-4 间距阶梯、低危清单（可与功能并行推进）

## 10. 未能确认项

- 5 道 `.mts` 集成门禁中的 `verify-finance-flow` 那 2 条 FAIL 是否已在别处登记 —— 未检索到登记，按未登记处理。
- 容器内 `migrate deploy` 与 `public/uploads` 静态服务在 Next 生产模式下的实际行为（本机无 Docker，未起容器验证）；`runbook:38` 步 3 正是它的实测。
- `HOSTNAME` 未显式设置是否会导致 standalone `server.js` 绑到非 `0.0.0.0` —— Docker Compose 下 `process.env.HOSTNAME` 通常未定义故回落到 `0.0.0.0`（该坑主要在 K8s），显式 `ENV HOSTNAME=0.0.0.0` 是零成本防御，但本机未能起容器证实。
- `logs/` 的 2MB 滚档逻辑只在写入时触发，当前 1616 字节远未达阈值，未实测滚档。
- shadow-diff 未做（需建影子库），无法 100% 排除"迁移 SQL 手改未回流 schema"；但 `migrate status` 报 up to date、且 30 表 ≡ 30 model ≡ 30 `@@map` 数量与命名 1:1。

## 11. 修复轮结果（同日，HAE 要求"现有问题全部修一下"）

体检与修复分两轮记录，是为了保住"当时看到什么"这一层信息。下列每条都标了**怎么验的**，未验到的不写"已修"。

| 编号 | 处置 | 验证方式 |
|---|---|---|
| B-1 变更单存量金额消失 | ✅ 已修 | 新增 `m13b_backfill_change_status` 幂等回填；用一次性脚本**先复现再修复**，12 项两向断言全过（受害行→已确认 / 上线后新草稿→保持 draft 不被误确认 / 重跑幂等）；`verify-finance-flow` 76→**91 项全绿**，新增 draft·pending 不算钱、确认瞬间算钱、驳回回落、已确认禁改禁删全链路锁 |
| B-2 零鉴权 | ✅ 已修（三层） | `app` 服务不再发布端口 + `Caddyfile` basic auth 注入 `x-platform-user` + `src/middleware.ts` 全站闸；口令走 env、缺失即启动失败（fail-fast）；`resolveActor()` 三级优先让流水能答"是谁改的" |
| H-1 本机 build 断 | ✅ 已修 | `standalone` 改 `BUILD_STANDALONE=1` 按需；重跑 `next build` → `✓ Compiled successfully` + `22/22` 页生成 + **无 EPERM** |
| H-2 `.env` 入镜像 | ✅ 已修 | `.dockerignore` 补 `.env`/`.env.*`（保留 `!.env.example`）+ Dockerfile 构建后 `rm -f .next/standalone/.env*` 双保险 |
| H-3 空库无引导 | ✅ 已修 | 新增 `prisma/bootstrap.mjs`（幂等，只建组织 + boss，零演示数据）并入 `CMD`；**空库实测两跑**：首次创建、二次跳过，`clients/projects/finance/leads` 均为 0 |
| H-4 `text-accent-fg` 无解类 | ✅ 已修（修根因） | `tailwind.config.ts` 补 `accent.fg` 映射；`verify-tokens` 新增"四值族必须同构"断言防再缺 |
| M-1 归档横幅文案说反 | ✅ 已修 | 详情页横幅与流水 `summary` 改为如实两族表述（含"已发生的账仍照常统计"） |
| M-2 重复归档中毒恢复链 | ✅ 已修（双保险） | `setProjectArchived` 幂等返回 `noop` → 动作层不写流水；恢复侧 `NOT:{before:"archived"}` 兜历史脏数据；恢复同样 noop 不写 |
| M-3 设置表单绕过归档 | ✅ 已修（双保险） | 表单摘掉 archived 选项（归档态改渲染只读提示，避免 Select 回落首项悄悄改状态）+ `updateProject` 服务层拒写；`status` 语义同步改为"未传＝保持原值" |
| M-4 间距越界 80 处 | ✅ 已清 + 机器钉住 | codemod 归位 87 处；新增 `verify-tokens` 间距断言复扫＝0；映射方向沿用两处 `print/print.css` 既有归一口径，未另定一套 |
| M-5 11 处 `bg-accent text-white` | ✅ 已修 | 全改 `text-accent-fg`；`Button.tsx` 的 `hover:text-white`（danger 态）**有意保留**未误伤 |
| M-6 门禁未挂载 | ✅ 已修 | `scripts/run-gates.mjs` 按文件名**自动发现**门禁 + 挂 `pnpm verify` / `verify:integration`；驱动器自身踩到 3 个 Windows/解析坑，均已修并复跑 |
| 工时归档口径 | ✅ 按拍板落地 | 定为**事实族**：`archived` 只隐藏列表，服务层写明"将来聚合不得复用 `archived:false`"，页面显示"另有 N 条已归档未列出" |
| 驾驶舱 `profit`/`margin` 同表分叉 | ✅ 已修 | `profit` 改用 `ledger.grossProfit`（沿 §4-17 已裁定口径），页面侧不再自带第二套算式 |
| 分层与低危 8 项 | ✅ 已修 | HR `ProjectMember` 下沉服务层（并补存在性校验，防 curl 造悬空外键）；流水埋点回动作层；EAV 读走 `getDefSnapshot`/`getEntityValues`；`NotificationSummary` 提到 `core/domain/notificationTypes.ts`；CRM `before` 改机器值（顺带修掉硬编码的 `"quoted"` 与 UI 上永不显示的中文值）；活动页 `getProjectIdentity`；`projects/page` 直取 `core/domain/pricing`；`modules/fields` 空目录已入回收站 |
| 契约漂移 8 行 | ✅ 契约升 v0.5 | §0/§2/§4 对齐实现；新增 §4.6 变更单确认门、§7.1 内测最小访问保护；§6 补两处成文例外 |
| 三处 `<img>` 警告 | ⚪ 有意保留 | 内网 standalone 无 sharp，`next/image` 优化端点会在生产报错；证据图是手机原片，有损优化可能改动呈像。改为就地写明理由，`next lint` 现零警告 |

**有意未修（4 项，都因"未验证的风险"或"需你决策"，不是疏漏）**：

1. **镜像仍带整份 `node_modules`（691MB）**。改成"只靠 standalone 自带依赖 + 单独一层 prisma CLI"能瘦到约 90MB，但**本机无 Docker，无法验证 Prisma 查询引擎能否被 `outputFileTracingIncludes` 完整带出**——猜错的代价是容器起不来，而这正是内测要用的东西。已在 `Dockerfile` 内写明理由与改法，留给有 Docker 的环境验证后再动。
2. **`client_confirmed` 是终态、无撤销路径**。`updateChange`/`deleteChange` 都拒绝已确认行、`setChangeStatus` 也没有离开该态的边。守卫方向是对的（已确认金额不能被无痕抹掉），但配合本轮 `m13b` 的批量回填，一旦员工录错并被自动确认就无任何纠正手段。补"撤销确认"属产品决策，需单开单元 → 已登记进契约 §4.6 与 `AGENTS.md` 已知缺口。
3. **`tsconfig.scripts-check.tsbuildinfo` 对应配置已不存在**——历史上有一条 scripts 类型检查门禁消失了，无法从仓库还原其内容，未擅自重建。残留的 2 个 `.tsbuildinfo` 已 gitignore，但按 §9.1 应移入 `_scratch/`。
4. **HTTPS 与真 RBAC** 仍属 P3/P4，内测按"内网明文 + 口令"过渡，已在 §7.1 与 runbook §5 明写边界。

**修复轮全量回归**：`tsc --noEmit` 0 错 · `next lint` 零警告零错误 · **17 道门禁 913 项通过 0 失败** · `next build` 编译成功 + 22/22 页 · `prisma validate` 通过 · 14 条迁移 up-to-date · `dev.db` 全程 md5 未变（集成门禁均走 `_scratch/*.db`）。

---
*本次体检阶段未改动任何仓库文件；其后的修复轮（同日夜）按上表逐条实施，改动均已入库并可经 git 回退。体检阶段产物：`_scratch/logs/static-gates.log`、`_scratch/logs/build-healthcheck.log`、`_scratch/backup/dev.pre-healthcheck-20261014-165408.db`（dev.db 体检前快照）、`_scratch/{sign,finance-flow,quality-flow,schedgen,evidence-flow}.db`（隔离库）。修复轮另新增 `dev.db` 快照与 `_scratch/{boot,backfill}.db`、`_scratch/tmp/{verify-backfill,probe-datetime,codemod-tokens}.mjs`。*
