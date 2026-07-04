#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ci.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rust-adminyh-backend-mysql-smoke}"
DOCKER_REGISTRY_PREFIX="${DOCKER_REGISTRY_PREFIX:-}"
MYSQL_PORT="${MYSQL_PORT:-33319}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
MYSQL_USER="${MYSQL_USER:-admin_yh}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-admin_yh}"
BACKEND_MYSQL_SMOKE_DATABASE_NAME="${BACKEND_MYSQL_SMOKE_DATABASE_NAME:-admin_yh_backend_smoke}"
CARGO_OFFLINE="${CARGO_OFFLINE:-true}"
BACKEND_MYSQL_SMOKE_KEEP_COMPOSE="${BACKEND_MYSQL_SMOKE_KEEP_COMPOSE:-false}"
DOCKER_DAEMON_READY=false
CARGO_OFFLINE_FLAG=""
if [[ "$CARGO_OFFLINE" == "true" ]]; then
  CARGO_OFFLINE_FLAG="--offline"
fi

library_image() {
  local image="$1"
  local prefix="$DOCKER_REGISTRY_PREFIX"
  if [[ -n "$prefix" && "$prefix" != */ ]]; then
    prefix="${prefix}/"
  fi
  printf '%s%s' "$prefix" "$image"
}

MYSQL_IMAGE="${MYSQL_IMAGE:-$(library_image "mysql:8.0")}"
ADMIN_DB_TEST_DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${MYSQL_PORT}/${BACKEND_MYSQL_SMOKE_DATABASE_NAME}"

section() {
  printf '\n==> %s\n' "$1"
}

redact_url() {
  sed -E 's#(mysql://)[^:@/]+(:)[^@/]+@#\1***\2***@#g'
}

mysql_database_name_from_url() {
  local url_without_query="${1%%\?*}"
  local database_name="${url_without_query##*/}"
  printf '%s' "$database_name"
}

require_safe_mysql_database_name() {
  local database_name="$1"
  local lower_name
  lower_name="$(printf '%s' "$database_name" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "$lower_name" ]]; then
    echo "ERROR: MySQL smoke 数据库名不能为空。"
    exit 1
  fi
  if ! [[ "$lower_name" =~ (test|smoke|ci|shadow) ]]; then
    echo "ERROR: MySQL smoke 只允许重建名称包含 test/smoke/ci/shadow 的隔离测试库，当前数据库：$database_name"
    exit 1
  fi
  if [[ "$lower_name" == "admin_yh" || "$lower_name" =~ (^|[_-])(prod|production|live)([_-]|$) ]]; then
    echo "ERROR: 拒绝重建疑似生产库：$database_name"
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "ERROR: 需要安装 $name 才能执行后端 MySQL smoke。"
    exit 127
  fi
}

require_docker_daemon() {
  if docker info >/dev/null 2>&1; then
    DOCKER_DAEMON_READY=true
    return 0
  fi

  local context
  local endpoint
  context="$(docker context show 2>/dev/null || echo unknown)"
  endpoint="$(docker context inspect "$context" --format '{{json .Endpoints.docker.Host}}' 2>/dev/null | tr -d '"' || true)"

  echo "ERROR: Docker daemon 不可用，无法执行后端 MySQL smoke。"
  echo "当前 Docker context: ${context}"
  if [[ -n "$endpoint" ]]; then
    echo "当前 Docker endpoint: ${endpoint}"
  fi
  echo "请先启动 Docker Desktop 或 OrbStack，确认 docker info 可以正常连接后再重跑 scripts/test-backend-mysql-smoke.sh。"
  exit 125
}

