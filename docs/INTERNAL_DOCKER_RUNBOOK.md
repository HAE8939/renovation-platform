# NAS 内测 Docker 运行手册

这份手册只描述应用运行方式，不包含 SSH 地址、密码或 token。连接 NAS 时继续使用本机已有的人工连接说明。

## 首次启动

在 NAS 上准备项目目录后执行：

```sh
docker compose -f compose.internal.yml up -d --build
docker compose -f compose.internal.yml ps
```

应用监听 NAS 的 `3000` 端口。内网反向代理只需要转发到 `app:3000`，暂不开放公网。

## 三个必须备份的卷

- `renovation_db`：SQLite 数据库与 Prisma 迁移后的业务事实
- `renovation_uploads`：Logo、设计交付物、变更附件及后续文件资产
- `renovation_logs`：应用错误现场日志

数据库和上传文件必须成对备份。只恢复数据库会留下无法打开的附件记录，只恢复上传目录会留下无主文件。

## 日常操作

```sh
docker compose -f compose.internal.yml logs --tail=200 app
docker compose -f compose.internal.yml restart app
docker compose -f compose.internal.yml down
```

升级时先备份三个卷，再执行 `up -d --build`。容器启动时会自动执行 `prisma migrate deploy`，不会重置已有数据。

## 内测验收

1. 打开首页平台说明和 `/hr`，创建一条工作记录。
2. 在预算变更页新建草稿，提交确认，再登记客户确认，检查项目金额只在确认后变化。
3. 在设计任务上传 PDF 或图片，刷新后检查版本历史能下载文件。
4. 重启容器，确认数据库、上传文件和错误日志仍存在。
