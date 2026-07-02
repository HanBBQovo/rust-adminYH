#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

section() {
  printf '\n========== %s ==========\n' "$1"
}

section "Backend"
"$ROOT_DIR/scripts/test-backend.sh"

section "Frontend"
"$ROOT_DIR/scripts/test-frontend.sh"

section "Migration"
"$ROOT_DIR/scripts/test-migration.sh"

if [[ -f "$ROOT_DIR/apps/desktop/src-tauri/Cargo.toml" ]]; then
  if [[ "${RUN_TAURI:-false}" == "true" ]]; then
    section "Tauri build"
    if [[ "${RUN_TAURI_DMG:-false}" == "true" ]]; then
      (cd "$ROOT_DIR/apps/desktop/web" && npm run tauri:build)
    else
      (cd "$ROOT_DIR/apps/desktop/web" && npm run tauri:build:app)
      echo
      echo "SKIP: RUN_TAURI_DMG=true 未设置，跳过 DMG 生成。发布 macOS 安装包前必须执行 RUN_TAURI=true RUN_TAURI_DMG=true scripts/check-all.sh。"
    fi
  else
    echo
    echo "SKIP: RUN_TAURI=true 未设置，跳过 Tauri build。发布前必须执行 RUN_TAURI=true scripts/check-all.sh。"
  fi
else
  echo
  echo "SKIP: Tauri workspace 尚未初始化，暂不执行 cargo tauri build。"
fi

echo
echo "All available quality gates completed."
