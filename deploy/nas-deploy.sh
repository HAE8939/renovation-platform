#!/bin/sh
# deploy/nas-deploy.sh —— 极空间 NAS 内测部署（纯 docker CLI，不依赖 compose）
#
# 为什么需要这个脚本而不是直接用 compose.internal.yml：
# 极空间 Z0220021 上只有 docker 引擎与 CLI（26.1.4），**没有 docker compose**——面板的
# 「编排容器」是它自己调 Docker HTTP API，不是 compose。而该机型是 aarch64，官方
# docker/compose 镜像给的是 amd64 的 v1 二进制（装上也跑不起来，实测已排除）。
# 所以在这台机器上，本脚本就是部署入口；compose.internal.yml 保留给有 compose 的环境。
# 两者是**等价关系**，改一个必须同步另一个（网络/卷/端口/环境变量逐项对齐）。
#
# 跑法（在仓库根目录，需要 root 权限操作 docker）：
#   sh deploy/nas-deploy.sh              首次部署或更新（幂等，可反复跑）
#   sh deploy/nas-deploy.sh status       看状态与访问地址
#   sh deploy/nas-deploy.sh logs         跟应用日志
#
# 前置：同目录 .env 已不再是必需（2026-10-17 取消口令保护，CADDY_USER/HASH 不再使用）。
# 可选项只剩 CADDY_PORT（默认 8181）与 BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_EMAIL。

set -e

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

IMAGE=renovation-platform:internal
NET=renovation
APP=renovation-app
PROXY=renovation-caddy
V_DB=renovation_db
V_UP=renovation_uploads
V_LOG=renovation_logs
ENV_FILE=${ENV_FILE:-$ROOT/.env}

S() {
  # 本脚本需以 root 运行（docker.sock 权限）；若用 sudo 起，内部命令继承特权。
  docker "$@"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "ℹ 无 $ENV_FILE —— 可选；口令保护已取消（2026-10-17）。如需自定义 CADDY_PORT / BOOTSTRAP_ADMIN_* 再创建。"
fi

# 逐行读取 KEY=VALUE，**不做变量展开**（保留历史坑位说明：bcrypt 哈希曾被 shell 展开）。
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key=${line%%=*}
    val=${line#*=}
    [ "$key" = "$line" ] && continue          # 没有 = 的行跳过
    export "$key=$val"                        # 引号包住，val 里的 $ 原样保留
  done < "$ENV_FILE"
fi
PORT=${CADDY_PORT:-8181}
# 无 Caddy 口令后流水不再能区分到人（测试期接受）；boss 引导名默认 admin。
ADMIN_NAME=${BOOTSTRAP_ADMIN_NAME:-admin}
ADMIN_EMAIL=${BOOTSTRAP_ADMIN_EMAIL:-admin@renovation.local}

case "${1:-up}" in
  status)
    S ps --filter "name=renovation-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    echo "员工访问地址： http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
    exit 0
    ;;
  logs)
    exec S logs -f --tail=200 "$APP"
    ;;
  up)
    ;;
  *)
    echo "用法：sh deploy/nas-deploy.sh [up|status|logs]"
    exit 2
    ;;
esac

echo "── 1/6 网络与数据卷（幂等）──"
S network inspect "$NET" >/dev/null 2>&1 || S network create --driver bridge "$NET" >/dev/null
for v in "$V_DB" "$V_UP" "$V_LOG"; do
  S volume inspect "$v" >/dev/null 2>&1 || S volume create "$v" >/dev/null
done
echo "   网络 $NET 与三个卷就绪（卷数据落在 docker data-root，不受本目录影响）"

echo "── 2/6 构建镜像（aarch64；Next 构建约占 1–2G 内存）──"
S build -f Dockerfile -t "$IMAGE" .

echo "── 3/6 停旧容器（首次部署时不存在，忽略）──"
S stop "$PROXY" "$APP" >/dev/null 2>&1 || true
S rm -f "$PROXY" "$APP" >/dev/null 2>&1 || true

echo "── 4/6 启动应用（刻意不发布任何端口：外部只能经 Caddy 进来）──"
# --network-alias app 是必需的：Caddyfile 里写的是 `reverse_proxy app:3000`，
# 因为 compose 会把服务名 `app` 自动注册成网络别名；而 docker run --name renovation-app
# 只给 `renovation-app` 这个名字，不加 alias 的话 Caddy 解析不到 → 全线 502（NAS 实测）。
S run -d --name "$APP" --restart unless-stopped --network "$NET" --network-alias app \
  -e NODE_ENV=production -e PORT=3000 -e HOSTNAME=0.0.0.0 \
  -e DATABASE_URL=file:/app/prisma-data/dev.db \
  -e PLATFORM_GATE=off \
  -e BOOTSTRAP_ADMIN_NAME="$ADMIN_NAME" \
  -e BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" \
  -v "$V_DB:/app/prisma-data" \
  -v "$V_UP:/app/public/uploads" \
  -v "$V_LOG:/app/logs" \
  --health-cmd 'node -e "fetch(\"http://127.0.0.1:3000/api/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  --health-interval=30s --health-timeout=5s --health-retries=5 --health-start-period=60s \
  "$IMAGE" >/dev/null

echo "── 5/6 等应用健康（migrate deploy + bootstrap 要时间）──"
i=0
while [ $i -lt 60 ]; do
  st=$(S inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo starting)
  [ "$st" = healthy ] && { echo "   app healthy"; break; }
  [ "$st" = unhealthy ] && { echo "   ✗ app unhealthy，日志尾部："; S logs --tail=30 "$APP"; exit 1; }
  i=$((i+1)); sleep 3
done
[ $i -ge 60 ] && { echo "   ✗ 等待超时，日志尾部："; S logs --tail=40 "$APP"; exit 1; }

echo "── 6/6 启动 Caddy（唯一对外入口；口令保护已取消，纯反代）──"
S run -d --name "$PROXY" --restart unless-stopped --network "$NET" \
  -p "$PORT:80" \
  -v "$ROOT/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v caddy_data:/data -v caddy_config:/config \
  caddy:2 >/dev/null

sleep 4
echo
echo "── 结果 ──"
S ps --filter "name=renovation-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "员工访问地址： http://${IP:-<NAS IP>}:$PORT   （已无口令，直接进入）"
echo "自检两条："
echo "  业务页直通：  curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:$PORT/projects → 期望 200（或登录页 3xx）"
echo "  健康端点经 Caddy：curl -s http://127.0.0.1:$PORT/api/health                            → 期望 {\"ok\":true}"
echo "完整六步验收见 docs/INTERNAL_DOCKER_RUNBOOK.md §4。"
