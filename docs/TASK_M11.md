# TASK_M11 · HAE 12 条意见的未做项 + 两件欠账

> 2026-10-13 立卡 · 状态：**已完成**（M11-A/B/C/D 已落地）· 维护人：HAE / 集成者
> 前置：M10-a（三备料）、M10-b（启动页 + 驾驶舱改版）、M10-c（归档口径二分）已全部合入并 commit，
> HEAD 见 `docs/STATUS.md` §8 末条。本卡的每一件事实都以那次合入后的代码为准。

## 0. 新会话开工前必读（按顺序，别跳）

1. `AGENTS.md` —— 契约 v0.4。特别看 §4.1（跨模块主键与深链现状）、§4.2（EAV）、§4.3（归档二分）、
   §4.4（操作流水三条不变量）、§6（视觉硬约束）、§6.3（启动页例外）、§9（工作区目录约定）。
2. `docs/STATUS.md` §2（门禁与工具链）、§4（已知缺陷与待办，含 §4-19~25 本轮新增）、
   §5（踩过的坑，**每条都有代价**）、§8（交接）。
3. `scripts/acceptance/README.md` —— 交互写回验收台怎么用、怎么加场景、八条实测坑。
4. `docs/TASK_M10A.md` §2/§3 —— HAE 12 条意见的逐条处置，以及"未做四件"的原始理由。
5. `E:\19 Python File\MT-Visual-Language\HAE Creator Design System V0.3.md` —— 视觉唯一真源。
   注意其 §Benchmark ≠ Style 红线（禁止把"高级"理解成大标题+黑底+巨图+滚动动画）。

**唯一绿门**（每批合入前必跑，一条不许省）：
`pnpm build` · `npx tsc --noEmit` · 十道纯函数门禁（quote 89 / crm 19 / health 20 / design 28 /
schedule 55 / quality 108 / finance 135 / dashboard 86 / fields 89 / theme 31）·
**动了 `prisma/schema.prisma`、`prisma/seed.ts` 或 `core/domain` 既有口径时，四道隔离库集成门禁
一律全量重跑**（sign 12 / schedule-gen 27 / quality-flow 94 / finance-flow 76，跑前先
`migrate reset --force`）· 相关验收套件复跑 + 新场景入 `scripts/acceptance/`。

**通用纪律**：破坏性验证一律打 `_scratch/acceptance.db` 副本，实库 md5 元断言必须过；
不擅自扩大范围；改设计前先列改动清单请 HAE 确认（他给的是范本图/截图时尤其如此）。

---

## 1. 三件"可以先干"的（不需要 HAE 再拍板）

### A. 质量管控的项目筛选换成可搜索筛选框（意见 9 前半）

- **现状事实**：`/quality` 与 `/quality/issues` 页头的项目筛选是原生 `<select>`，把所有项目塞进下拉。
  HAE 原话：「把所有项目放在框内，那后期项目多了咋整？」——现在 8 个还能用，30 个就废了。
- **落点**：`src/app/quality/page.tsx`、`src/app/quality/issues/page.tsx`（及各自的 filter 组件），
  服务层 `modules/quality/server/nodes.ts` / `issues.ts` 的 `filter.projectId` 已支持，**不用改服务**。
- **要求**：可搜索（输入即筛）、显示当前已选项目名、支持"全部"、URL 深链 `?projectId=` 保持兼容
  （驾驶舱风险项与通知中心都在往这个参数上链，改坏会断链）；窄屏不破版。
- **验收**：新增 `scripts/acceptance/s13-quality-filter.mjs`——筛选项与库中项目集合一致、
  选中后列表只剩该项目、深链进来筛选框显示同名、清空回全量、375 无文档级溢出。
- **禁区**：不要顺手改验收节点的状态机或检查项逻辑（M7 的口径有 108 条断言压着）。

### B. 项目动态页：把操作流水可视化（M10-a 的自然收尾）

- **现状事实**：`OperationLog` 有写入（~20 处埋点）和 `listOperations()` 读口，**但没有任何界面**——
  现在只能我查库回答"谁改的"。HAE 的整条上线策略（"逻辑问题只能靠员工真实使用发现"）
  依赖这个页面才能闭环：员工自己就能看"这单上周被动过什么"。
- **落点**：项目中心加一个 Tab（`src/app/projects/[id]/ProjectTabs.tsx` 加 `activity`），
  或独立路由 `/projects/[id]/activity`；数据走 `core/domain/operationLog.ts` 的 `listOperations`。
- **要求**：倒序时间线，显示 时刻 / 操作人 / `summary`（人话）/ 变更前后；
  默认取最近 50 条并给"加载更多"；**不许把 `before`/`after` 的机器值直接甩给用户看**，
  要么拼进 `summary` 要么按 action 做映射；空态诚实（"这单还没有留档的改动"）。
