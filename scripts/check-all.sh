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

if [[ -f Cargo.toml ]] && cargo metadata --format-version=1 --no-deps 2>/dev/null | grep -q '"name":"desktop"'; then
  section "Tauri build"
  cargo tauri build
else
  echo
  echo "SKIP: Tauri workspace 尚未初始化，暂不执行 cargo tauri build。"
fi

echo
echo "All available quality gates completed."
