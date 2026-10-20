# 停滞交接 · renovation-platform（2026-10-20）

> **一句话**：项目自 2026-10-20 起暂停开发。代码冻结在 `master`，已上传 GitHub 并打 tag `paused-2026-10-20`；冻结点经全量实测为绿（21 道门禁 / 1111 项 / 0 失败，`tsc` 0 错，`lint` 零告警，`next build` 成功）；**内网 NAS 上那套仍在运行，且跑的已是最新代码**。本文是恢复时该先读的东西——它只写"状态、风险、第一步"，进度与决策明细在 `docs/STATUS.md`，硬口径在 `AGENTS.md`。

## 1. 冻结点身份

| 项 | 值 |
|---|---|
| 分支 / tag | `master` · **`paused-2026-10-20`**（annotated，`git show paused-2026-10-20` 即完整快照） |
| 冻结前最后一笔功能提交 | `43c6969` feat(pano) M15-a 全景管理（2026-10-18） |
| 本轮收口提交 | 文档与门禁修复（README 重写 / STATUS 补登 / 契约 §8 数字与教训 / `.env.example` 补全 / `verify-quality-flow` 守卫换判据） |
| 远端 | `git@github.com:HAE8939/renovation-platform.git`，`origin/master` 已含全部内容 |
| 规模 | 10 个业务模块 + `/settings` + `/docs` 文档站 11 页 · 44 个 `page.tsx` · 3 个 API 端点 · 16 条 Prisma 迁移 · 31 个 model |
| 质量基线 | 纯函数 13 道 / 753 项 + 隔离库集成 8 道 / 358 项 = **1111 项 0 失败**（2026-10-20 本机真跑） |

**四条本地分支没推**（`wip/m1b-a`、`feat/presentation`、`pre-m1b-checkpoint`、`feat/m1b-b1`）。前三条 STATUS §7 早已标注"仅存档、勿参考勿 checkout"，第四条 `feat/m1b-b1` 的全部工作已在 10-09 并入 master 并清掉工作树（STATUS §6），分支只作历史。GitHub 上只留一条 `master` 是有意选择——它们只含半成品或已并入的历史，推上去反而要下一个冷启动的人逐个判断能不能用。代价：这段历史只在本机磁盘上；真要长期留存，恢复时逐条 `git push origin <分支名>` 补推即可（注意反过来的写法 `git push origin :<分支名>` 是**删除远端分支**，别混）。

## 2. 线上状态：停滞不等于已下线

`http://192.168.1.135:8181` 仍在跑（容器 `renovation-app` + `renovation-caddy`，极空间 NAS）。冻结前核实过线上就是最新代码，**本轮无需重新部署**：

- `/api/health` → `{"ok":true,...}`；`/`、`/pano`、`/about`、`/docs`、`/hr`、`/finance` 全 200。
- `/pano` 是真内容（标题 `全景管理 · 装修经营管理数字化平台`），首页侧栏已挂 `/pano` 入口 → M15-a 已在线。
- 线上下发的 CSS 里 `.splash` 是**底色独立成条**的形态（`background-color:var(--canvas)`，柔光在 `.splash:before` 用 `var(--accent-tint)` 而非 `color-mix()`）→ 旧 iPad 首屏丢底的修复已在线。

两件要知道的：① **口令保护已于 2026-10-17 取消**（内网 + 测试数据，HAE 拍板），所以内网任何一台机器都能读写这个库；恢复保护的方法在契约 §7.1 与 git 历史 `c1a8992` 的反向。② 如果停滞期不希望它继续可访问，停容器即可，数据在卷里不会丢：

```bash
sudo docker stop renovation-app renovation-caddy     # 恢复：sudo docker start renovation-app renovation-caddy
```

## 3. 真风险：只在本机、没进 Git 的三样东西

上传 GitHub **不等于**备份完成。下列内容全在被 gitignore 的路径里，仓库里没有副本：

