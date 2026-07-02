#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_GATE="${RELEASE_GATE:-false}"

section() {
  printf '\n========== %s ==========\n' "$1"
}

if [[ "$RELEASE_GATE" == "true" ]]; then
  section "Release gate preflight"

  if [[ "${RUN_DB_TESTS:-false}" != "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 RUN_DB_TESTS=true，发布候选必须执行真实 MySQL repository 集成测试。"
    exit 1
  fi
  if [[ -z "${ADMIN_DB_TEST_DATABASE_URL:-}" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 ADMIN_DB_TEST_DATABASE_URL 指向可重建的 MySQL 测试库。"
    exit 1
  fi
  if [[ -z "${OLD_DATABASE_URL:-}" || -z "${NEW_DATABASE_URL:-}" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 OLD_DATABASE_URL 和 NEW_DATABASE_URL，发布候选必须执行真实迁移 dry-run/verify。"
    exit 1
  fi
  if [[ -z "${NEW_AVATAR_DIR:-}" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 NEW_AVATAR_DIR，发布候选必须执行头像文件迁移校验。"
    exit 1
  fi
  if [[ "${RUN_DOCKER:-false}" != "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 RUN_DOCKER=true，发布候选必须构建镜像并执行 compose 健康检查。"
    exit 1
  fi
  if [[ "${RUN_TAURI:-false}" != "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 RUN_TAURI=true，发布候选必须执行 Tauri sidecar 与 .app 打包门禁。"
    exit 1
  fi

  echo "Release gate preflight passed."
fi

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
