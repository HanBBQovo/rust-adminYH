#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${WEB_DIR:-$ROOT_DIR/apps/desktop/web}"

section() {
  printf '\n==> %s\n' "$1"
}

run_script_if_present() {
  local script_name="$1"
  local label="$2"

  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script_name'] ? 0 : 1)" 2>/dev/null; then
    section "$label"
    npm run "$script_name"
  else
    echo "SKIP: npm script '$script_name' 未定义。"
  fi
}

if [[ ! -d "$WEB_DIR" || ! -f "$WEB_DIR/package.json" ]]; then
  echo "SKIP: 前端目录不存在或缺少 package.json：$WEB_DIR"
  echo "TODO: 从 frontend-template/web 派生 apps/desktop/web 后启用前端质量门禁。"
  exit 0
fi

cd "$WEB_DIR"

if [[ ! -d node_modules ]]; then
  section "Install frontend dependencies"
  npm ci
fi

run_script_if_present "lint" "Frontend lint"
run_script_if_present "typecheck" "Frontend typecheck"
run_script_if_present "test" "Frontend unit/component tests"
run_script_if_present "build" "Frontend production build"

echo
echo "Frontend gate passed."
