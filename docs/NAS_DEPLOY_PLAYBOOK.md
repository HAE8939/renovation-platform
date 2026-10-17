# NAS 部署执行手册（AI 操作者 playbook）

> **这份文档解决什么**：从 Windows 宿主（QoderWork 沙箱外）**一键驱动**极空间 NAS 的部署，含两类更新——**纯配置更新（不重建镜像，秒级）** 与 **代码变更重建（走完整 build，十几分钟）**，并固化跨两轮真实踩过的坑。
> 与 `docs/INTERNAL_DOCKER_RUNBOOK.md` 互补：那份讲「应用运行方式」（刻意不含凭据），这份讲「我下次怎么亲手把它部署上去」。
> **冷启动先读这里**，别再回聊天问「NAS 怎么连 / 部署卡哪了」——全在下面。

维护：每次改 `Dockerfile` / `deploy/nas-deploy.sh` / NAS 环境事实后，同步回写本文件。

---

## 0. 先分流，再执行（别把配置更新当代码更新跑全量 build）

**每次更新先问一句：这次改动要不要重建镜像？** 决定走哪条路（详见 §3）：

| 档 | 触发条件 | 路径 | 耗时 |
|---|---|---|---|
| **A · 纯配置更新** | 只改挂载文件 `Caddyfile`、或容器 env（`PLATFORM_GATE`/`BOOTSTRAP_*`/`CADDY_PORT`/`DATABASE_URL`），**未碰** `src/`、`prisma/`、`Dockerfile`、依赖 | 推文件 + `docker restart`/重建**容器**，**不 build** | 秒~分钟级 |
| **B · 代码变更重建** | 改了进镜像的任何东西（源码、schema、迁移、seed、Dockerfile、依赖） | 全量铺代码 + 完整 `nas-deploy.sh` 重建 | 约 **15–25 分钟** |

> 真实教训：取消口令那次（2026-10-17），改动只是 `Caddyfile`（挂载文件）+ `PLATFORM_GATE`（run env）——属 **A 档**，却被按部就班跑了整套 `nas-deploy.sh` 全量 build，白等约 20 分钟。**判档要准。**

**B 档一句话流程**：Windows 仓库根 → `git archive`（**强制 LF**）铺到 NAS `/opt/renovation-platform` → 三件套去 CR 校验为 0 → `sudo -n sh deploy/nas-deploy.sh`（**先 build 后停旧容器**）→ 轮询到 `app healthy` → 验收。**卷数据全程不动，旧服务在新镜像 build 成功前不受影响。**

---

## 1. 前置事实速查表（已实测核对，非推断）

| 项 | 值 |
|---|---|
| NAS 局域网 IP | `192.168.1.135` |
| SSH 端口 | **`10000`**（不是 22） |
| SSH 登录账号 / 密码 | **明文真源 = `_scratch/deploy/nas-ssh.local.md`**（gitignore 排除，本文件不复制）。账号在 `sudo` 组，`sudo -n` 免密可用（已实测 `sudo_rc=0`） |
| 宿主 SSH 用户名占位 | 下文命令用 `NAS_USER`，取值见上面那份文件 |
| NAS 上仓库路径 | `/opt/renovation-platform` |
| **⚠ NAS 仓库是不是 git 仓库** | **不是**（实测 `GIT=no`，整包放的）→ **不能 `git pull`，必须 `git archive` 铺文件** |
| 应用容器 / 反代容器 | `renovation-app` / `renovation-caddy` |
| docker 网络 / 三个卷 | `renovation` / `renovation_db`、`renovation_uploads`、`renovation_logs`（另 `caddy_data`、`caddy_config`） |
| 对外访问 | `http://192.168.1.135:8181`（应用不发布端口，只经 Caddy:8181→80） |
| 口令保护 | **已取消**（2026-10-17 拍板，内网测试期）。`PLATFORM_GATE=off`，启动日志里那条 `[accessGate]` 告警是**预期**、不是错误 |
| 架构 | **aarch64（ARM）**，Next build 慢，**B 档完整 build 约 15–25 分钟**（NAS 网速慢、pnpm store 缓存不命中时会全量重下） |
| docker 权限 | 需 **sudo**（`sudo -n`，非交互免密已验证） |
| 部署入口脚本 | `deploy/nas-deploy.sh`（纯 docker CLI，该机**无 compose**；**脚本总是先 build，A 档快路径别跑它**） |

---

## 2. 一次性准备（Windows 宿主侧，通常已就绪）

