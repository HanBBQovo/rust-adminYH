#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ci.yml}"
API_IMAGE="${API_IMAGE:-rust-adminyh/admin-api:ci}"
WEB_IMAGE="${WEB_IMAGE:-rust-adminyh/desktop-web:ci}"
DOCKER_REGISTRY_PREFIX="${DOCKER_REGISTRY_PREFIX:-}"

library_image() {
  local image="$1"
  local prefix="$DOCKER_REGISTRY_PREFIX"
  if [[ -n "$prefix" && "$prefix" != */ ]]; then
    prefix="${prefix}/"
  fi
  printf '%s%s' "$prefix" "$image"
}

RUST_IMAGE="${RUST_IMAGE:-$(library_image "rust:1.88-bookworm")}"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-$(library_image "debian:bookworm-slim")}"
NODE_IMAGE="${NODE_IMAGE:-$(library_image "node:22-slim")}"
NGINX_IMAGE="${NGINX_IMAGE:-$(library_image "nginx:1.27-alpine")}"
MYSQL_IMAGE="${MYSQL_IMAGE:-$(library_image "mysql:8.0")}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
API_PORT="${API_PORT:-16824}"
WEB_PORT="${WEB_PORT:-18080}"
MYSQL_PORT="${MYSQL_PORT:-33306}"
API_URL="${API_URL:-http://127.0.0.1:${API_PORT}/api/health}"
WEB_URL="${WEB_URL:-http://127.0.0.1:${WEB_PORT}/}"
WEB_API_URL="${WEB_API_URL:-http://127.0.0.1:${WEB_PORT}/api/health}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rust-adminyh-ci}"
RUN_DOCKER_E2E="${RUN_DOCKER_E2E:-false}"
DOCKER_DAEMON_READY=false
DOCKER_REPORT_DIR=""
if [[ -n "${RELEASE_ARTIFACT_DIR:-}" ]]; then
  DOCKER_REPORT_DIR="$RELEASE_ARTIFACT_DIR/docker"
fi

section() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "ERROR: 需要安装 $name 才能执行 Docker 门禁。"
    exit 127
  fi
}

run_with_timeout() {
  local seconds="$1"
  shift

  python3 - "$seconds" "$@" <<'PY'
import subprocess
import sys

seconds = int(sys.argv[1])
cmd = sys.argv[2:]

try:
    result = subprocess.run(cmd, timeout=seconds)
except subprocess.TimeoutExpired:
    sys.exit(124)

sys.exit(result.returncode)
PY
}

require_docker_daemon() {
  echo "Checking Docker daemon availability..."
  if run_with_timeout 20 docker info >/dev/null 2>&1; then
    DOCKER_DAEMON_READY=true
    return 0
  fi

  local context
  local endpoint
  context="$(docker context show 2>/dev/null || echo unknown)"
  endpoint="$(docker context inspect "$context" --format '{{json .Endpoints.docker.Host}}' 2>/dev/null | tr -d '"' || true)"

  echo "ERROR: Docker daemon 不可用，无法执行 Docker 打包门禁。"
  echo "docker info 在 20 秒内未成功返回，通常表示 Docker Desktop / OrbStack daemon 未启动或已卡死。"
  echo "当前 Docker context: ${context}"
  if [[ -n "$endpoint" ]]; then
    echo "当前 Docker endpoint: ${endpoint}"
  fi
  echo "请先启动 Docker Desktop 或 OrbStack，确认 docker info 可以正常连接后再重跑 scripts/test-docker.sh。"
  exit 125
}

prepull_base_images() {
  local image
  for image in "$RUST_IMAGE" "$RUNTIME_IMAGE" "$NODE_IMAGE" "$NGINX_IMAGE" "$MYSQL_IMAGE"; do
    if docker image inspect "$image" >/dev/null 2>&1; then
      echo "cached ${image}"
      continue
    fi

    echo "pulling ${image}"
    if docker pull "$image"; then
      continue
    fi

    echo
    echo "ERROR: 无法拉取 Docker 基础镜像：${image}"
    echo "这通常是 Docker Hub registry/auth 网络或账号访问问题，不是项目 Dockerfile 编译失败。"
    echo "如本机无法直连 Docker Hub，可临时指定镜像前缀后重跑："
    echo "  DOCKER_REGISTRY_PREFIX=docker.1ms.run/library scripts/test-docker.sh"
    echo "GitHub runner 上如果 job 没有任何 step 日志，需要先检查 Actions billing/spending limit。"
    exit 126
  done
}

