#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CARGO_OFFLINE="${CARGO_OFFLINE:-true}"
CARGO_FLAGS=()
if [[ "$CARGO_OFFLINE" == "true" ]]; then
  CARGO_FLAGS+=(--offline)
fi

OLD_DATABASE_URL="${OLD_DATABASE_URL:-}"
NEW_DATABASE_URL="${NEW_DATABASE_URL:-}"
OLD_AVATAR_DIR="${OLD_AVATAR_DIR:-/Users/hanhan/Desktop/code/adminYh-server/uploads/avatar}"
NEW_AVATAR_DIR="${NEW_AVATAR_DIR:-}"

section() {
  printf '\n==> %s\n' "$1"
}

require_url_pair_for_apply() {
  if [[ -z "$OLD_DATABASE_URL" || -z "$NEW_DATABASE_URL" ]]; then
    echo "SKIP: OLD_DATABASE_URL 或 NEW_DATABASE_URL 未设置，跳过需要真实数据库连接的迁移校验。"
    echo "示例：OLD_DATABASE_URL=mysql://user:pass@127.0.0.1/admin_yh_old NEW_DATABASE_URL=mysql://user:pass@127.0.0.1/admin_yh_new scripts/test-migration.sh"
    return 1
  fi
}

section "Migration documentation lint"
for doc in docs/database-migration.md docs/api-compatibility.md; do
  if [[ ! -s "$doc" ]]; then
    echo "FAIL: $doc 不存在或为空。"
    exit 1
  fi
  echo "OK: $doc"
done

section "Legacy avatar inventory"
if [[ -d "$OLD_AVATAR_DIR" ]]; then
  find "$OLD_AVATAR_DIR" -type f | sort | wc -l | awk '{print "avatar_files=" $1}'
else
  echo "WARN: 旧头像目录不存在：$OLD_AVATAR_DIR"
fi

if [[ -f Cargo.toml ]] && cargo metadata --format-version=1 --no-deps 2>/dev/null | grep -q '"name":"admin-migration"'; then
  section "admin-migration unit tests"
  cargo test "${CARGO_FLAGS[@]}" -p admin-migration

  section "admin-migration dry-run/verify"
  if require_url_pair_for_apply; then
    cargo run "${CARGO_FLAGS[@]}" -p admin-migration -- inspect-old --old "$OLD_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json
    cargo run "${CARGO_FLAGS[@]}" -p admin-migration -- migrate --dry-run --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json
    cargo run "${CARGO_FLAGS[@]}" -p admin-migration -- verify --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --format json
    if [[ -n "$NEW_AVATAR_DIR" ]]; then
      cargo run "${CARGO_FLAGS[@]}" -p admin-migration -- verify-files --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR" --format json
    fi
  fi
else
  echo "SKIP: admin-migration crate 尚未初始化。"
  echo "TODO: crate 创建后，本脚本会执行 inspect-old、migrate --dry-run、verify 和头像文件校验。"
fi

echo
echo "Migration gate completed."