| 资产 | 位置 | 丢了会怎样 |
|---|---|---|
| 开发库 `dev.db` | `prisma/dev.db`（512 KB，2026-10-18 快照：8 项目 / 4 问题 / 14 笔收支，含 HAE 手测数据） | 演示与手测数据全丢，只能重新 seed（seed 只造基线，造不回手测行） |
| NAS SSH 凭据 | `_scratch/deploy/`（`nas-ssh.local.md` + `nas-pass.txt` + askpass 脚本） | 无法再进 NAS 部署；需人工重新拿账号口令 |
| 上传的附件 / Logo / 全景成品 | 本机 `public/uploads/`（gitignore）；NAS 侧是命名卷 `renovation_db` / `renovation_uploads` / `renovation_logs` | 证据图片与全景导览成品（几百个切片文件的目录）丢失；**库里的登记行会变成"磁盘上找不到"的对账告警** |

建议停滞期开始前做一次离线备份，做法与**恢复演练**（没演练过就不能说"有备份"）都在 `docs/BACKUP_RESTORE.md`，含在线一致性快照与停服冷备两条路。NAS 上的运行库与本机 `dev.db` 是**两份不同的数据**，别互相覆盖。

## 4. 未闭环事项（恢复时的候选清单，按性质分，不按紧急度催）

**产品决策悬着**（要 HAE 判断，不是代码问题）：E1 看板四卡均分是否别扭 · E4 界面整体像不像正经经营系统 · B8-2 两本账差额能否用 · D3-8 "未提交即清空"业务上可接受否 · A4 打印分页人眼确认 · B1 看板真拖拽手感。出处 `docs/ACCEPTANCE_WRITEBACK_2026-10-13.md`。

**有意不做、已登记**（契约 §8 与 STATUS §4 的存项）：镜像仍带整份 `node_modules`（691 MB→90 MB 瘦身需先验证 Prisma 引擎能被 standalone 完整 trace）· CheckItem 无编辑页（改检查项走 seed）· 客户侧自定义字段无录入界面（表与服务已支持，只缺 UI）· §4-17 负变更毛利口径分叉（已裁定保持现状）· 旧设备上 `Badge` / quality 淡底缺失（契约 §6.4 明确接受该降级）。

**下一阶段能力，均需明确启动**：P3 公网 HTTPS 部署 · P4 登录与真 RBAC（`User` 表与 `rbac.ts` 骨架已留位）· P5 迁 PostgreSQL（QA 关卡）· 按 code 打开项目页的可读深链（契约 §4.1 写明"属扩范围，不在既有里程碑顺手做"）。

**规则合规的小尾巴**（本轮只登记未执行）：pano 模块 6 处用户可见文案仍用直角引号，违反 2026-10-18 那条硬规定——同日的清扫提交没覆盖同日到来的全景模块。改法是逐处换中文弯引号，门禁不钉这些字面量所以零断言改动；**唯一的连带影响是已上线页面文案变了，需顺手补一次 NAS 部署保持一致**。详见 §7 第 5 条。

**一条未复现的观察**：s4-flows 首跑见过一次生产构建态的 RSC 渲染报错，后续同路径未复现。抓手已就位——`logs/app-errors.jsonl` + `/api/client-errors` 的 digest 反查，见 STATUS §4-21。

## 5. 恢复开发的第一步（照抄可用）

1. 读三份东西，顺序别换：`AGENTS.md`（契约，含部署机型环境事实 §7.2 与全部硬口径）→ 本文 → `docs/STATUS.md` 顶部摘要与 §2 门禁表。
2. 起环境（**新克隆必带 `prisma generate`**，`pnpm install` 不会自动跑它）：

```bash
pnpm install
npx prisma generate
npx prisma migrate deploy && pnpm db:seed   # 或直接 pnpm db:migrate 建开发库
pnpm verify                                  # 应见 13 道 / 753 项 / 0 失败；几分钟
```

3. 改到 schema、迁移、服务层写入或跨页联动，再跑 `pnpm verify:integration`（驱动器自己 reset 每道的临时库，不用手动先 reset）。
4. 部署走 `docs/NAS_DEPLOY_PLAYBOOK.md`，两个必踩坑先记住：NAS 上 `/opt/renovation-platform` **不是 git 仓库**（只能 `git archive` 铺文件，不能 `git pull`）；Windows 宿主 `core.autocrlf=true` 会把 `.sh`/`Dockerfile`/`Caddyfile` 转成 CRLF，**必须 `git -c core.autocrlf=false -c core.eol=lf archive` 且落地后 `tr -d '\r'` 校验 CR=0 才 build**。