- **验收**：`s14-activity.mjs`——在页面上改一笔台账 → 动态页立刻出现该条且文案可读 →
  归档/恢复两条也在时间线里 → 深链到另一个项目不串数据。
- **禁区**：不要在这一步做"撤销"（流水是账本不是回收站，撤销要单独设计）；不要给流水加权限过滤（P4）。

### C. 两件小欠账，顺手清掉

- **报价页顶部汇总条四格等宽**（STATUS §4-4 的残留）：`src/app/budget/[projectId]/QuoteBoard.tsx`
  的汇总条，总价应明显重于直接费/税金/单方造价。同 /finance（M8-d）与 /dashboard（M10-b）的
  已定做法：**主级独占 + 其余降次级紧凑**，字号仍只用 12/13/15/17/20/28。
- **死码**：`src/app/fields/actions.ts` 的 `createFieldAction` / `updateFieldAction` 全站零引用
  （`FieldsAdmin` 只用 `saveFieldAction`）。确认后删除，别留着腐烂。

---

## 2. 一件"必须先让 HAE 拍板才能动手"的

### D. 验收证据图片上传（意见 9 后半）✅ 已完成

**已按最小版落地**：节点级 JPG/PNG 证据，本地存储，单张 ≤5 MB、每节点最多 9 张，上传者可删除自己的图片；数据库保存元数据，上传与删除写入 `OperationLog`。OSS 留到 P3 部署方案确定后再评估。

**验收**：`scripts/verify-evidence-flow.mts` 隔离库门禁 14 项全过；页面级 `scripts/acceptance/s15-evidence.mjs` 已通过 13 条断言（上传、回读、流水、删除、文件清理、实库 md5）。

### E. 人员管控模块（意见 11）

- **现状事实**：`src/modules/registry.ts` 的 `deferredModules` 里已有 `hr` 占位；
  驾驶舱「人效排行」与待办里的绩效项是灰占位，明写"人员管控模块未上线，暂不统计"——
  **不留假数字**这条纪律已经立在那了，新模块必须填真口径而不是把占位改成装饰。
- **规模判断**：这是第 10 个业务模块（人员档案 + 绩效算法 + 考核看板，项目/月度双维度），
  按本仓惯例要**独立里程碑、拆 4~6 个单元**，不能和 A/B/C 混一批。
- **动手前必做**：重读 `E:\19 Python File\Full-Service Project Management\` 三份资料，
  先出**规格文档**（表结构 + 绩效算法口径 + 与 User/Project 的关系 + 首期边界）给 HAE 确认，
  再开工。绩效算法是纯函数，**必须先写 `verify-hr.mjs` 门禁再写实现**（沿 M8/M9 的做法）。
- **风险提示**：`User` 表目前是占位、没接登录（P4），绩效要落到"人"上就会撞这个前置——
  规格阶段必须回答"本期人员是 `User` 表记录还是自由文本"，别做到一半发现要提前做 P4。

---

## 3. 一件更根本的、HAE 尚未答复的

**要不要先局域网内测**。HAE 的判断是"逻辑问题只能上线后靠员工真实使用才发现"——
现在错误现场（`logs/app-errors.jsonl`）、操作流水、归档纠正三样底座都已就位，
正是开始收问题的时点，不必等买服务器。

- 已有先例配置：`npx next start -H 0.0.0.0 -p 3000` + 防火墙入站规则
  `renovation-preview-3000`（规则还在，服务已停、空转中，见 STATUS §8 遗留①）。
- 本机局域网 IP 上次记录 `192.168.3.29`，**会变，用前 `Get-NetIPAddress` 复核**。
- 内测前建议先补 **B（项目动态页）**——员工报"这个数不对"时，他自己就能翻到是谁改的，
  不用等我们查库。

## 4. 挂着的观察项（不阻塞，遇到就顺手查）

- **STATUS §4-21**：一次未复现的 Server Components 渲染报错（删自定义字段环节）。
  现在 `logs/app-errors.jsonl` 已经能留 digest 与路径，下次复现直接凭编号查现场，**别盲改**。
- **STATUS §4-20**：手测清单与演示锚点会随真实点击漂移（本轮 002/003 的节点状态就变了）。
  任何"照着清单点"的活，开测前先查真库，别沿用上一轮记录。
- **STATUS §4-17**：`ledger.grossProfit` 对净负变更项目与 `budgetLight` 口径分叉，
  HAE 已拍板"保持现状 + 长期登记"，无真实减项需求前不要动（牵动 135 条 finance 断言）。
