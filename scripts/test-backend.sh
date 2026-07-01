#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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
run_if "Rust clippy workspace" cargo clippy --workspace --all-targets -- -D warnings
run_if "Rust test workspace" cargo test --workspace

if cargo metadata --format-version=1 --no-deps | grep -q '"name":"admin-api"'; then
  run_if "admin-api package tests" cargo test -p admin-api
fi

if cargo metadata --format-version=1 --no-deps | grep -q '"name":"admin-db"'; then
  run_if "admin-db package tests" cargo test -p admin-db
fi

echo
echo "Backend gate passed."