1. **宿主只有 `ssh`，没有 `sshpass`/`plink`/`expect`** → 密码式非交互登录靠 OpenSSH 的 askpass 机制。
2. 凭据三件套（全在 `_scratch/deploy/`，被 `.gitignore:61:_scratch/` 排除，**已用 `git check-ignore` 验证**）：
   - `nas-ssh.local.md` — 你给的原始凭据（用户/密码/IP/端口）
   - `nas-pass.txt` — 纯密码一行（`chmod 600`）
   - `nas-askpass.sh` — 把 `nas-pass.txt` 吐给 ssh 的助手
3. **若这三件丢了**，重建（密码从 `nas-ssh.local.md` 抄，别贴进聊天/commit）：
   ```bash
   DIR="E:/19 Python File/renovation-platform/_scratch/deploy"; mkdir -p "$DIR"
   printf '%s' '把nas-ssh.local.md里的管理员密码填这里' > "$DIR/nas-pass.txt"
   cat > "$DIR/nas-askpass.sh" <<'EOF'
   #!/bin/sh
   cat "$(dirname "$0")/nas-pass.txt"
   EOF
   chmod 600 "$DIR/nas-pass.txt"; chmod +x "$DIR/nas-askpass.sh"
   ```
4. **每次执行部署命令前**先设这三个环境变量（让 ssh 自动取密码，密码不进命令文本）：
   ```bash
   DIR="E:/19 Python File/renovation-platform/_scratch/deploy"
   export SSH_ASKPASS="$DIR/nas-askpass.sh"
   export SSH_ASKPASS_REQUIRE=force
   export DISPLAY=:0            # 部分构建要求 DISPLAY 非空才启用 askpass
   ```
   SSH 通用参数：`-p 10000 -o StrictHostKeyChecking=accept-new -o ConnectTimeout=12`
   （`known_hosts` 已有 `192.168.1.135` 指纹；首次仍带 `accept-new` 兜底。）

> 这些命令都在 **QoderWork 沙箱外（宿主）** 执行，需要 `sandbox_permissions=require_escalated`——沙箱读不到 `C:\Users\huaiw\.ssh` 与 `_scratch` 真实宿主路径。

---

## 3. 标准更新部署流程（照抄，替换 `NAS_USER`）

### 3A · A 档快路径（纯配置更新，不重建镜像）

**前提**：只改了 `Caddyfile`（:ro 挂载）或 app 容器的 env（`PLATFORM_GATE`/`BOOTSTRAP_*`/`CADDY_PORT`/`DATABASE_URL`），**镜像代码没变**。别跑 `nas-deploy.sh`（它固定先 build）。

- **只改 Caddyfile**（如调反代/encode/路由，最常见）：
  ```bash
  # 推新 Caddyfile（PowerShell 不支持 <，用 cmd 批处理做重定向，见 §4-11）
  cmd /c 'ssh -p 10000 NAS_USER@192.168.1.135 "cat > /opt/renovation-platform/Caddyfile" < Caddyfile'
  ssh -p 10000 NAS_USER@192.168.1.135 'sudo docker restart renovation-caddy'
  ```
- **改了 app 的 env（如 `PLATFORM_GATE`）**：镜像不变，按新 env 重建 app 容器即可（参数照 `nas-deploy.sh` 第 4 步的 `docker run`，只是 env 换成新值）。`stop → rm → run` 秒级；数据卷照挂 `-v renovation_db:/app/prisma-data` 等。**改 env 后务必仍走 A 档重建容器，否则新值不生效。**
- 验收：见 §5（A 档不需要看迁移/seed 行，只看目标行为变化 + 关键页 200）。

### 3B · B 档完整重建（代码变了才需要）

#### 第 1 步 · 同步新代码到 NAS（**强制 LF，别再污染**）
在 Windows 仓库根执行：
```bash
cd "E:/19 Python File/renovation-platform"
git -c safe.directory="E:/19 Python File/renovation-platform" \
    -c core.autocrlf=false -c core.eol=lf \
    archive --format=tar HEAD | \
ssh -p 10000 -o StrictHostKeyChecking=accept-new NAS_USER@192.168.1.135 \
  'sudo tar -x -C /opt/renovation-platform && echo SYNC_OK'
```
> 为什么必带 `-c core.autocrlf=false -c core.eol=lf`：见第 4 节 CRLF 坑——**这是该轮第一次 build 失败的唯一根因**。
> **另一种铺法**（另一会话实测）：直接 `tar` 本机工作树、排除 `node_modules .next .git _scratch .env`（保留 NAS 自己的 `.env`）后 `| ssh "tar -x"`。二者等价；**无论哪种，落地后必须做第 2 步 CR 校验**（本机工作树的 `.sh` 在 autocrlf 下也可能已是 CRLF）。
> **只推个别文件**用 `ssh "cat > 远端" < 本地`（PowerShell 不支持 `<` → 走 `cmd /c` 批处理，见 §4-11）。

