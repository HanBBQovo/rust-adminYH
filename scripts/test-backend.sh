#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_WORKSPACE_DIR="${BACKEND_WORKSPACE_DIR:-$ROOT_DIR}"

CARGO_OFFLINE="${CARGO_OFFLINE:-true}"
RELEASE_GATE="${RELEASE_GATE:-false}"
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

run_mysql_tests() {
  local package_name="$1"
  local test_dir="$2"
  local description_prefix="$3"

  if [[ ! -d "$test_dir" ]]; then
    return
  fi

  local found=false
  while IFS= read -r test_file; do
    found=true
    local test_name
    test_name="$(basename "$test_file" .rs)"
    run_if "$description_prefix $test_name" \
      env ADMIN_DB_TEST_DATABASE_URL="$ADMIN_DB_TEST_DATABASE_URL" \
      RUN_DB_TESTS=true \
      cargo test "${CARGO_FLAGS[@]}" -p "$package_name" --test "$test_name" -- --ignored
  done < <(find "$test_dir" -maxdepth 1 -type f -name 'mysql_*.rs' | sort)

  if [[ "$found" == "false" ]]; then
    echo "ERROR: $test_dir 下没有发现 mysql_*.rs 真实 MySQL 测试文件。"
    exit 1
  fi
}

if [[ ! -f "$BACKEND_WORKSPACE_DIR/Cargo.toml" ]]; then
  if [[ "$RELEASE_GATE" == "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 Rust workspace Cargo.toml，发布候选不能跳过后端质量门禁：$BACKEND_WORKSPACE_DIR"
    exit 1
  fi
  echo "SKIP: Cargo.toml 不存在，Rust workspace 尚未初始化。"
  echo "TODO: 初始化 crates/admin-api、admin-core、admin-db、admin-migration 后启用后端质量门禁。"
  exit 0
fi

cd "$BACKEND_WORKSPACE_DIR"

run_if "Backend MySQL test coverage contract" node "$ROOT_DIR/scripts/test-backend-mysql-contract.mjs"
run_if "Backend SQL helper contract" node "$ROOT_DIR/scripts/test-backend-sql-helper-contract.mjs"
run_if "Backend pagination contract" node "$ROOT_DIR/scripts/test-backend-pagination-contract.mjs"
run_if "Rust format check" cargo fmt --all -- --check
run_if "Rust check workspace" cargo check "${CARGO_FLAGS[@]}" --workspace --all-targets
if cargo clippy --version >/dev/null 2>&1; then
  run_if "Rust clippy workspace" cargo clippy "${CARGO_FLAGS[@]}" --workspace --all-targets -- -D warnings
else
  if [[ "$RELEASE_GATE" == "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 cargo clippy，发布候选不能跳过 Rust clippy 门禁。"
    exit 1
  fi
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
    run_mysql_tests "admin-db" "$ROOT_DIR/crates/admin-db/tests" "admin-db MySQL integration test"
    run_mysql_tests "admin-api" "$ROOT_DIR/crates/admin-api/tests" "admin-api MySQL integration test"
  else
    if [[ "$RELEASE_GATE" == "true" ]]; then
      echo "FAIL: RELEASE_GATE=true 不允许跳过真实 MySQL repository 集成测试。"
      exit 1
    fi
    echo
    echo "SKIP: RUN_DB_TESTS=true 未设置，跳过真实 MySQL repository 集成测试。发布前必须执行 RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=... scripts/check-all.sh。"
  fi
fi

echo
echo "Backend gate passed."
