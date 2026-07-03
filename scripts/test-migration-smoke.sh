#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ci.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rust-adminyh-migration-smoke}"
DOCKER_REGISTRY_PREFIX="${DOCKER_REGISTRY_PREFIX:-}"
MYSQL_PORT="${MYSQL_PORT:-33318}"
OLD_DATABASE_NAME="${OLD_DATABASE_NAME:-admin_yh_smoke_old}"
NEW_DATABASE_NAME="${NEW_DATABASE_NAME:-admin_yh_smoke_new}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
MYSQL_USER="${MYSQL_USER:-admin_yh}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-admin_yh}"
CARGO_OFFLINE="${CARGO_OFFLINE:-true}"
MIGRATION_SMOKE_KEEP_COMPOSE="${MIGRATION_SMOKE_KEEP_COMPOSE:-false}"
if [[ -n "${MIGRATION_SMOKE_REPORT_DIR:-}" ]]; then
  MIGRATION_SMOKE_REPORT_DIR="$MIGRATION_SMOKE_REPORT_DIR"
elif [[ -n "${RELEASE_ARTIFACT_DIR:-}" ]]; then
  MIGRATION_SMOKE_REPORT_DIR="$RELEASE_ARTIFACT_DIR/migration-smoke"
else
  MIGRATION_SMOKE_REPORT_DIR="$(mktemp -d -t rust-adminyh-migration-smoke.XXXXXX)"
fi
OLD_AVATAR_DIR="${OLD_AVATAR_DIR:-$MIGRATION_SMOKE_REPORT_DIR/old-avatar}"
NEW_AVATAR_DIR="${NEW_AVATAR_DIR:-$MIGRATION_SMOKE_REPORT_DIR/new-avatar}"
OLD_DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${MYSQL_PORT}/${OLD_DATABASE_NAME}"
NEW_DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${MYSQL_PORT}/${NEW_DATABASE_NAME}"
SCHEMA_SQL="$ROOT_DIR/crates/admin-db/src/migrations/202607010001_init_compat_schema.sql"
FIXTURE_SQL="$ROOT_DIR/scripts/seed-migration-fixture.sql"
DOCKER_DAEMON_READY=false
CARGO_FLAGS=()
if [[ "$CARGO_OFFLINE" == "true" ]]; then
  CARGO_FLAGS+=(--offline)
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

section() {
  printf '\n==> %s\n' "$1"
}

