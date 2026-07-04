#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/desktop/web"
TAURI_DIR="$ROOT_DIR/apps/desktop/src-tauri"
ADMIN_API_BIN="$ROOT_DIR/target/release/admin-api"
TAURI_RESOURCE_CONFIG='{"bundle":{"resources":{"../../../target/release/admin-api":"binaries/admin-api"}}}'
SIDECAR_SMOKE_PID=""
SIDECAR_SMOKE_LOG_DIR=""
SIDECAR_SMOKE_PORT="${SIDECAR_SMOKE_PORT:-16824}"
SIDECAR_SMOKE_URL="${SIDECAR_SMOKE_URL:-http://127.0.0.1:${SIDECAR_SMOKE_PORT}/api/health}"
RELEASE_GATE="${RELEASE_GATE:-false}"
TAURI_REPORT_DIR=""
if [[ -n "${RELEASE_ARTIFACT_DIR:-}" ]]; then
  TAURI_REPORT_DIR="$RELEASE_ARTIFACT_DIR/tauri"
fi

if [[ "$RELEASE_GATE" == "true" && "${RUN_TAURI_DMG:-false}" != "true" ]]; then
  echo "FAIL: RELEASE_GATE=true 需要 RUN_TAURI_DMG=true，发布候选不能跳过 macOS DMG 打包验证。"
  exit 1
fi

if [[ "$RELEASE_GATE" == "true" && "${RUN_TAURI_SIDECAR_SMOKE:-false}" != "true" ]]; then
  echo "FAIL: RELEASE_GATE=true 需要 RUN_TAURI_SIDECAR_SMOKE=true，发布候选不能跳过打包后 sidecar 真实启动健康检查。"
  exit 1
fi

section() {
  printf '\n==> %s\n' "$1"
}

redact_url() {
  sed -E 's#(mysql://)[^:@/]+(:)[^@/]+@#\1***\2***@#g'
}

cleanup_sidecar_smoke() {
  if [[ -n "$SIDECAR_SMOKE_PID" ]] && kill -0 "$SIDECAR_SMOKE_PID" 2>/dev/null; then
    kill "$SIDECAR_SMOKE_PID" 2>/dev/null || true
    wait "$SIDECAR_SMOKE_PID" 2>/dev/null || true
  fi
}

