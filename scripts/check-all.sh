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
  section "Tauri contract"
  "$ROOT_DIR/scripts/test-tauri-contract.sh"

  if [[ "${RUN_TAURI:-false}" == "true" ]]; then
    section "Tauri build"
    "$ROOT_DIR/scripts/test-tauri-build.sh"
  else
    echo
    echo "SKIP: RUN_TAURI=true 未设置，跳过 Tauri build。发布前必须执行 RUN_TAURI=true scripts/check-all.sh。"
  fi
else
  echo
  echo "SKIP: Tauri workspace 尚未初始化，暂不执行 cargo tauri build。"
fi

section "Docker contract"
node "$ROOT_DIR/scripts/test-docker-contract.mjs"

if [[ "${RUN_DOCKER:-false}" == "true" ]]; then
  section "Docker"
  "$ROOT_DIR/scripts/test-docker.sh"
else
  echo
  echo "SKIP: RUN_DOCKER=true 未设置，跳过 Docker 镜像构建和 compose 健康检查。发布前必须执行 RUN_DOCKER=true scripts/check-all.sh。"
fi

echo
echo "All available quality gates completed."
