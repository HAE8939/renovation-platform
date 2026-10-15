# 备份与恢复（内测期）

> 适用范围：内网 Docker 内测部署（当前唯一在跑的目标 = 极空间 Z0220021，环境事实见 AGENTS.md §7.2）。
> 云上 P3 的 postgres 备份另说，本文件只覆盖 **SQLite + 上传目录** 这套现状。
>
> 立这份文档的原因：体检（codex 报告 P1-3 + `docs/DEPLOYMENT_INTERNAL_AND_CLOUD.md`）要求
> 「每日备份数据库、增量备份上传文件并成对恢复」，但**此前仓库里既没有备份实现，也没有恢复演练记录**。
> 「配了快照」在没有实测恢复过一次之前，等于没有备份。本文给出可直接照做的备份与恢复流程与判据。
>
> 本轮（2026-10-15）交付的是**流程文档**，未落地 `nas-backup.sh` 脚本；脚本作为下一步（见 §6）。

## 0. 必须一起备份的三样，以及一条红线

| 对象 | 位置 | 卷 / 路径 | 为什么单独备份不够 |
|---|---|---|---|
| 数据库 | 容器内 `DATABASE_URL=file:/app/prisma-data/dev.db` | 卷 `renovation_db` → `/app/prisma-data` | 经营事实的账本 |
| 上传文件 | `/app/public/uploads/**`（附件、验收证据、设计交付、Logo） | 卷 `renovation_uploads` → `/app/public/uploads` | 流水与附件账只存引用，**文件本身只在盘上** |
| 错误日志 | `/app/logs/app-errors.jsonl` | 卷 `renovation_logs` → `/app/logs` | 可选；用于事后回溯现场，丢了不影响业务 |

**红线：数据库与上传文件必须来自同一个时间点，成对恢复。** 台账里一条指向 `FileAsset.storageKey=uploads/files/...` 的记录，若恢复时配的是一个更早的 uploads 目录，那个文件不存在 → 附件链接点开 404，反之亦然。**只恢复其中一半，比两个都丢更难排查**，因为它"看起来恢复了"。

**另一条红线：凭据不进备份包、不进仓库。** `.env`（含 `CADDY_HASH` 口令哈希、`BOOTSTRAP_ADMIN_*`）要单独走密码管理器或 NAS 的加密存储，不要和 `dev.db` tar 在同一个明文归档里——那等于把口令和数据放进了同一个盒子。

## 1. 备份的两种做法

以下命令都在 NAS 上、`deploy/` 同级目录执行，`docker` 一律带 `sudo`（当前用户不在 docker 组，§7.2）。

### 做法 A · 在线一致性备份（推荐，不停服）

SQLite 的在线安全复制只能靠官方 `.backup`（直接 `cp` 正在写的库、或用 WAL 模式时的 `-wal` 未合并，都会拿到半截状态）。用一次性 arm64 sqlite 容器挂载 db 卷来做：

```sh
TS=$(date +%Y%m%d-%H%M%S)
BK=/opt/renovation-backup/$TS          # 落持久目录，别只放 /tmp（/tmp 会被周期性清空，§7.2）
sudo mkdir -p "$BK/db" "$BK/uploads"

# ① 数据库：用 sqlite3 .backup 写出一份一致性快照到卷内，再取到宿主机
sudo docker run --rm -v renovation_db:/db:ro \
  -v "$BK/db:/backup" keinos/sqlite3:latest \
  sqlite3 /db/dev.db ".backup /backup/dev.db"

# ② 上传目录：整卷打包（首次全量；日常可改 rsync --delete 做增量）
sudo docker run --rm -v renovation_uploads:/up:ro -v "$BK:/backup" \
  alpine:latest tar -czf /backup/uploads-$TS.tgz -C /up .

echo "备份完成 → $BK"
```

> `keinos/sqlite3` 与 `alpine` 都提供 arm64 层；本机型是 aarch64，勿照抄 x64 镜像结论（§7.2）。若内网拉不到镜像，改用做法 B。

### 做法 B · 停服冷备（镜像拉不动、或要做迁移演练时）

```sh
TS=$(date +%Y%m%d-%H%M%S)
BK=/opt/renovation-backup/$TS
sudo mkdir -p "$BK"
sudo docker stop renovation-app                      # 只有 app 容器持有 db/uploads 的写入
sudo docker run --rm -v renovation_db:/db:ro -v "$BK:/backup" alpine:latest \
  tar -czf /backup/db-$TS.tgz -C /db .
sudo docker run --rm -v renovation_uploads:/up:ro -v "$BK:/backup" alpine:latest \
  tar -czf /backup/uploads-$TS.tgz -C /up .
sudo docker start renovation-app                      # 立刻拉回，缩短停服窗口
```

