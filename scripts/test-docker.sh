#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ci.yml}"
API_IMAGE="${API_IMAGE:-rust-adminyh/admin-api:ci}"
WEB_IMAGE="${WEB_IMAGE:-rust-adminyh/desktop-web:ci}"
RUST_IMAGE="${RUST_IMAGE:-rust:1.88-bookworm}"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-debian:bookworm-slim}"
NODE_IMAGE="${NODE_IMAGE:-node:20-slim}"
NGINX_IMAGE="${NGINX_IMAGE:-nginx:1.27-alpine}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.0}"
API_URL="${API_URL:-http://127.0.0.1:16824/api/health}"
WEB_URL="${WEB_URL:-http://127.0.0.1:18080/}"
WEB_API_URL="${WEB_API_URL:-http://127.0.0.1:18080/api/health}"
WEB_PORT="${WEB_PORT:-18080}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rust-adminyh-ci}"

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
  echo "api_url=${API_URL}"
  echo "web_url=${WEB_URL}"
  echo "web_api_url=${WEB_API_URL}"
  echo "web_port=${WEB_PORT}"
  echo "database_url=$(printf '%s' "${DATABASE_URL:-mysql://admin_yh:admin_yh@mysql:3306/admin_yh}" | redact_url)"
  echo
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" ps || true
  echo
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" logs --tail=200 mysql admin-api desktop-web || true
  exit "$exit_code"
}

trap diagnostics ERR

require_command docker

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

section "Docker cleanup before run"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" down --volumes --remove-orphans || true

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
  --tag "$WEB_IMAGE" \
  .

section "Docker compose up"
RUST_IMAGE="$RUST_IMAGE" \
RUNTIME_IMAGE="$RUNTIME_IMAGE" \
NODE_IMAGE="$NODE_IMAGE" \
NGINX_IMAGE="$NGINX_IMAGE" \
MYSQL_IMAGE="$MYSQL_IMAGE" \
WEB_PORT="$WEB_PORT" \
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" up -d mysql admin-api desktop-web

section "Health checks"
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error "$API_URL" >/tmp/rust-adminyh-api-health.json; then
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

section "Docker compose status"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" ps

section "Docker cleanup"
docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" down --volumes --remove-orphans
trap - ERR

echo
echo "Docker gate passed."