port_is_listening() {
  local port="$1"
  (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
}

require_host_ports_available() {
  local port
  for port in "$API_PORT" "$WEB_PORT" "$MYSQL_PORT"; do
    if port_is_listening "$port"; then
      echo "ERROR: Docker gate 需要的本机端口 ${port} 已被占用。"
      echo "请停止占用该端口的服务，或使用 API_PORT / WEB_PORT / MYSQL_PORT 指定备用端口后重跑。"
      echo "例如：API_PORT=16825 WEB_PORT=18081 MYSQL_PORT=33307 scripts/test-docker.sh"
      exit 124
    fi
  done
}

docker_compose() {
  RUST_IMAGE="$RUST_IMAGE" \
  RUNTIME_IMAGE="$RUNTIME_IMAGE" \
  NODE_IMAGE="$NODE_IMAGE" \
  NGINX_IMAGE="$NGINX_IMAGE" \
  MYSQL_IMAGE="$MYSQL_IMAGE" \
  NPM_REGISTRY="$NPM_REGISTRY" \
  API_IMAGE="$API_IMAGE" \
  WEB_IMAGE="$WEB_IMAGE" \
  API_PORT="$API_PORT" \
  WEB_PORT="$WEB_PORT" \
  MYSQL_PORT="$MYSQL_PORT" \
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

redact_url() {
  sed -E 's#(mysql://)[^:@/]+(:)[^@/]+@#\1***\2***@#g'
}

diagnostics() {
  local exit_code=$?
  echo
  echo "ERROR: Docker gate failed with exit code ${exit_code}."
  echo
  section "Docker diagnostics"
  docker version || true
  docker compose version || true
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "compose_file=${COMPOSE_FILE}"
  echo "api_image=${API_IMAGE}"
  echo "web_image=${WEB_IMAGE}"
  echo "rust_base=${RUST_IMAGE}"
  echo "runtime_base=${RUNTIME_IMAGE}"
  echo "node_base=${NODE_IMAGE}"
  echo "nginx_base=${NGINX_IMAGE}"
  echo "mysql_base=${MYSQL_IMAGE}"
  echo "docker_registry_prefix=${DOCKER_REGISTRY_PREFIX:-<none>}"
  echo "npm_registry=${NPM_REGISTRY}"
  echo "api_url=${API_URL}"
  echo "web_url=${WEB_URL}"
  echo "web_api_url=${WEB_API_URL}"
  echo "api_port=${API_PORT}"
  echo "web_port=${WEB_PORT}"
  echo "mysql_port=${MYSQL_PORT}"
  echo "run_docker_e2e=${RUN_DOCKER_E2E}"
  echo "docker_daemon_ready=${DOCKER_DAEMON_READY}"
  echo "database_url=$(printf '%s' "${DATABASE_URL:-mysql://admin_yh:admin_yh@mysql:3306/admin_yh}" | redact_url)"
  echo
  if [[ "$DOCKER_DAEMON_READY" == "true" ]]; then
    docker_compose ps || true
    echo
    docker_compose logs --tail=200 mysql admin-api desktop-web || true
  else
    echo "Docker compose diagnostics skipped because the Docker daemon is unavailable."
  fi
  exit "$exit_code"
}

section "Docker daemon preflight"
require_command docker
require_command python3
require_docker_daemon
if [[ -n "$DOCKER_REPORT_DIR" ]]; then
  mkdir -p "$DOCKER_REPORT_DIR"
fi

trap diagnostics ERR

section "Docker environment"
docker version
docker compose version
echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "compose_file=${COMPOSE_FILE}"
echo "rust_base=${RUST_IMAGE}"
echo "runtime_base=${RUNTIME_IMAGE}"
echo "node_base=${NODE_IMAGE}"
echo "nginx_base=${NGINX_IMAGE}"
echo "mysql_base=${MYSQL_IMAGE}"
echo "docker_registry_prefix=${DOCKER_REGISTRY_PREFIX:-<none>}"
echo "npm_registry=${NPM_REGISTRY}"
echo "api_port=${API_PORT}"
echo "web_port=${WEB_PORT}"
echo "mysql_port=${MYSQL_PORT}"
if [[ -n "$DOCKER_REPORT_DIR" ]]; then
  echo "report_dir=${DOCKER_REPORT_DIR}"
fi

section "Docker cleanup before run"
docker_compose down --volumes --remove-orphans || true

section "Docker host port preflight"
require_host_ports_available

section "Docker base image preflight"
prepull_base_images

section "Docker build admin-api"
docker build \
  --file Dockerfile.admin-api \
  --build-arg RUST_IMAGE="$RUST_IMAGE" \
  --build-arg RUNTIME_IMAGE="$RUNTIME_IMAGE" \
  --tag "$API_IMAGE" \
  .

section "Docker build desktop-web"
docker build \
  --file Dockerfile.desktop-web \
  --build-arg NODE_IMAGE="$NODE_IMAGE" \
  --build-arg NGINX_IMAGE="$NGINX_IMAGE" \
  --build-arg NPM_REGISTRY="$NPM_REGISTRY" \
  --tag "$WEB_IMAGE" \
  .

section "Docker compose up"
docker_compose up -d mysql admin-api desktop-web

section "Health checks"
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error "$API_URL" >/tmp/rust-adminyh-api-health.json 2>/tmp/rust-adminyh-api-health.err; then
    cat /tmp/rust-adminyh-api-health.json
    echo
    break
  fi
  sleep 2
done
curl --fail --silent --show-error "$API_URL" >/tmp/rust-adminyh-api-health.json
cat /tmp/rust-adminyh-api-health.json
echo
curl --fail --silent --show-error "$WEB_URL" >/tmp/rust-adminyh-web-health.html
head -n 5 /tmp/rust-adminyh-web-health.html
echo
ASSET_PATH="$(grep -Eo '(/assets/[^"]+\.(js|css))' /tmp/rust-adminyh-web-health.html | head -n 1)"
if [[ -z "$ASSET_PATH" ]]; then
  echo "ERROR: 未能从 Web 首页发现生产静态资源路径。"
  exit 1
fi
curl --fail --silent --show-error "${WEB_URL%/}${ASSET_PATH}" >/tmp/rust-adminyh-web-asset
echo "asset_ok=${ASSET_PATH}"
curl --fail --silent --show-error "$WEB_API_URL" >/tmp/rust-adminyh-web-api-health.json
cat /tmp/rust-adminyh-web-api-health.json
echo

if [[ -n "$DOCKER_REPORT_DIR" ]]; then
  cp /tmp/rust-adminyh-api-health.json "$DOCKER_REPORT_DIR/api-health.json"
  cp /tmp/rust-adminyh-web-health.html "$DOCKER_REPORT_DIR/web-health.html"
  cp /tmp/rust-adminyh-web-api-health.json "$DOCKER_REPORT_DIR/web-api-health.json"
  docker image inspect "$API_IMAGE" "$WEB_IMAGE" >"$DOCKER_REPORT_DIR/image-inspect.json"
  docker_compose ps --format json >"$DOCKER_REPORT_DIR/compose-ps.json" || docker_compose ps >"$DOCKER_REPORT_DIR/compose-ps.txt"
  cat >"$DOCKER_REPORT_DIR/manifest.txt" <<EOF
commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
compose_project=${COMPOSE_PROJECT_NAME}
compose_file=${COMPOSE_FILE}
api_image=${API_IMAGE}
web_image=${WEB_IMAGE}
rust_base=${RUST_IMAGE}
runtime_base=${RUNTIME_IMAGE}
node_base=${NODE_IMAGE}
nginx_base=${NGINX_IMAGE}
mysql_base=${MYSQL_IMAGE}
api_url=${API_URL}
web_url=${WEB_URL}
web_api_url=${WEB_API_URL}
run_docker_e2e=${RUN_DOCKER_E2E}
EOF
  echo "docker_report_dir=${DOCKER_REPORT_DIR}"
fi

if [[ "$RUN_DOCKER_E2E" == "true" ]]; then
  section "Seed Docker E2E database"
  docker_compose exec -T mysql \
    mysql -uadmin_yh -padmin_yh admin_yh < "$ROOT_DIR/scripts/seed-docker-e2e.sql"

  section "Real API browser E2E"
  (
    cd "$ROOT_DIR/apps/desktop/web"
    PLAYWRIGHT_BASE_URL="${WEB_URL%/}" REAL_API_E2E=true npm run e2e -- e2e/real-api.spec.ts
  )
else
  echo "SKIP: RUN_DOCKER_E2E=true 未设置，跳过 Docker Web + Rust API + MySQL 真实浏览器 E2E。发布前必须执行 RUN_DOCKER_E2E=true。"
fi

section "Docker compose status"
docker_compose ps

section "Docker cleanup"
docker_compose down --volumes --remove-orphans
trap - ERR

echo
echo "Docker gate passed."
