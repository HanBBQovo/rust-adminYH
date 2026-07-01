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
  if command -v cargo-tauri >/dev/null 2>&1; then
    section "Tauri build"
    (cd "$ROOT_DIR/apps/desktop/src-tauri" && cargo tauri build)
  else
    echo
    echo "SKIP: cargo-tauri CLI 未安装，暂不执行 Tauri build。可通过 apps/desktop/web 的 npm run tauri:build 验证。"
  fi
else
  echo
  echo "SKIP: Tauri workspace 尚未初始化，暂不执行 cargo tauri build。"
fi

echo
echo "All available quality gates completed."
