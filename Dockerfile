FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=file:/tmp/build.db
# standalone 按需启用（见 next.config.mjs：Windows 本机因 symlink 权限跑不完这一步）
ENV BUILD_STANDALONE=1
RUN pnpm prisma generate
RUN pnpm build
# 双保险：主保险是 .dockerignore 排除 .env；这里再确保 tracing 若仍带进来就不进最终镜像
RUN rm -f /app/.next/standalone/.env /app/.next/standalone/.env.*

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next standalone 的 server.js 以 process.env.HOSTNAME 作监听地址，而 Docker 会注入
# HOSTNAME=<容器ID>；显式钉死，别把服务绑到意料之外的地址上。
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/prisma-data/dev.db
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
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
# 三段各有理由：
#   migrate deploy  只做前滚，不重置数据（旧卷升级即靠它 + m13b 回填存量变更单）
#   bootstrap       空库补最小骨架（组织 + boss 账号），幂等且不灌演示数据
#   exec node       让 node 成为 PID1；否则 SIGTERM 落在 sh 上不转发，10s 后 SIGKILL 可能打断 SQLite 写入
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node prisma/bootstrap.mjs && exec node server.js"]
