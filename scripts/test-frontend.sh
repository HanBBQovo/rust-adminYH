#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${WEB_DIR:-$ROOT_DIR/apps/desktop/web}"
RUN_E2E="${RUN_E2E:-false}"
RUN_COVERAGE="${RUN_COVERAGE:-false}"
RELEASE_GATE="${RELEASE_GATE:-false}"

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
  if [[ "$RELEASE_GATE" == "true" ]]; then
    echo "FAIL: RELEASE_GATE=true 需要前端 package.json，发布候选不能跳过前端质量门禁：$WEB_DIR"
    exit 1
  fi
  echo "SKIP: 前端目录不存在或缺少 package.json：$WEB_DIR"
  echo "TODO: 从 frontend-template/web 派生 apps/desktop/web 后启用前端质量门禁。"
  exit 0
fi

if [[ "$RELEASE_GATE" == "true" && "$RUN_COVERAGE" != "true" ]]; then
  echo "FAIL: RELEASE_GATE=true 需要 RUN_COVERAGE=true，发布候选不能跳过前端覆盖率门禁。"
  exit 1
fi

if [[ "$RELEASE_GATE" == "true" && "$RUN_E2E" != "true" ]]; then
  echo "FAIL: RELEASE_GATE=true 需要 RUN_E2E=true，发布候选不能跳过 Playwright E2E。"
  exit 1
fi

cd "$WEB_DIR"

if [[ ! -d node_modules ]]; then
  section "Install frontend dependencies"
  bash "$ROOT_DIR/scripts/install-frontend-deps.sh"
fi

run_required_script() {
  local script_name="$1"
  local label="$2"

  if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$script_name'] ? 0 : 1)" 2>/dev/null; then
    section "$label"
    npm run "$script_name"
  else
    echo "FAIL: npm script '$script_name' 未定义。"
    exit 1
  fi
}

run_required_script "lint" "Frontend lint"
section "Frontend architecture gate"
node "$ROOT_DIR/scripts/test-frontend-architecture.mjs"
section "Frontend header action contract"
node "$ROOT_DIR/scripts/test-frontend-header-action-contract.mjs"
section "Frontend pagination contract"
node "$ROOT_DIR/scripts/test-frontend-pagination-contract.mjs"
section "Frontend mutation action contract"
node "$ROOT_DIR/scripts/test-frontend-mutation-contract.mjs"
section "Frontend detail loader contract"
node "$ROOT_DIR/scripts/test-frontend-detail-loader-contract.mjs"
section "Frontend async action contract"
node "$ROOT_DIR/scripts/test-frontend-async-action-contract.mjs"
run_required_script "typecheck" "Frontend typecheck"
run_required_script "test" "Frontend unit/component tests"
if [[ "$RUN_COVERAGE" == "true" ]]; then
  run_required_script "test:coverage" "Frontend coverage gate"
else
  echo "SKIP: RUN_COVERAGE=true 未设置，跳过前端覆盖率门禁。"
fi
run_required_script "build" "Frontend production build"

if [[ "$RUN_E2E" == "true" ]]; then
  run_required_script "e2e" "Frontend E2E tests"
else
  echo "SKIP: RUN_E2E=true 未设置，跳过 Playwright E2E。"
fi

echo
echo "Frontend gate passed."