#### 第 2 步 · 三件套就地兜底去 CR + 校验为 0（**校验不过就别 build**）
```bash
for f in deploy/nas-deploy.sh Dockerfile Caddyfile; do
  ssh -p 10000 NAS_USER@192.168.1.135 \
    "sudo tr -d '\r' < '/opt/renovation-platform/$f' > '/opt/renovation-platform/$f.lf' && sudo mv '/opt/renovation-platform/$f.lf' '/opt/renovation-platform/$f'"
done
# 期望三个都是 0
for f in deploy/nas-deploy.sh Dockerfile Caddyfile; do
  printf '%s CR=' "$f"; ssh -p 10000 NAS_USER@192.168.1.135 \
    "sudo tr -cd '\r' < '/opt/renovation-platform/$f' | wc -c"
done
```

#### 第 3 步 · 后台启动部署（**独占时间戳日志，别复用 `deploy8.log`**）
```bash
ssh -p 10000 NAS_USER@192.168.1.135 '
cd /opt/renovation-platform
LOG="deploy_$(date +%s).log"
echo "$LOG" > .current_deploy_log
nohup sudo -n sh deploy/nas-deploy.sh </dev/null >"$LOG" 2>&1 &
echo "STARTED=$! LOG=$LOG"'
```
脚本内 `set -e` + 「先 build 后停旧」顺序 → **build 失败会在第 2 步退出，根本不碰线上容器**。

#### 第 4 步 · 轮询到 `app healthy`（sleep 到接近完成再查，省往返）
```bash
LOG=$(cat /opt/renovation-platform/.current_deploy_log)
grep -aoE "Step [0-9]+/36|── [0-9]/6|Successfully tagged [^ ]+|app healthy|ERROR|failed|Killed" "/opt/renovation-platform/$LOG" | tail -8
sudo docker ps --filter name=renovation --format "{{.Names}} | {{.Status}}"
```
看到 `Successfully tagged renovation-platform:internal` → `app healthy` → 两容器 `Up ... (healthy)` 即完成。

---

## 4. 已知致命坑（均在真实部署/更新轮踩过，别再踩；标「另一会话」者来自 `mvc481kfk6gge96b`）

1. **CRLF 污染（最重，会让 build 从第 19 行就崩）**
   - 症状：`deploy/nas-deploy.sh: 19: set: Illegal option -`（`set -e` 后吃 `\r`）；且 `Dockerfile` 带 CRLF 时 `RUN apt-get ...` 因行尾 `\r` 失败。
   - 根因：Windows 宿主 `git core.autocrlf=true` → `git archive` 按 checkout 规则把文本 LF 转成 **CRLF** 落到 NAS（仓库 blob 本身是纯 LF、没问题；污染只在传输这层发生）。
   - 解法：第 1 步 `archive` 带 `-c core.autocrlf=false -c core.eol=lf`；第 2 步对 `nas-deploy.sh/Dockerfile/Caddyfile` 就地 `tr -d '\r'` 并校验 `wc -c`==0 才允许 build。
   - **根治（待办，见第 7 节）**：仓库加 `.gitattributes`。

2. **`/opt/renovation-platform` 不是 git 仓库** → 任何「先 ssh 再 `git pull`」的想法都错。只能 `git archive` 铺文件（scp 也不可用，见下）。

3. **`scp` 不可用**（sshd 关了 sftp 子系统，`subsystem request failed`）→ 传文件一律 `ssh "cat > 目标" < 本地` 或 `git archive | ssh tar -x`。

4. **`/tmp` 会被周期性清空** → 部署日志写持久目录 `/opt/renovation-platform/`（本手册用 `deploy_<ts>.log` + `.current_deploy_log` 指针）。

5. **别复用固定日志名（如 `deploy8.log`）** → 上一轮某次失败输出留在里面会串味，误判「新 build 没启动」。用时间戳独占文件名。

6. **该机是 legacy `docker build`（36 步传统输出），不是 BuildKit** → `pgrep buildkit` 搜不到属正常，搜 `docker build` 才对。

7. **docker 全需 sudo**；脚本以 root 跑（`sudo -n sh deploy/nas-deploy.sh`），文件属 root 的操作（去 CR、tar 解到 root 目录）也必须带 sudo。

8. 沙箱内 git 报 `dubious ownership` → 内联 `git -c safe.directory=<path>`（不落任何持久配置）。

9. **A 档被误跑成 B 档**（取消口令那次实测）：改动只是挂载 `Caddyfile` + run env，却整跑 `nas-deploy.sh` 触发 20 分钟全量 build。**先按 §0 判档**，纯配置走 §3A。

10. **完整 build 比想象久**：ARM 上 `pnpm install` 常 `resolved 373, reused 0`（store 缓存不命中→从 npmjs 全量重下，NAS 网仅 ~16 KiB/s，还会重试大包），加 supply-chain 检查 + Next 生产构建，单轮约 15–25 分钟。轮询别设太短。

