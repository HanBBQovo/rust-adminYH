#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ci.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rust-adminyh-local-login}"
MYSQL_PORT="${MYSQL_PORT:-33326}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
MYSQL_USER="${MYSQL_USER:-admin_yh}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-admin_yh}"
DB_NAME="${DB_NAME:-admin_yh_local_login}"
API_PORT="${API_PORT:-16824}"
API_LOG="${API_LOG:-$ROOT_DIR/tmp/local-app-admin-api.log}"
API_PID_FILE="${API_PID_FILE:-$ROOT_DIR/tmp/local-app-admin-api.pid}"
AVATAR_DIR="${AVATAR_DIR:-$ROOT_DIR/tmp/local-login-avatar}"
SEED_SQL="${SEED_SQL:-$ROOT_DIR/scripts/seed-docker-e2e.sql}"
APP_BUNDLE="${APP_BUNDLE:-$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle/macos/宇涵物流订单系统.app}"
RESET_LOCAL_DB="${RESET_LOCAL_DB:-true}"
OPEN_APP="${OPEN_APP:-true}"
DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${MYSQL_PORT}/${DB_NAME}"

section() {
  printf '\n==> %s\n' "$1"
}

docker_compose() {
  MYSQL_PORT="$MYSQL_PORT" docker compose -p "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

stop_existing_api() {
  if [[ -f "$API_PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$API_PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old_pid" ]] && kill -0 "$old_pid" >/dev/null 2>&1; then
      kill "$old_pid" >/dev/null 2>&1 || true
      sleep 1
    fi
  fi

  if command -v lsof >/dev/null 2>&1 && lsof -ti tcp:"$API_PORT" >/tmp/rust-adminyh-local-api-pids 2>/dev/null; then
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      local command_name
      command_name="$(ps -p "$pid" -o comm= 2>/dev/null | xargs basename 2>/dev/null || true)"
      if [[ "$command_name" == "admin-api" ]]; then
        kill "$pid" >/dev/null 2>&1 || true
      else
        echo "ERROR: API_PORT=$API_PORT is already used by pid=$pid command=$command_name"
        echo "Set API_PORT=<free-port> or stop that process before running this script."
        exit 124
      fi
    done </tmp/rust-adminyh-local-api-pids
    sleep 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $name"
    exit 127
  fi
}

wait_for_mysql() {
  for _ in $(seq 1 60); do
    if docker_compose exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent >/dev/null 2>&1; then
      echo "mysql_ready=true"
      return 0
    fi
    sleep 2
  done

  docker_compose exec -T mysql mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent
}

wait_for_api() {
  for _ in $(seq 1 60); do
    if curl --fail --silent "http://127.0.0.1:${API_PORT}/api/health" >/tmp/rust-adminyh-local-health.json 2>/dev/null; then
      echo "api_ready=true"
      cat /tmp/rust-adminyh-local-health.json
      return 0
    fi
    if [[ -f "$API_PID_FILE" ]]; then
      local pid
      pid="$(cat "$API_PID_FILE" 2>/dev/null || true)"
      if [[ -n "$pid" ]] && ! kill -0 "$pid" >/dev/null 2>&1; then
        echo "ERROR: admin-api exited early"
        tail -n 160 "$API_LOG" || true
        exit 1
      fi
    fi
    sleep 1
  done

  echo "ERROR: admin-api did not become healthy on http://127.0.0.1:${API_PORT}/api/health"
  tail -n 160 "$API_LOG" || true
  exit 1
}

verify_login() {
  local login_json bad_json code_status

  code_status="$(curl --silent --output /tmp/rust-adminyh-code.out --write-out "%{http_code}" "http://127.0.0.1:${API_PORT}/api/code")"
  echo "api_code_status=${code_status}"
  if [[ "$code_status" != "404" ]]; then
    echo "ERROR: /api/code should be removed and return 404"
    cat /tmp/rust-adminyh-code.out || true
    exit 1
  fi

  login_json="$(curl --fail --silent -H "Content-Type: application/json" \
    -d '{"name":"admin","password":"admin123"}' \
    "http://127.0.0.1:${API_PORT}/api/login")"
  printf '%s\n' "$login_json" >/tmp/rust-adminyh-login.json
  python3 -c 'import json; j=json.load(open("/tmp/rust-adminyh-login.json")); assert j["code"] == 0 and j["data"]["name"] == "admin" and str(j["data"]["token"]).startswith("yh-"), j; print(json.dumps({"account": j["data"]["name"], "password": "admin123", "code": j["code"], "tokenPrefix": j["data"]["token"][:3]}, ensure_ascii=False))'

  bad_json="$(curl --silent -H "Content-Type: application/json" \
    -d '{"name":"admin","password":"wrong"}' \
    "http://127.0.0.1:${API_PORT}/api/login")"
  printf '%s\n' "$bad_json" >/tmp/rust-adminyh-login-bad.json
  python3 -c 'import json; j=json.load(open("/tmp/rust-adminyh-login-bad.json")); assert j["code"] == -200, j; print(json.dumps({"wrongPasswordCode": j["code"], "message": j["message"]}, ensure_ascii=False))'
}

require_command docker
require_command cargo
require_command curl
require_command python3
mkdir -p tmp "$AVATAR_DIR"

section "Start Docker MySQL"
docker_compose up -d mysql
wait_for_mysql

if [[ "$RESET_LOCAL_DB" == "true" ]]; then
  section "Rebuild local database"
  docker_compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
DROP DATABASE IF EXISTS \`${DB_NAME}\`;
CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
fi

section "Build local admin-api"
cargo build --offline -p admin-api

section "Start local admin-api"
stop_existing_api
APP_ENV=local \
APP_HTTP__HOST=127.0.0.1 \
APP_HTTP__PORT="$API_PORT" \
APP_STORAGE__AVATAR_DIR="$AVATAR_DIR" \
DATABASE_URL="$DATABASE_URL" \
DATABASE_MIGRATE_ON_START=true \
nohup target/debug/admin-api >"$API_LOG" 2>&1 &
echo "$!" >"$API_PID_FILE"
wait_for_api

if [[ "$RESET_LOCAL_DB" == "true" ]]; then
  section "Seed local database"
  docker_compose exec -T mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$DB_NAME" <"$SEED_SQL"
  docker_compose exec -T mysql mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$DB_NAME" \
    -e "SELECT id,name,password,enable FROM user ORDER BY id;"
fi

section "Verify local login"
verify_login

if [[ "$OPEN_APP" == "true" ]]; then
  section "Open macOS app"
  if [[ ! -d "$APP_BUNDLE" ]]; then
    echo "ERROR: app bundle not found: $APP_BUNDLE"
    echo "Run RUN_TAURI=true scripts/check-all.sh first."
    exit 1
  fi
  open "$APP_BUNDLE"
fi

section "Local app ready"
cat <<INFO
local_mysql=127.0.0.1:${MYSQL_PORT}/${DB_NAME}
local_api=http://127.0.0.1:${API_PORT}/api
login_account=admin
login_password=admin123
api_pid=$(cat "$API_PID_FILE")
api_log=$API_LOG
INFO
