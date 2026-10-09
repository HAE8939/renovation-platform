# M1.5 提案 —— 主题可换 + 跨模块关联主键 + 自定义字段

> 2026-10-09 · 状态：**EXPLORING（等三项确认后转 DECIDED）**
> 来源：客户反馈 R1/R2（`docs/REQUIREMENTS.md`）+ AGENTS.md 尚未落地这两条契约。
> 本文只定业务骨架与取舍，不含实现代码。文末给出可直接应用的 `AGENTS.md` 补丁。

## 0. 结论先行

**建议单排一个 M1.5 里程碑，把所有需要动 `prisma/schema.prisma` 的东西一次做完**（主题设置表 + 自定义字段表），而不是塞进 M1b 各轮里。

理由只有一个但很硬：M1b 各轮任务卡都写死了「禁止改 schema」，而 R1 的「客户自助选色要存下来」和 R2 的「自定义字段」两张表都属于 schema 变更。分开做＝两次迁移、两轮回归；合到 M1.5＝一次。顺序是 **M1b（纯 UI/编辑，不动表）→ M1.5（动表）→ M1.6（看板按自定义字段筛选）**。

---

## 1. R1 主题可换

需求本身：最终品牌色由客户敲定，现在写死的钴蓝必须能换；交付时可能还要 logo。

### 三条路

| 方案 | 做法 | 优 | 劣 |
|---|---|---|---|
| **A 构建期定稿** | 预置 4 套 accent 插槽为常量，部署时选一套打进 CSS | 零运行时开销、零新表、最简 | 客户改主意就要重新构建部署 |
| **B 运行时可配**（推荐） | 新增单行表 `PlatformSetting{accentKey, logoPath…}`，根布局读取后以 `:root` 内联变量覆盖 accent 一族 3 值；预置 4 套插槽供选择 | 客户可自助切换、即时生效；完全符合 V0.3「换主题只动 `--accent` 一族」；改动面极小（一张表 + 一处注入） | 需要一次 schema 迁移；需要「禁缓存」处理才能即时看到切换 |
| **C 完整白标流水线** | 色板 + 字体 + 圆角 + 密度全可配，多品牌租户 | 商业上限高 | V0.3 附注已把「多品牌白标换肤」列为 DEFERRED；当前单客户，属过度设计 |

**我的选择：B。** 它和 A 的差别只多一张单行表，却把「客户今天想试试红色」从一次发版变成一次点击；而 C 现在做等于违反红线一（不过度设计）。

### B 的落地前提（两条已在审计中发现，必须先修）

1. **accent 插槽实际是 3 值不是 4 值。** V0.3 §2.1 与 `AGENTS.md` §6 都写"一族 4 值"，但浅色模式下只有 `--accent / --accent-ink / --accent-tint`；第 4 个 `--accent-text` 是**暗色专用**替身，且规范 §9.14 明确"钴蓝等三套的暗色提亮值待真实暗色项目补、不写死"。实现者按 4 值去数会找不到第 4 个。→ 契约措辞需改为「浅色 3 值 + 暗色预留 1 值」。
2. **底色不许进主题开关。** V0.2/§2.2 注：`--canvas` 是全系统对比度的计算零点，一旦可调，所有文字对比度、描边、tint 派生同时失效。四套插槽共用同一张纸，这是刻意的。

对照可视化已产出：`_preview/theme-picker.html`（同一张报价单 × 四套 accent，含每套的无障碍实测与撞色风险）。**给人看时的核心事实**：钴蓝 5.8:1 最安全；铁锈红与 danger 色相差仅 9°，满屏暖红时"删除"与选中行互抢；祖母绿与蒂芙尼青的实色块白字分别只有 3.8 / 3.2，**不达正文号 AA**，只能配深墨字或仅用于大字号。

### 待确认（客户侧）

- 交付形态是「给客户一个可自助切换的设置页」，还是「我们按客户品牌出 2–3 套定稿、上线时锁一套」？前者才需要 B 的运行时切换；后者 A 就够。

---

## 2. R2 模块串联 + 用户自定义关键字段

已确认：关联主键、自定义字段、看板筛选维度**三者都要**，顺序 ①→②→③。

### ① 跨模块关联主键 —— 几乎不用做，只需写进契约

现成脊柱已经在了：`Project.id`（主键）+ `Project.code`（`@unique`，人类可读编号，如 `RP-2026-001`），预算已通过 `projectId` 外键挂在 Project 上。所以 ① 的真实工作量＝**立规矩 + 文档化**，不需要迁移：

- 未来任何模块的表必须以 `projectId` 挂 `Project`，**禁止**自建项目实体或另存一套项目名。
- 对外展示与跨系统对账一律用 `Project.code`（稳定、可读、唯一）；程序内关联一律用 `Project.id`（cuid，永不复用）。
- `Client` 通过 `Project.clientId` 间接关联，模块不得直接绑 `clientId` 再反推项目。

**判断：① 归入 AGENTS 契约修订，不占开发工期。** 真正的工期在 ②。

### ② 自定义字段 —— 两种存法