11. **Windows 宿主是 PowerShell 不是 bash**（另一会话连踩）：① PowerShell **不支持 `<` 重定向** → 单文件推送用 `cmd /c 'ssh ... "cat > 远端" < 本地'`；② 每个 Bash 工具调用是**新进程**，上一次 `$env:SSH_ASKPASS=...` **不跨调用保留** → 把 `SSH_ASKPASS`/`SSH_ASKPASS_REQUIRE`/`DISPLAY` 三行 `set` 写进 `.cmd` 批处理**内部**再 `cmd /c 跑它`；③ `sudo` 若被要求密码，用 §2 的 askpass（本机实测 `sudo -n` 免密更省事）。

12. **含密码临时件用完即清**（若走临时目录 `%TEMP%\qwenwork\*.cmd` 那套 askpass）：跑完 `host_safe_delete` 逐个删、路径写死（删目标含 `%TEMP%` 这类环境变量会被工具拒，要求先列具体路径）。本 playbook 默认把凭据留在 `_scratch/deploy/`（持久、gitignore、按你「你知道就行」不清）——两种策略二选一，别混。

---

## 5. 部署后验收清单（本轮全绿，可作基线）

```bash
LOG=$(cat /opt/renovation-platform/.current_deploy_log)
# ① 运行时 CMD 四段都留了痕
sudo docker logs renovation-app 2>&1 | grep -aiE "Applying migration|m14|工序模板|引导完成|Ready|accessGate"
# ② 关键页经 Caddy 全 200
for p in / /projects /design /schedule/templates /finance /api/health; do
  printf "%-20s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8181$p"; done
# ③ 健康体
curl -s http://127.0.0.1:8181/api/health      # 期望 {"ok":true,...}
# ④ 工序模板库不再空壳
curl -s http://127.0.0.1:8181/schedule/templates | grep -aoE "暂无模板数据|工序模板库|拆除工程|竣工清洁" | sort -u
```
期望：日志出现 `Applying migration ...m14_backfill_actual_end`、`工序模板引导完成：新增 33 ...合计 33`、`引导完成 · organizations=1 users=1`、`Ready in ...`；六个路径 200；`/api/health` `{"ok":true}`；模板页有「拆除工程/竣工清洁」**且无「暂无模板数据」**。

> 启动日志里 `[accessGate] PLATFORM_GATE 未置为 on` 是**预期**告警（口令已取消），非错误。

> **A 档验收补充**：从**本机**（不在 NAS 上）直连 `http://192.168.1.135:8181/projects`、`/`、`/api/health` 应无口令直接 200（PowerShell：`Invoke-WebRequest -Uri ... -UseBasicParsing`）。取消口令那次就是这么双端确认的。

---

## 6. 回退

- **容器/镜像层**（不碰数据卷）：老镜像 `renovation-platform:internal` 被新 build 覆盖 tag；如需回退到旧 commit，把对应 commit 重新 `git archive` 铺过去再跑第 3 步。NAS 上的旧 `deploy*.log` 可佐证历史。
- **数据卷**：`renovation_db`/`renovation_uploads`/`renovation_logs` 全程未动；真出事照 `docs/BACKUP_RESTORE.md` 从 `/opt/renovation-backup/` 恢复（db 与 uploads 必须成对恢复）。
- **新迁移是幂等回填**：`m14_backfill_actual_end` 只补 `NULL`、不覆盖已有自洽值；`seed-templates.mjs` 按 `(tier,order)` upsert——重跑安全。

---

## 7. 待办（建议根治，尚未落地，需 HAE 拍板）

- **给仓库加 `.gitattributes`**，从根上杜绝 Windows 端 `git archive`/checkout 把关键文件带 CRLF：
  ```
  *.sh            text eol=lf
  Dockerfile      text eol=lf
  Caddyfile       text eol=lf
  ```
  这是本轮第一次 build 失败的可预防根因。（属额外仓库改动，没擅自提交。）

---

## 8. 安全红线（不可破）

- NAS SSH 账号/密码的**明文只存在于 `_scratch/deploy/`**（gitignore 排除），**绝不进 Git、绝不进镜像、绝不贴进 commit message / PR / 聊天 / 本文件**。本文件对用户名也做了占位（`NAS_USER`）——真值只去那份 gitignore 文件取。
- 写入任何凭据副本前，先 `git check-ignore -v <path>` 确认该路径确实被忽略。
- 恢复口令保护时参照 git 历史 + `AGENTS.md` §7.1 旧口径（Caddyfile basic_auth 块形式、`PLATFORM_GATE=on`、`.env` 的 `CADDY_USER`/`CADDY_HASH`）。
