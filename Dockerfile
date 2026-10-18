# 基础镜像两个约束，都是 NAS（aarch64）实测撞出来的，别随意回退：
#  ① 必须 Node 22+：package.json 的 packageManager 钉 pnpm 11.7.0，而 pnpm 11 启动即
#     require('node:sqlite')（Node 22.5+ 才内置）；用 20 会在 pnpm install 第一步抛
#     ERR_UNKNOWN_BUILTIN_MODULE。若确需降 Node，得连 pnpm-workspace.yaml 的 allowBuilds
#     （pnpm 11 语法）一起降。
#  ② 必须 Debian 系（slim）**并且自己装 openssl**：Prisma 5.22 在 arm64 上按探测到的
#     OpenSSL 版本挑引擎，而 alpine 与 slim 都会挑错——alpine(musl) 直接要 libssl.so.1.1；
#     slim 更隐蔽：镜像里 openssl 的 CLI 和 .so 全都没有，探测失败后同样回落到 1.1，
#     运行时报 "libssl.so.1.1: cannot open shared object file"，表现为静态导出阶段
#     /_not-found 渲染 root layout（要查库）时炸。解法是装 openssl + 在 schema 里显式
#     指定 binaryTargets=linux-arm64-openssl-3.0.x，两者缺一不可。
#     x64/Windows 本机走另一套引擎，913 项门禁与本机 build 全绿也照不出这个坑。
FROM node:22-slim AS deps
# Prisma 查询引擎要链接 libssl.so.3；node:22-slim 里 openssl 的 CLI 与 .so 全都没有，
# 所以三个阶段都必须自己装上（runner 不装的话，引擎下对了也照样加载失败）。
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=file:/tmp/build.db
# standalone 按需启用（见 next.config.mjs：Windows 本机因 symlink 权限跑不完这一步）
ENV BUILD_STANDALONE=1
RUN pnpm prisma generate
# 构建期必须先建表：静态导出会渲染 root layout，而它经 branding/theme 调
# platformSetting.upsert()——空库直接抛 P2021“table platform_settings does not exist”，
# 表现为 /_not-found 预渲染失败、整个 build 红掉。本机照不出这一条，是因为它的
# DATABASE_URL 指向有表的 dev.db。这里只建 schema、不灌任何数据。
RUN pnpm prisma migrate deploy
RUN pnpm build
# 双保险：主保险是 .dockerignore 排除 .env；这里再确保 tracing 若仍带进来就不进最终镜像
RUN rm -f /app/.next/standalone/.env /app/.next/standalone/.env.*

FROM node:22-slim AS runner
# 运行阶段同样需要 openssl：查询引擎是动态链接 libssl.so.3 的，缺它就报加载失败。
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next standalone 的 server.js 以 process.env.HOSTNAME 作监听地址，而 Docker 会注入
# HOSTNAME=<容器ID>；显式钉死，别把服务绑到意料之外的地址上。
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/prisma-data/dev.db
RUN groupadd -r nodejs -g 1001 && useradd -r -u 1001 -g nodejs -d /app -s /bin/sh nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# 已知可优化项，有意暂不动：整份 node_modules（含 typescript/eslint/tailwind/tsx 等构建期依赖，
# 本机约 691MB）随镜像分发是偏重的。改成只靠 standalone 自带依赖 + 单独一层 prisma CLI 能省到
# 约 90MB，但 Prisma 查询引擎能否被 outputFileTracingIncludes 完整带出，本机无 Docker 无法验证，
# 猜错的代价是容器起不来。留待有 Docker 的环境验证后再改，见 docs/HEALTH_CHECK_2026-10-14.md。
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
RUN mkdir -p /app/prisma-data /app/public/uploads /app/logs && chown -R nextjs:nodejs /app/prisma-data /app/public/uploads /app/logs
USER nextjs
EXPOSE 3000
# 四段各有理由：
#   migrate deploy    只做前滚，不重置数据（旧卷升级即靠它 + m13b 回填存量变更单）
#   bootstrap         空库补最小骨架（组织 + boss 账号），幂等且不灌演示数据
#   seed-templates    确保工序模板 11×3 存在（业务配置，非演示数据），自愈幂等
#   exec node         让 node 成为 PID1；否则 SIGTERM 落在 sh 上不转发，10s 后 SIGKILL 可能打断 SQLite 写入
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node prisma/bootstrap.mjs && node prisma/seed-templates.mjs && exec node server.js"]