冷备的好处是 `dev.db` 一定是静止一致的（无 `-wal` 悬挂）；代价是几十秒不可用。**内测期没有 SLA，停服窗口可接受，但要先在群里说一声**，别让人在写台账时被弹断。

## 2. 频率与保留

- **数据库**：每日一份。SQLite 单库很小（内测期几 MB 级），日备成本可忽略。
- **上传文件**：随每次日备一起做一次全量 tgz；上传目录增长到占空间时再改 rsync 增量。
- **保留**：日备留 7 天、周备留 4 周、任一重大操作（迁移、批量回填、清库）前**手动留一份永久档并标注原因**。
- **存放**：备份**不要只留在 `/data_s002`**（docker data-root 与卷都在这、已用 96%，§7.2）——盘满则备份与业务一起写不进去。至少把归档同步到另一块盘 / 极空间备份 app 指向的外置或异地目标。**备份和它的源不能同生共死。**

## 3. 恢复演练（这一步没做过，就不能说"有备份"）

恢复的目标不是"能起容器"，而是**"数据回来了，而且和上传文件是配对的"**。以下用做法 A 的产物举例：

```sh
BK=/opt/renovation-backup/<选定的时间戳>
sudo docker stop renovation-app

# ① 还库：把快照写回 db 卷（覆盖前先备份当前卷，万一选错归档还能回头）
sudo docker run --rm -v renovation_db:/db -v "$BK/db:/src" alpine:latest \
  sh -c 'cp -a /db /db.before-restore; cp /src/dev.db /db/dev.db'
# 清掉可能残留的 WAL，避免旧 -wal 覆盖刚还原的主库
sudo docker run --rm -v renovation_db:/db alpine:latest sh -c 'rm -f /db/dev.db-wal /db/dev.db-shm'

# ② 还原上传文件（与上面同一时间点）
sudo docker run --rm -v renovation_uploads:/up -v "$BK:/src" alpine:latest \
  sh -c 'rm -rf /up/*; tar -xzf /src/uploads-*.tgz -C /up'

sudo docker start renovation-app
```

**验收判据（三条都要过，缺一不算恢复成功）**：

1. 经口令入口能打开 `/projects`、`/finance`、`/dashboard`，历史项目、金额、台账都在（对着备份时间点的记忆或另一份导出核对）。
2. 打开一条带附件的记录（变更单附件 / 验收证据 / 设计交付），**点进去文件能下载或预览**——这一条专测 db 与 uploads 是否配对。
3. 写一条测试变更单到 `client_confirmed`、看金额进口径，再撤销确认、看金额摘出（顺带验证 §4.6 与本次新加的撤销闭环在生产库上正常）；测完撤销测试数据或从冷备重来。

> 恢复后若页面打不开或金额缺失：先核对 db 与 uploads 是否取自**同一个 `$BK`**，再看 `docker logs renovation-app` 有无 migrate 报错，最后看 `PLATFORM_GATE`/`CADDY_*` 是否被这次还原带乱（Caddy 口令走的是环境变量与 `caddy_data` 卷，不在本流程动它）。

## 4. 与部署的关系

- `dev.db` 首启会跑 `prisma migrate deploy`（见 Dockerfile / nas-deploy）。**还原一份比当前代码 schema 更旧的 db 时，启动会自动前滚迁移**；反向（还原比代码新的 db）不支持——恢复归档时优先选**与当前部署同轮或更新**的那份。
- §4.6 的 `m13b` 回填、M13 迁移等都是**幂等**的，恢复历史库后重新起服务不会二次伤害，但回填判据依赖 `createdAt < 上线时刻`，恢复到**回填之后**的归档即可，不必再关心。

## 5. 已知边界（登记，未擅自实现）

- **没有异地/离线冷备**：目前归档都在 NAS 本机另一目录/另一盘，机器整机故障（含勒索、盘阵损坏）救不回来。真正上生产前，至少加一份异地或对象存储副本。
- **没有定时化**：`/opt/renovation-backup` 里的日备需要有人或极空间计划任务触发（见 §6）。
- **P4 多用户前的数据边界**：备份能防丢，但防不了"改错了"——误改走归档/撤销（§4.3/§4.6），误删（平台无硬删入口）与库级损坏走本文件。

## 6. 下一步（本轮未做，仅登记）

体检报告建议把备份做成可执行、并演练过一次。本轮按 HAE 决定只交付本流程文档。落地脚本时，新增 `deploy/nas-backup.sh`（纯 docker CLI，风格对齐 `nas-deploy.sh`：`set -e`、绝对路径、不依赖 `~`、凭据不入库），把 §1–§3 固化成 `backup` / `restore <归档>` / `verify` 三个子命令，并把恢复验收写进 `scripts/verify-*.mjs` 可断言的部分（如"归档 db 文件存在且 `PRAGMA integrity_check` = ok"）。
