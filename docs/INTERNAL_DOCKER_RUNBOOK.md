# NAS 内测 Docker 运行手册

这份手册只描述应用运行方式，不包含 SSH 地址、密码或 token。口令哈希也不写进本仓库——它属于部署环境。

本版随 M13 收口更新：应用**不再直接暴露 3000 端口**，唯一入口是带口令的 Caddy；新增空库自动引导；补了变更单金额口径的升级注意事项。

## 0. 一次性准备：生成访问口令

平台装着 HR 与财务数据，内测期用反向代理口令挡住全内网（口径见 `AGENTS.md` §7.1）。在有 Docker 的机器上执行：

```sh
docker run --rm caddy:2 caddy hash-password --plaintext '你的口令'
```

把输出与用户名写进项目目录下的 `.env`（该文件已被 gitignore，不要提交）：

```
CADDY_USER=ming
CADDY_HASH=<上面那串 $2a$14$...>
```

多人各用独立账号时（这样操作流水才能区分到人），改 `Caddyfile` 的 `basic_auth` 为块形式，一行一个「用户名 哈希」：

```
basic_auth {
    ming   $2a$14$...
    li     $2a$14$...
}
```

同时 `prisma/bootstrap.mjs` 建的那个账号名要与口令用户名对得上——流水按 `User.name` 匹配真人，对不上就退回占位口径。

**忘记配 `CADDY_USER` / `CADDY_HASH` 时 Caddy 会启动失败**，这是有意设计：宁可起不来，也不要"忘了配口令＝全站敞开"变成没人发现的默认态。

## 1. 首次启动

```sh
docker compose -f compose.internal.yml up -d --build
docker compose -f compose.internal.yml ps        # app 与 caddy 都应为 healthy/running
curl -fsS http://127.0.0.1:8080/api/health       # 经 Caddy，会要口令（401 即证明闸有效）
```

员工访问地址是 **`http://<NAS 地址>:8080`**，不是 3000。`app` 服务不发布端口，只有 Caddy 可达它。

启动顺序里容器自动做三件事，都不需要人工干预：

1. `prisma migrate deploy` —— 前滚迁移，不重置数据
2. `node prisma/bootstrap.mjs` —— 空库时补最小骨架（默认组织 + 一个 boss 账号），幂等、**不灌任何演示数据**
3. `node server.js`

打开 `http://<NAS>:8080/` 即可开始建客户与项目。**不要对真实库跑 `pnpm db:seed`** —— 那会灌进演示客户、假台账与示例线索，和真实经营数据混在一起很难事后分辨。

## 2. 三个必须备份的数据卷

- `renovation_db`：SQLite 数据库与 Prisma 迁移后的业务事实
- `renovation_uploads`：Logo、设计交付物、变更附件、验收证据
- `renovation_logs`：应用错误现场日志

另有 `caddy_data` / `caddy_config` 两个 Caddy 自管卷，体积很小，重建代价低，不必纳入常规备份。

数据库和上传文件**必须成对备份**。只恢复数据库会留下打不开的附件记录，只恢复上传目录会留下无主文件。

## 3. 日常操作

```sh
docker compose -f compose.internal.yml logs --tail=200 app
docker compose -f compose.internal.yml logs --tail=100 caddy
docker compose -f compose.internal.yml restart app
docker compose -f compose.internal.yml down
```

升级：先备份三个数据卷，再 `up -d --build`。

**升级前必看（M13 变更单口径）**：`m13` 给变更单加了确认状态机，而它的重建语句漏带了 `status` 列，导致存量变更单会掉成"草稿"、其金额从毛利与应收里静默消失。`m13b_backfill_change_status` 会自动把**上线前已存在**的变更单回填为已确认。因此：

- 若目标库的 `change_orders` 里有真实数据，升级后先核对一次「项目详情 → 累计变更 / 毛利」与历史对账单是否一致，再让员工继续录入。
- 已确认的变更单**不可编辑、不可删除**（这是有意的守卫，防止已算进账的金额被无痕抹掉）。若发现有录错的，先登记，别直接改库——纠正路径需要产品决策（`AGENTS.md` §4.6 已登记该缺口）。

## 4. 内测验收（六步，前三步是新增的）

1. **闸生效**：不输口令直接访问 `http://<NAS>:8080/hr` → 应被 Caddy 要口令；绕过 Caddy 直连 `http://127.0.0.1:3000/hr` 在本机应连不上（应用未发布端口）。
2. **身份进流水**：用口令登录后在 `/hr` 新增一条责任关系，到「项目中心 → 项目动态」查这条流水，操作人应是该口令用户名对应的账号，而不是「本机用户」。
3. **变更单金额只在确认后变化**：预算变更页新建草稿 → 项目金额不变；提交确认 → 仍不变；登记客户确认 → 金额才变。
4. 打开首页平台介绍与 `/hr`，建一条工作记录；归档它，确认列表出现"另有 N 条已归档未列出"的提示。
5. 在设计任务上传 PDF 或图片，刷新后检查版本历史能下载文件。
6. **重启容器**，确认数据库、上传文件和错误日志都还在（这一步验证卷挂载真的生效）。

## 5. 已知边界（内测期就这样，别当 bug 报）

- 应用层闸默认 `PLATFORM_GATE=on`（compose 里已设）。若在**本机** `pnpm dev` 开发，不需要设——闸默认关，不打断开发；启动日志里那条 `[accessGate]` 警告就是在提醒"当前无保护"。
- 内测期没有角色权限：能登录的人能看到并修改全部模块。真 RBAC 属 P4。
- 未做 HTTPS。内网明文传口令是可接受的过渡，一旦要对公网开放就必须先补 TLS（属 P3）。
- `/uploads/*` 走 uuid 文件名、不可枚举，但**不做授权校验**——拿到链接即可访问。需要按项目控制可见范围时，这属于 P4 一起做的事。
