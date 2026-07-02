#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CARGO_OFFLINE="${CARGO_OFFLINE:-true}"
CARGO_FLAGS=()
if [[ "$CARGO_OFFLINE" == "true" ]]; then
  CARGO_FLAGS+=(--offline)
fi

section() {
  printf '\n==> %s\n' "$1"
}

run_if() {
  local description="$1"
  shift
  section "$description"
  "$@"
}

if [[ ! -f Cargo.toml ]]; then
  echo "SKIP: Cargo.toml 不存在，Rust workspace 尚未初始化。"
  echo "TODO: 初始化 crates/admin-api、admin-core、admin-db、admin-migration 后启用后端质量门禁。"
  exit 0
fi

run_if "Rust format check" cargo fmt --all -- --check
run_if "Rust check workspace" cargo check "${CARGO_FLAGS[@]}" --workspace --all-targets
if cargo clippy --version >/dev/null 2>&1; then
  run_if "Rust clippy workspace" cargo clippy "${CARGO_FLAGS[@]}" --workspace --all-targets -- -D warnings
else
  echo "SKIP: cargo clippy 未安装。"
fi
run_if "Rust test workspace" cargo test "${CARGO_FLAGS[@]}" --workspace

if cargo metadata --format-version=1 --no-deps | grep -q '"name":"admin-api"'; then
  run_if "admin-api package tests" cargo test "${CARGO_FLAGS[@]}" -p admin-api
fi

if cargo metadata --format-version=1 --no-deps | grep -q '"name":"admin-db"'; then
  run_if "admin-db package tests" cargo test "${CARGO_FLAGS[@]}" -p admin-db
  if [[ "${RUN_DB_TESTS:-false}" == "true" ]]; then
    if [[ -z "${ADMIN_DB_TEST_DATABASE_URL:-}" ]]; then
      echo "ERROR: RUN_DB_TESTS=true 需要设置 ADMIN_DB_TEST_DATABASE_URL 指向可重建的 MySQL 测试库。"
      exit 1
    fi
    run_if "admin-db MySQL repository integration tests" \
      env ADMIN_DB_TEST_DATABASE_URL="$ADMIN_DB_TEST_DATABASE_URL" \
      cargo test "${CARGO_FLAGS[@]}" -p admin-db --test mysql_order_repository -- --ignored
  else
    echo
    echo "SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL repository 集成测试。发布前必须执行 RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh。"
  fi
fi

echo
echo "Backend gate passed."