redact_url() {
  sed -E 's#(mysql://)[^:@/]+(:)[^@/]+@#\1***\2***@#g'
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "ERROR: 需要安装 $name 才能执行迁移 smoke。"
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

  echo "ERROR: Docker daemon 不可用，无法执行迁移 smoke。"
  echo "当前 Docker context: ${context}"
  if [[ -n "$endpoint" ]]; then
    echo "当前 Docker endpoint: ${endpoint}"
  fi
  echo "请先启动 Docker Desktop 或 OrbStack，确认 docker info 可以正常连接后再重跑 scripts/test-migration-smoke.sh。"
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

mysql_user() {
  docker_compose exec -T mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$@"
}

run_migration_json() {
  local report_name="$1"
  shift
  local report_path="$MIGRATION_SMOKE_REPORT_DIR/${report_name}.json"
  cargo run "${CARGO_FLAGS[@]}" -p admin-migration -- "$@" --format json >"$report_path"
  echo "report_${report_name}=$report_path"
}

diagnostics() {
  local exit_code=$?
  echo
  echo "ERROR: migration smoke failed with exit code ${exit_code}."
  echo
  section "Migration smoke diagnostics"
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "compose_project=${COMPOSE_PROJECT_NAME}"
  echo "compose_file=${COMPOSE_FILE}"
  echo "mysql_image=${MYSQL_IMAGE}"
  echo "mysql_port=${MYSQL_PORT}"
  echo "old_database=${OLD_DATABASE_NAME}"
  echo "new_database=${NEW_DATABASE_NAME}"
  echo "old_database_url=$(printf '%s' "$OLD_DATABASE_URL" | redact_url)"
  echo "new_database_url=$(printf '%s' "$NEW_DATABASE_URL" | redact_url)"
  echo "old_avatar_dir=${OLD_AVATAR_DIR}"
  echo "new_avatar_dir=${NEW_AVATAR_DIR}"
  echo "report_dir=${MIGRATION_SMOKE_REPORT_DIR}"
  echo "docker_daemon_ready=${DOCKER_DAEMON_READY}"
  if [[ "$DOCKER_DAEMON_READY" == "true" ]]; then
    docker_compose ps || true
    docker_compose logs --tail=200 mysql || true
  fi
  exit "$exit_code"
}

cleanup() {
  if [[ "$MIGRATION_SMOKE_KEEP_COMPOSE" != "true" && "$DOCKER_DAEMON_READY" == "true" ]]; then
    docker_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}

require_command docker
require_command cargo
require_docker_daemon
mkdir -p "$MIGRATION_SMOKE_REPORT_DIR"

if [[ ! -f "$SCHEMA_SQL" ]]; then
  echo "ERROR: 缺少兼容 schema：$SCHEMA_SQL"
  exit 1
fi
if [[ ! -f "$FIXTURE_SQL" ]]; then
  echo "ERROR: 缺少迁移 smoke fixture：$FIXTURE_SQL"
  exit 1
fi

if [[ "$OLD_DATABASE_URL" != *"127.0.0.1:${MYSQL_PORT}"* || "$NEW_DATABASE_URL" != *"127.0.0.1:${MYSQL_PORT}"* ]]; then
  echo "ERROR: migration smoke 只允许写入本机 compose MySQL 测试库。"
  exit 1
fi

trap diagnostics ERR
trap cleanup EXIT

section "Migration smoke environment"
docker version
docker compose version
echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "compose_project=${COMPOSE_PROJECT_NAME}"
echo "mysql_image=${MYSQL_IMAGE}"
echo "mysql_port=${MYSQL_PORT}"
echo "cargo_offline=${CARGO_OFFLINE}"
echo "old_database=${OLD_DATABASE_NAME}"
echo "new_database=${NEW_DATABASE_NAME}"
echo "report_dir=${MIGRATION_SMOKE_REPORT_DIR}"
echo "old_database_url=$(printf '%s' "$OLD_DATABASE_URL" | redact_url)"
echo "new_database_url=$(printf '%s' "$NEW_DATABASE_URL" | redact_url)"

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

section "Rebuild smoke databases"
mysql_root <<SQL
DROP DATABASE IF EXISTS \`${OLD_DATABASE_NAME}\`;
DROP DATABASE IF EXISTS \`${NEW_DATABASE_NAME}\`;
CREATE DATABASE \`${OLD_DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE \`${NEW_DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${OLD_DATABASE_NAME}\`.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${NEW_DATABASE_NAME}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL

section "Load schemas and old fixture"
mysql_user "$OLD_DATABASE_NAME" <"$SCHEMA_SQL"
mysql_user "$NEW_DATABASE_NAME" <"$SCHEMA_SQL"
mysql_user "$OLD_DATABASE_NAME" <"$FIXTURE_SQL"

section "Prepare avatar directories"
rm -rf "$OLD_AVATAR_DIR" "$NEW_AVATAR_DIR"
mkdir -p "$OLD_AVATAR_DIR" "$NEW_AVATAR_DIR"
printf 'migration-default\n' >"$OLD_AVATAR_DIR/default.jpg"
printf 'migration-admin-smoke\n' >"$OLD_AVATAR_DIR/admin-smoke.jpg"
find "$OLD_AVATAR_DIR" -type f | sort

section "Rollback plan"
run_migration_json rollback-plan rollback-plan

section "Inspect old fixture"
run_migration_json inspect-old inspect-old --old "$OLD_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR"

section "Migration dry-run"
run_migration_json dry-run migrate --dry-run --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR"

section "Migration apply"
run_migration_json apply migrate --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR"

section "Verify databases"
run_migration_json verify verify --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL"

section "Verify avatar files"
run_migration_json verify-files verify-files --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR"

section "Smoke reports"
ls -1 "$MIGRATION_SMOKE_REPORT_DIR"/*.json
cat >"$MIGRATION_SMOKE_REPORT_DIR/manifest.txt" <<EOF
commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
compose_project=${COMPOSE_PROJECT_NAME}
mysql_image=${MYSQL_IMAGE}
mysql_port=${MYSQL_PORT}
old_database=${OLD_DATABASE_NAME}
new_database=${NEW_DATABASE_NAME}
old_database_url=$(printf '%s' "$OLD_DATABASE_URL" | redact_url)
new_database_url=$(printf '%s' "$NEW_DATABASE_URL" | redact_url)
old_avatar_dir=${OLD_AVATAR_DIR}
new_avatar_dir=${NEW_AVATAR_DIR}
EOF
echo "manifest=$MIGRATION_SMOKE_REPORT_DIR/manifest.txt"

section "Migration smoke cleanup"
cleanup
trap - EXIT
trap - ERR

echo
echo "Migration smoke passed."