docker_compose() {
  MYSQL_IMAGE="$MYSQL_IMAGE" \
  MYSQL_PORT="$MYSQL_PORT" \
  docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

mysql_root() {
  docker_compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$@"
}

run_mysql_tests() {
  local package_name="$1"
  local test_dir="$2"
  local description_prefix="$3"

  if [[ ! -d "$test_dir" ]]; then
    return
  fi

  local found=false
  while IFS= read -r test_file; do
    found=true
    local test_name
    test_name="$(basename "$test_file" .rs)"
    section "$description_prefix $test_name"
    env ADMIN_DB_TEST_DATABASE_URL="$ADMIN_DB_TEST_DATABASE_URL" \
      RUN_DB_TESTS=true \
      cargo test ${CARGO_OFFLINE_FLAG:+"$CARGO_OFFLINE_FLAG"} -p "$package_name" --test "$test_name" -- --ignored --test-threads=1
  done < <(find "$test_dir" -maxdepth 1 -type f -name 'mysql_*.rs' | sort)

  if [[ "$found" == "false" ]]; then
    echo "ERROR: $test_dir 下没有发现 mysql_*.rs 真实 MySQL 测试文件。"
    exit 1
  fi
}

diagnostics() {
  local exit_code=$?
  echo
  echo "ERROR: backend MySQL smoke failed with exit code ${exit_code}."
  section "Backend MySQL smoke diagnostics"
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "compose_project=${COMPOSE_PROJECT_NAME}"
  echo "compose_file=${COMPOSE_FILE}"
  echo "mysql_image=${MYSQL_IMAGE}"
  echo "mysql_port=${MYSQL_PORT}"
  echo "database=${BACKEND_MYSQL_SMOKE_DATABASE_NAME}"
  echo "admin_db_test_database_url=$(printf '%s' "$ADMIN_DB_TEST_DATABASE_URL" | redact_url)"
  echo "docker_daemon_ready=${DOCKER_DAEMON_READY}"
  if [[ "$DOCKER_DAEMON_READY" == "true" ]]; then
    docker_compose ps || true
    docker_compose logs --tail=200 mysql || true
  fi
  exit "$exit_code"
}

cleanup() {
  if [[ "$BACKEND_MYSQL_SMOKE_KEEP_COMPOSE" != "true" && "$DOCKER_DAEMON_READY" == "true" ]]; then
    docker_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}

require_safe_mysql_database_name "$BACKEND_MYSQL_SMOKE_DATABASE_NAME"
require_safe_mysql_database_name "$(mysql_database_name_from_url "$ADMIN_DB_TEST_DATABASE_URL")"
if [[ "$ADMIN_DB_TEST_DATABASE_URL" != *"@127.0.0.1:${MYSQL_PORT}/${BACKEND_MYSQL_SMOKE_DATABASE_NAME}"* ]]; then
  echo "ERROR: 后端 MySQL smoke 只允许写入本机 compose MySQL 隔离库。"
  exit 1
fi

require_command docker
require_command cargo
require_docker_daemon

trap diagnostics ERR
trap cleanup EXIT

section "Backend MySQL smoke environment"
docker version
docker compose version
echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "compose_project=${COMPOSE_PROJECT_NAME}"
echo "mysql_image=${MYSQL_IMAGE}"
echo "mysql_port=${MYSQL_PORT}"
echo "cargo_offline=${CARGO_OFFLINE}"
echo "database=${BACKEND_MYSQL_SMOKE_DATABASE_NAME}"
echo "admin_db_test_database_url=$(printf '%s' "$ADMIN_DB_TEST_DATABASE_URL" | redact_url)"

section "Compose MySQL"
docker_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
docker_compose up -d mysql

section "Wait for MySQL"
for _ in $(seq 1 60); do
  if docker_compose exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null 2>&1; then
    echo "mysql_ready=true"
    break
  fi
  sleep 2
done
docker_compose exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent

section "Rebuild backend test database"
mysql_root <<SQL
DROP DATABASE IF EXISTS \`${BACKEND_MYSQL_SMOKE_DATABASE_NAME}\`;
CREATE DATABASE \`${BACKEND_MYSQL_SMOKE_DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${BACKEND_MYSQL_SMOKE_DATABASE_NAME}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL

run_mysql_tests "admin-db" "$ROOT_DIR/crates/admin-db/tests" "admin-db MySQL smoke"
run_mysql_tests "admin-api" "$ROOT_DIR/crates/admin-api/tests" "admin-api MySQL smoke"

section "Docker cleanup"
docker_compose down --volumes --remove-orphans
trap - ERR

echo
echo "Backend MySQL smoke gate passed."