## 6. 停滞期建议不要做的事

- **不要顺手升级依赖**（Next 14.2.5 / Prisma 5.22 / Tailwind 3.4）。没有 CI，任何升级都会让"冻结点可复现"这个前提失效，而恢复时第一件事就是照第 5 节验一遍基线。
- **不要为旧设备做兼容工程**（契约 §6.4 已拍板：旧 iPad 大多已淘汰，只保留"关键底色别压在一次函数失败上"的写法纪律，不做兼容层、不加门禁）。
- **不要预留未来字段**（先例：全景模块明确**不预留** `shareUrl`；留了就是提前实现未来需求）。
- 别把内测当 P3 完成：内测 = NAS + 明文 + 当前无口令；P3 = 公网 HTTPS，两回事（契约 §0）。

## 7. 本轮整理做了什么（供追溯）

1. **修好一道会过期的门禁守卫**：`verify-quality-flow` 的初态守卫硬编码节点数 22，而 seed 里 001 的完工态是按"今天"推导的（`prisma/seed.ts` 的 `deriveState`），节点数只增不减（10-18 = 22，10-20 = 23）。误报的症状与"上次运行残留"逐字相同，照提示去 reset 只会越 reset 越红。改法是把判据换成与日期无关的不变量（seed 恒 1 条 open 问题，任何一次运行都会新建问题或推进它），节点数降级为信息打印。**验证过两面**：改后 94 项全过；同库直接重跑仍被拒（`问题 4/1，其中 open 2/1`）。教训入册契约 §8。
2. **文档追上实现**：`README.md` 自 M8 后从未更新（还写着 7 个模块、"部署暂缓"），按现状重写；`STATUS.md` 补 M10→M15 里程碑索引、门禁清单换成 2026-10-20 实测的 21 道表、页头与 §0 挂冻结告示；契约 §8 门禁数字由"12 道 675 / 5 道 238"更正为"13 道 753 / 8 道 358"。
3. **`.env.example` 补齐**：原先只有 `DATABASE_URL` 一个键，而代码与部署脚本实际读取 6 个变量（`PLATFORM_GATE`、`APP_LOG_DIR`、`BOOTSTRAP_ORG_NAME`、`BOOTSTRAP_ADMIN_NAME`、`BOOTSTRAP_ADMIN_EMAIL`、`CADDY_PORT`），现逐个标注默认值与读侧文件，并注明只有第一个是开发必需。
4. **入库安全复核**：`git ls-files` 扫过，无 `.env` / `dev.db` / 凭据 / `_scratch` / `.next` 被跟踪；`.dockerignore` 的 `.env` 一条仍在（M13 那个机制性泄露通道）。
5. **没动的东西**（有意留手，不是遗漏）：历史直角引号未做全站清扫。实测仍有 115 个文件含该字符，其中 `_scratch/` 70 个（不入库、不影响任何交付）、`docs/` 37、`src/` 6、`scripts/` 3、`AGENTS.md` 1——**只有 pano 模块的 6 处是用户可见文案**（`tours.ts` 四条报错 + `TourRowActions` 解除登记确认框 + `PanoTourCard` 目录名提示），余下都在注释与历史记录里。这批漏网的成因很具体：清扫那笔（`b8a2d70`）与全景模块那笔（`43c6969`）是同一天的两个会话，清扫没覆盖当日新增的文件。门禁不钉这些字面量（核过 `verify-pano*` 只有断言名里出现"摘掉"二字），所以**扫的代价极小，但会改动已上线页面的文案**——要么现在扫完顺手补一次部署，要么留给恢复时第一件事；本轮按"不擅自扩大范围"只登记不执行（见 §4）。同理，`_qa/` 与 `.codegraph/` 等本地产物留在原处（均已 gitignore；删除会破坏既有历史命令的默认输出路径，按 STATUS §9 那条"脚本默认输出目录不改"处理）。
