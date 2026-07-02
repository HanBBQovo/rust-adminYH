#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/desktop/web"
TAURI_DIR="$ROOT_DIR/apps/desktop/src-tauri"
ADMIN_API_BIN="$ROOT_DIR/target/release/admin-api"
TAURI_RESOURCE_CONFIG='{"bundle":{"resources":{"../../../target/release/admin-api":"binaries/admin-api"}}}'

section() {
  printf '\n==> %s\n' "$1"
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
  echo
  if [[ -f "$ADMIN_API_BIN" ]]; then
    ls -lh "$ADMIN_API_BIN" || true
  else
    echo "admin-api release sidecar binary is missing."
  fi
  echo
  find "$TAURI_DIR/target/release/bundle" -maxdepth 4 \( -type f -o -type d \) 2>/dev/null | sort | tail -80 || true
  exit "$exit_code"
}

trap diagnostics ERR

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

trap - ERR
echo
echo "Tauri build gate passed."