diagnostics() {
  local exit_code=$?
  echo
  echo "ERROR: Tauri build gate failed with exit code ${exit_code}."
  echo
  section "Tauri diagnostics"
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "tauri_dir=$TAURI_DIR"
  echo "web_dir=$WEB_DIR"
  echo "admin_api_bin=$ADMIN_API_BIN"
  echo "tauri_config_resource=$TAURI_RESOURCE_CONFIG"
  echo "run_tauri_dmg=${RUN_TAURI_DMG:-false}"
  echo "run_tauri_sidecar_smoke=${RUN_TAURI_SIDECAR_SMOKE:-false}"
  echo "sidecar_smoke_port=${SIDECAR_SMOKE_PORT}"
  echo "sidecar_smoke_url=${SIDECAR_SMOKE_URL}"
  echo "sidecar_database_url=$(printf '%s' "${TAURI_SIDECAR_DATABASE_URL:-${DATABASE_URL:-}}" | redact_url)"
  echo
  if [[ -f "$ADMIN_API_BIN" ]]; then
    ls -lh "$ADMIN_API_BIN" || true
  else
    echo "admin-api release sidecar binary is missing."
  fi
  echo
  find "$TAURI_DIR/target/release/bundle" -maxdepth 4 \( -type f -o -type d \) 2>/dev/null | sort | tail -80 || true
  if [[ -n "$SIDECAR_SMOKE_LOG_DIR" ]]; then
    echo
    section "Tauri sidecar smoke logs"
    for log in "$SIDECAR_SMOKE_LOG_DIR"/*; do
      [[ -f "$log" ]] || continue
      echo "--- $log ---"
      tail -120 "$log" || true
    done
  fi
  cleanup_sidecar_smoke
  exit "$exit_code"
}

trap diagnostics ERR
if [[ -n "$TAURI_REPORT_DIR" ]]; then
  mkdir -p "$TAURI_REPORT_DIR"
fi

section "Tauri sidecar runtime smoke"
(cd "$TAURI_DIR" && cargo test --lib)

section "Build admin-api sidecar"
(cd "$ROOT_DIR" && cargo build --release -p admin-api)

if [[ ! -x "$ADMIN_API_BIN" ]]; then
  echo "ERROR: admin-api sidecar binary is not executable: $ADMIN_API_BIN"
  exit 1
fi

section "Build Tauri app"
if [[ "${RUN_TAURI_DMG:-false}" == "true" ]]; then
  (cd "$WEB_DIR" && npm run tauri:build -- --config "$TAURI_RESOURCE_CONFIG")
else
  (cd "$WEB_DIR" && npm run tauri:build:app -- --config "$TAURI_RESOURCE_CONFIG")
  echo
  echo "SKIP: RUN_TAURI_DMG=true 未设置，跳过 DMG 生成。发布 macOS 安装包前必须执行 RUN_TAURI=true RUN_TAURI_DMG=true scripts/check-all.sh。"
fi

section "Verify sidecar resource"
APP_BUNDLE="$(find "$TAURI_DIR/target/release/bundle/macos" -maxdepth 1 -type d -name '*.app' 2>/dev/null | head -n 1 || true)"
if [[ -z "$APP_BUNDLE" ]]; then
  echo "ERROR: Tauri macOS .app bundle was not produced."
  exit 1
fi
SIDECAR_RESOURCE="$APP_BUNDLE/Contents/Resources/binaries/admin-api"
if [[ ! -x "$SIDECAR_RESOURCE" ]]; then
  echo "ERROR: bundled admin-api sidecar is missing or not executable: $SIDECAR_RESOURCE"
  exit 1
fi
ls -lh "$SIDECAR_RESOURCE"
if [[ -n "$TAURI_REPORT_DIR" ]]; then
  find "$TAURI_DIR/target/release/bundle" -maxdepth 4 \( -type f -o -type d \) | sort >"$TAURI_REPORT_DIR/bundle-files.txt"
  shasum -a 256 "$SIDECAR_RESOURCE" >"$TAURI_REPORT_DIR/sidecar.sha256"
  cat >"$TAURI_REPORT_DIR/manifest.txt" <<EOF
commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
tauri_dir=${TAURI_DIR}
web_dir=${WEB_DIR}
app_bundle=${APP_BUNDLE}
sidecar_resource=${SIDECAR_RESOURCE}
run_tauri_dmg=${RUN_TAURI_DMG:-false}
run_tauri_sidecar_smoke=${RUN_TAURI_SIDECAR_SMOKE:-false}
sidecar_smoke_port=${SIDECAR_SMOKE_PORT}
sidecar_smoke_url=${SIDECAR_SMOKE_URL}
sidecar_database_url=$(printf '%s' "${TAURI_SIDECAR_DATABASE_URL:-${DATABASE_URL:-}}" | redact_url)
EOF
  echo "tauri_report_dir=${TAURI_REPORT_DIR}"
fi

if [[ "${RUN_TAURI_SIDECAR_SMOKE:-false}" == "true" ]]; then
  section "Bundled sidecar runtime smoke"
  if [[ -z "${TAURI_SIDECAR_DATABASE_URL:-${DATABASE_URL:-}}" ]]; then
    echo "ERROR: RUN_TAURI_SIDECAR_SMOKE=true 需要 TAURI_SIDECAR_DATABASE_URL 或 DATABASE_URL 指向可重建的 MySQL 测试库。"
    exit 1
  fi
  if curl --fail --silent --show-error "$SIDECAR_SMOKE_URL" >/dev/null 2>&1; then
    echo "ERROR: $SIDECAR_SMOKE_URL 已经可访问，无法证明打包后的 sidecar 自己启动成功；请停止占用 ${SIDECAR_SMOKE_PORT} 的本机 API，或设置 SIDECAR_SMOKE_PORT=<free-port> 后重跑。"
    exit 1
  fi
  SIDECAR_SMOKE_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rust-adminyh-tauri-sidecar.XXXXXX")"
  APP_STORAGE_DIR="$SIDECAR_SMOKE_LOG_DIR/uploads/avatar"
  mkdir -p "$APP_STORAGE_DIR"

  APP_ENV=desktop \
  APP_NAME=rust-adminYH \
  APP_HTTP__HOST=127.0.0.1 \
  APP_HTTP__PORT="$SIDECAR_SMOKE_PORT" \
  APP_LOGGING__JSON_LOGS=true \
  APP_STORAGE__AVATAR_DIR="$APP_STORAGE_DIR" \
  DATABASE_URL="${TAURI_SIDECAR_DATABASE_URL:-${DATABASE_URL:-}}" \
  DATABASE_MIGRATE_ON_START="${TAURI_SIDECAR_MIGRATE_ON_START:-true}" \
  "$SIDECAR_RESOURCE" >"$SIDECAR_SMOKE_LOG_DIR/stdout.log" 2>"$SIDECAR_SMOKE_LOG_DIR/stderr.log" &
  SIDECAR_SMOKE_PID=$!
  echo "sidecar_pid=$SIDECAR_SMOKE_PID"

  for _ in $(seq 1 60); do
    if curl --fail --silent --show-error "$SIDECAR_SMOKE_URL" >"$SIDECAR_SMOKE_LOG_DIR/health.json"; then
      cat "$SIDECAR_SMOKE_LOG_DIR/health.json"
      if [[ -n "$TAURI_REPORT_DIR" ]]; then
        cp "$SIDECAR_SMOKE_LOG_DIR/health.json" "$TAURI_REPORT_DIR/sidecar-health.json"
        cp "$SIDECAR_SMOKE_LOG_DIR/stdout.log" "$TAURI_REPORT_DIR/sidecar-stdout.log"
        cp "$SIDECAR_SMOKE_LOG_DIR/stderr.log" "$TAURI_REPORT_DIR/sidecar-stderr.log"
      fi
      echo
      cleanup_sidecar_smoke
      SIDECAR_SMOKE_PID=""
      break
    fi
    if ! kill -0 "$SIDECAR_SMOKE_PID" 2>/dev/null; then
      echo "ERROR: bundled admin-api sidecar exited before health check passed."
      exit 1
    fi
    sleep 1
  done

  if [[ -n "$SIDECAR_SMOKE_PID" ]]; then
    echo "ERROR: bundled admin-api sidecar did not pass health check: $SIDECAR_SMOKE_URL"
    exit 1
  fi
else
  echo
  echo "SKIP: RUN_TAURI_SIDECAR_SMOKE=true 未设置，跳过打包后 sidecar 真实启动健康检查。发布候选必须使用测试库执行该门禁。"
fi

trap - ERR
cleanup_sidecar_smoke
echo
echo "Tauri build gate passed."