| | EAV 双表 | JSON 扩展列 |
|---|---|---|
| 结构 | `FieldDef{target, key, label, type, required, order}` + `FieldValue{fieldId, entityId, value}` | 每个核心对象加一列 `ext Json` |
| 按字段筛选/分组（＝③看板维度） | ✓ 天然支持（SQL where/join/group） | ✗ SQLite 下要 `json_extract`，迁 PG 还得改 jsonb；索引与统计都别扭 |
| 字段级校验 | 可在 FieldDef 上挂 type/必填 | 无，全靠前端自觉 |
| 读取代价 | 多一次 join（本系统数据量小，可忽略） | 零额外代价 |
| 删除/改名的历史语义 | FieldDef 软删或保留，历史值仍在 | 键改名即丢数据 |
| 迁 PostgreSQL | 无痛 | 需 json→jsonb 改类型 |

**我的选择：EAV。** 决定性的那一条是 ③：看板要「按自定义字段筛选/分组」，JSON 列在 SQLite 上做聚合筛选基本是死路，做到一半必返工。本系统数据量小（几十到几百行），join 的代价可以忽略，EAV 的唯一实质缺点不成立。这也符合"简单 > 稳定 > 易维护"里那条真正稀缺的东西——**可扩展性在这里是刚需，因为 ③ 已经确定要做**。

表结构草案（M1.5 迁移内容，暂不落 schema）：

```
CustomFieldDef   id, target("Project"|"Client"), key, label, type("text"|"number"|"date"|"select"|"bool"),
                 options(Json: select 候选值), required(Boolean), order(Int), active(Boolean), createdAt
CustomFieldValue id, fieldId → CustomFieldDef, entityId(String: Project.id / Client.id), value(String), createdAt
   @@unique([fieldId, entityId])
```

- `value` 一律存文本 + 按 `type` 解释：SQLite 无原生枚举/数组，这么做最便携，迁 PG 后可视需要对 number/date 加表达式索引。
- `target` 用字符串常量而非枚举，守 AGENTS §1 的可移植约束。
- 模块侧读取走 `core/domain` 提供的一个 `getCustomFields(target, entityId)`，**禁止**各模块自己查这两张表——否则 R2 想解决的"各存一套"会以另一种形式回来。

### 待确认（业务侧，两个问题）

1. **自定义字段挂在哪些对象上？** 草案只给 `Project` 与 `Client`（主数据级、天然被所有模块共享）。
   我的倾向：**不给 `QuoteItem` 加**——它已是模板快照，再挂扩展属性会让「模板改了历史报价算不算数」这条语义（AGENTS §5 的快照决策）变得说不清。若客户坚持要在明细行加字段，建议改为"新增一个专用业务列"而不是走自定义字段通道。
2. **要不要字段级权限/校验？** 当前免登录单用户（P4 才接登录），我建议首期只做 `required` + `type` 两项最轻校验，权限一律 DEFERRED 到 P4 与 RBAC 一起谈。

---

## 3. 里程碑调整建议

```
M1a  ✅ 已完成（平台壳 + 预算骨架）
M1b  A 轨（科目库 + 报价编辑器）/ B 轨（打印 + 看板 + 设置）  ← 现在在这里，禁改 schema
M1.5 schema 类改动一次做完：PlatformSetting（R1-B）+ CustomFieldDef/Value（R2-②）
     + AGENTS 契约修订（①关联主键规矩、accent 插槽 3+1 措辞、浮层阴影 L1–L3）
M1.6 看板按自定义字段筛选/分组（R2-③，依赖 M1.5）
P3/P5 按用户指示暂缓（本地跑通优先）
```

---

## 4. 可直接应用的 `AGENTS.md` 补丁

> 等 M1b 各轮交完再改契约，避免执行中的 agent 读到半份规范。

```markdown
## 6.1 主题（R1，M1.5 落地）
- accent 插槽 = 浅色 3 值（--accent / --accent-ink / --accent-tint）+ 暗色预留 1 值（--accent-text）。
  换主题只替换这一族；`--canvas` 等底色为对比度零点，**锁定不可调**。
- 预置插槽按 MT V0.3 §2.4 取值，禁止自造色值。运行时切换存 `PlatformSetting`（DB 驱动，不用 localStorage）。

## 4.1 跨模块关联主键（R2-①，DECIDED，即刻生效）
- 所有模块的业务表必须经 `projectId` 挂在 `core/domain.Project` 下；禁止模块自建项目实体。
- 程序内关联用 `Project.id`；对外展示与对账用 `Project.code`（唯一、人类可读）。
- 客户维度经 `Project.clientId` 间接关联，模块不得绕过 Project 直接绑 Client。

## 5.1 自定义字段（R2-②，M1.5 落地）
- EAV 双表 CustomFieldDef / CustomFieldValue，target 限 Project 与 Client（字符串常量，非枚举）。
- 只经 core/domain 的统一服务读写，模块不得直查这两张表。
- 首期校验仅 required + type；字段级权限 DEFERRED 至 P4。

## 6.2 浮层阴影（修正 §6 的过度简化）
- 默认 L0 无阴影；Modal / 下拉 / 命令面板按 V0.3 §4 用 --shadow-1/2/3 令牌，受 Shadow Budget 约束。
- 禁止引入 Tailwind 默认 shadow-* 与 fontSize/spacing 越界档（见 docs/DESIGN_AUDIT_M1A.md）。
```
