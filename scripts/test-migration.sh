#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CARGO_OFFLINE="${CARGO_OFFLINE:-true}"
RELEASE_GATE="${RELEASE_GATE:-false}"
CARGO_OFFLINE_FLAG=""
if [[ "$CARGO_OFFLINE" == "true" ]]; then
  CARGO_OFFLINE_FLAG="--offline"
fi

OLD_DATABASE_URL="${OLD_DATABASE_URL:-}"
NEW_DATABASE_URL="${NEW_DATABASE_URL:-}"
OLD_AVATAR_DIR="${OLD_AVATAR_DIR:-/Users/hanhan/Desktop/code/adminYh-server/uploads/avatar}"
NEW_AVATAR_DIR="${NEW_AVATAR_DIR:-}"
MIGRATION_APPLY="${MIGRATION_APPLY:-false}"
MIGRATION_ALLOW_NON_EMPTY_TARGET="${MIGRATION_ALLOW_NON_EMPTY_TARGET:-false}"
RUN_MIGRATION_SMOKE="${RUN_MIGRATION_SMOKE:-false}"

section() {
  printf '\n==> %s\n' "$1"
}

run_cargo() {
  local subcommand="$1"
  shift
  if [[ -n "$CARGO_OFFLINE_FLAG" ]]; then
    cargo "$subcommand" "$CARGO_OFFLINE_FLAG" "$@"
  else
    cargo "$subcommand" "$@"
  fi
}

require_url_pair_for_apply() {
  if [[ -z "$OLD_DATABASE_URL" || -z "$NEW_DATABASE_URL" ]]; then
    if [[ "$RELEASE_GATE" == "true" ]]; then
      echo "FAIL: RELEASE_GATE=true 不允许跳过真实数据库迁移 dry-run/verify；请设置 OLD_DATABASE_URL 和 NEW_DATABASE_URL。"
      exit 1
    fi
    if [[ "$MIGRATION_APPLY" == "true" ]]; then
      echo "ERROR: MIGRATION_APPLY=true 需要 OLD_DATABASE_URL 和 NEW_DATABASE_URL，不能在缺少数据库连接时跳过迁移 apply。"
      exit 1
    fi
    echo "SKIP: OLD_DATABASE_URL 或 NEW_DATABASE_URL 未设置，跳过需要真实数据库连接的迁移校验。"
    echo "示例：OLD_DATABASE_URL=mysql://user:pass@127.0.0.1/admin_yh_old NEW_DATABASE_URL=mysql://user:pass@127.0.0.1/admin_yh_new scripts/test-migration.sh"
    return 1
  fi

  if [[ "$RELEASE_GATE" == "true" && -z "$NEW_AVATAR_DIR" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 NEW_AVATAR_DIR，发布候选必须执行 verify-files 头像迁移校验。"
    exit 1
  fi

  if [[ "$RELEASE_GATE" == "true" && "$MIGRATION_APPLY" != "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 MIGRATION_APPLY=true，发布候选必须真实执行 migrate apply。"
    exit 1
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
  run_cargo test -p admin-migration

  section "admin-migration rollback plan"
  run_cargo run -p admin-migration -- rollback-plan --format json

  section "admin-migration dry-run/verify"
  if require_url_pair_for_apply; then
    run_cargo run -p admin-migration -- inspect-old --old "$OLD_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json
    run_cargo run -p admin-migration -- migrate --dry-run --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json
    if [[ "$MIGRATION_APPLY" == "true" ]]; then
      APPLY_ARGS=(migrate --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --old-avatar-dir "$OLD_AVATAR_DIR" --format json)
      if [[ -n "$NEW_AVATAR_DIR" ]]; then
        APPLY_ARGS+=(--new-avatar-dir "$NEW_AVATAR_DIR")
      fi
      if [[ "$MIGRATION_ALLOW_NON_EMPTY_TARGET" == "true" ]]; then
        APPLY_ARGS+=(--allow-non-empty-target)
      fi
      run_cargo run -p admin-migration -- "${APPLY_ARGS[@]}"
    else
      echo "SKIP: MIGRATION_APPLY=true 未设置，跳过真实 apply。只允许在影子库/测试库开启。"
    fi
    run_cargo run -p admin-migration -- verify --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL" --format json
    if [[ -n "$NEW_AVATAR_DIR" ]]; then
      run_cargo run -p admin-migration -- verify-files --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR" --format json
    fi
  fi
else
  echo "SKIP: admin-migration crate 尚未初始化。"
  echo "TODO: crate 创建后，本脚本会执行 inspect-old、migrate --dry-run、verify 和头像文件校验。"
fi

if [[ "$RUN_MIGRATION_SMOKE" == "true" ]]; then
  section "admin-migration reproducible smoke"
  "$ROOT_DIR/scripts/test-migration-smoke.sh"
else
  if [[ "$RELEASE_GATE" == "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要 RUN_MIGRATION_SMOKE=true，发布候选必须执行可重建迁移 smoke。"
    exit 1
  fi
  echo "SKIP: RUN_MIGRATION_SMOKE=true 未设置，跳过可重建迁移 smoke。发布前必须执行 RUN_MIGRATION_SMOKE=true scripts/test-migration.sh。"
fi

echo
echo "Migration gate completed."
