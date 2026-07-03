#!/usr/bin/env node
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Release contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertOccurrences(content, expected, minCount, message) {
  const count = content.split(expected).length - 1
  assert(count >= minCount, `${message}; expected at least ${minCount}, found ${count}`)
}

const checkAll = read('scripts/check-all.sh')
const backendGate = read('scripts/test-backend.sh')
const backendMysqlContract = read('scripts/test-backend-mysql-contract.mjs')
const migrationGate = read('scripts/test-migration.sh')
const migrationSource = read('crates/admin-migration/src/lib.rs')
const dockerGate = read('scripts/test-docker.sh')
const frontendGate = read('scripts/test-frontend.sh')
const frontendDepsInstaller = read('scripts/install-frontend-deps.sh')
const tauriGate = read('scripts/test-tauri-build.sh')
const tauriContract = read('scripts/test-tauri-contract.sh')
const dockerContract = read('scripts/test-docker-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const databaseMigration = read('docs/database-migration.md')
const apiCompatibility = read('docs/api-compatibility.md')
const releasePreflight = read('scripts/test-release-preflight.mjs')
const ciWorkflow = read('.github/workflows/ci.yml')

const releaseRequirements = [
  ['RUN_DB_TESTS=true', '发布候选必须执行真实 MySQL repository/API 集成测试'],
  ['ADMIN_DB_TEST_DATABASE_URL', '发布候选必须显式指向可重建 MySQL 测试库'],
  ['OLD_DATABASE_URL', '发布候选必须提供旧库/影子旧库连接'],
  ['NEW_DATABASE_URL', '发布候选必须提供新库/影子新库连接'],
  ['MIGRATION_APPLY=true', '发布候选必须真实执行迁移 apply 并复验'],
  ['NEW_AVATAR_DIR', '发布候选必须校验新头像目录'],
  ['RUN_E2E=true', '发布候选必须执行 Playwright E2E'],
  ['RUN_COVERAGE=true', '发布候选必须执行前端覆盖率门禁'],
  ['RUN_DOCKER=true', '发布候选必须构建 Docker 镜像并跑 compose 健康检查'],
  ['RUN_DOCKER_E2E=true', '发布候选必须执行 Docker Web + Rust API + MySQL 浏览器 E2E'],
  ['RUN_TAURI=true', '发布候选必须构建 Tauri app'],
  ['RUN_TAURI_DMG=true', '发布候选必须验证 macOS DMG 打包流程'],
  ['RUN_TAURI_SIDECAR_SMOKE=true', '发布候选必须启动打包后的 sidecar 并验证 /api/health'],
  ['TAURI_SIDECAR_DATABASE_URL', '发布候选必须为 Tauri sidecar smoke 提供测试库'],
]

assertIncludes(checkAll, 'RELEASE_GATE="${RELEASE_GATE:-false}"', 'check-all must expose the RELEASE_GATE switch')
assertIncludes(checkAll, 'section "Release gate preflight"', 'check-all must run release gate preflight before ordinary gates')
assertIncludes(checkAll, 'Release gate preflight passed.', 'check-all must print an explicit release preflight success message')
assertIncludes(checkAll, 'scripts/test-release-contract.mjs', 'check-all must always run the release contract test')
assertIncludes(checkAll, 'scripts/test-release-preflight.mjs', 'check-all must always run executable release preflight regressions')
assertIncludes(checkAll, 'SKIP_RELEASE_PREFLIGHT_SELFTEST', 'check-all must expose a recursion guard for release preflight self-tests')

for (const [token, message] of releaseRequirements) {
  const variableName = token.split('=')[0]
  assertIncludes(checkAll, variableName, `check-all release preflight must require ${token}: ${message}`)
  assertIncludes(rebuildPlan, token, `rebuild plan must document release requirement ${token}: ${message}`)
}

assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_DB_TESTS=true', 'release preflight must fail if real DB tests are disabled')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 ADMIN_DB_TEST_DATABASE_URL', 'release preflight must fail without admin DB test URL')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 OLD_DATABASE_URL 和 NEW_DATABASE_URL', 'release preflight must fail without migration DB URLs')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 MIGRATION_APPLY=true', 'release preflight must fail if real migration apply is disabled')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 NEW_AVATAR_DIR', 'release preflight must fail without avatar verify target')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_E2E=true', 'release preflight must fail without frontend E2E')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_COVERAGE=true', 'release preflight must fail without coverage')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_DOCKER=true', 'release preflight must fail without Docker build gate')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_DOCKER_E2E=true', 'release preflight must fail without Docker real browser E2E')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_TAURI=true', 'release preflight must fail without Tauri build')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_TAURI_DMG=true', 'release preflight must fail without DMG validation')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 RUN_TAURI_SIDECAR_SMOKE=true', 'release preflight must fail without bundled sidecar smoke')
assertIncludes(checkAll, 'FAIL: RELEASE_GATE=true 需要 TAURI_SIDECAR_DATABASE_URL 或 DATABASE_URL', 'release preflight must fail without sidecar smoke DB URL')
assertIncludes(releasePreflight, 'Release preflight regression OK', 'release preflight regression script must print an explicit success marker')
assertIncludes(releasePreflight, 'SKIP_RELEASE_PREFLIGHT_SELFTEST', 'release preflight regression must guard nested check-all calls')
assertIncludes(releasePreflight, '========== Backend ==========', 'release preflight regression must prove failures stop before backend gates')
assertIncludes(releasePreflight, 'RUN_DB_TESTS=true', 'release preflight regression must execute a missing DB toggle case')
assertIncludes(releasePreflight, 'MIGRATION_APPLY=true', 'release preflight regression must execute a missing migration apply case')
assertIncludes(releasePreflight, 'RUN_COVERAGE=true', 'release preflight regression must execute a missing coverage case')
assertIncludes(releasePreflight, 'RUN_DOCKER_E2E=true', 'release preflight regression must execute a missing Docker E2E case')
assertIncludes(releasePreflight, 'RUN_TAURI_DMG=true', 'release preflight regression must execute a missing Tauri DMG case')
assertIncludes(releasePreflight, 'RUN_TAURI_SIDECAR_SMOKE=true', 'release preflight regression must execute a missing sidecar smoke case')
assertIncludes(releasePreflight, 'TAURI_SIDECAR_DATABASE_URL', 'release preflight regression must execute a missing sidecar database URL case')

assertIncludes(backendGate, 'FAIL: RELEASE_GATE=true 不允许跳过真实 MySQL repository 集成测试。', 'backend gate must not allow release builds to skip real MySQL tests')
assertIncludes(backendGate, 'scripts/test-backend-mysql-contract.mjs', 'backend gate must always run the MySQL coverage contract')
assertIncludes(backendGate, 'run_mysql_tests "admin-api" "$ROOT_DIR/crates/admin-api/tests"', 'backend gate must auto-discover real MySQL HTTP compatibility tests')
assertIncludes(backendGate, '-p "$package_name" --test "$test_name" -- --ignored', 'backend gate must run ignored MySQL tests when DB gate is enabled')
assertIncludes(backendMysqlContract, 'crates/admin-db/tests', 'backend MySQL contract must scan admin-db integration tests')
assertIncludes(backendMysqlContract, 'crates/admin-api/tests', 'backend MySQL contract must scan admin-api integration tests')
assertIncludes(backendMysqlContract, 'backend gate must auto-discover mysql_*.rs tests', 'backend MySQL contract must verify mysql_*.rs auto-discovery is wired into RUN_DB_TESTS')

assertIncludes(migrationGate, 'FAIL: RELEASE_GATE=true 不允许跳过真实数据库迁移 dry-run/verify', 'migration gate must not allow release builds to skip real migration verification')
assertIncludes(migrationGate, 'FAIL: RELEASE_GATE=true 需要 MIGRATION_APPLY=true', 'migration gate must not allow release builds to skip real migration apply')
assertIncludes(migrationGate, 'FAIL: RELEASE_GATE=true 需要 NEW_AVATAR_DIR', 'migration gate must require avatar file verification for release')
assertIncludes(migrationGate, 'migrate --dry-run', 'migration gate must run dry-run migration before any optional apply')
assertIncludes(migrationSource, 'failed to connect to target database for dry-run preflight', 'migration dry-run must connect to the target database for schema preflight')
assertIncludes(migrationSource, 'targetPreflight', 'migration report must expose target preflight details')
assertIncludes(migrationSource, 'dry-run target preflight: target schema is reachable and empty', 'migration dry-run must report an empty reachable target schema')
assertIncludes(migrationGate, 'MIGRATION_APPLY" == "true"', 'migration gate must keep real apply behind an explicit flag for non-release use')
assertIncludes(migrationGate, 'verify --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL"', 'migration gate must run old/new database verify')
assertIncludes(migrationGate, 'verify-files --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR"', 'migration gate must verify avatar files when a new avatar dir is provided')

assertIncludes(dockerGate, 'RUN_DOCKER_E2E="${RUN_DOCKER_E2E:-false}"', 'Docker gate must keep real browser E2E opt-in')
assertIncludes(dockerGate, 'PLAYWRIGHT_BASE_URL="${WEB_URL%/}" REAL_API_E2E=true npm run e2e -- e2e/real-api.spec.ts', 'Docker gate must run browser E2E against compose nginx web URL')
assertIncludes(dockerGate, 'scripts/seed-docker-e2e.sql', 'Docker gate must seed MySQL before real API E2E')
assertIncludes(frontendGate, 'scripts/install-frontend-deps.sh', 'frontend gate must install missing dependencies through the shared npm ci wrapper')
assertIncludes(frontendDepsInstaller, 'NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"', 'shared frontend installer must pin the default npm registry')
assertIncludes(frontendDepsInstaller, 'npm ci --prefix "$WEB_DIR"', 'shared frontend installer must install the web package through --prefix')
assertIncludes(frontendDepsInstaller, '--registry="$NPM_REGISTRY"', 'shared frontend installer must use the configured npm registry')
assertIncludes(frontendDepsInstaller, '--replace-registry-host=always', 'shared frontend installer must normalize mixed package-lock registry hosts')
assertIncludes(frontendDepsInstaller, '--fetch-retries=5', 'shared frontend installer must retry transient registry/network failures')
assertIncludes(frontendDepsInstaller, '--fetch-retry-mintimeout=20000', 'shared frontend installer must use stable npm retry minimum timeout')
assertIncludes(frontendDepsInstaller, '--fetch-retry-maxtimeout=120000', 'shared frontend installer must use stable npm retry maximum timeout')
assertIncludes(frontendDepsInstaller, '--no-audit', 'shared frontend installer must skip npm audit during deterministic CI install')
assertIncludes(frontendDepsInstaller, '--no-fund', 'shared frontend installer must skip npm fund output during deterministic CI install')

assertIncludes(tauriGate, 'RUN_TAURI_SIDECAR_SMOKE', 'Tauri gate must keep bundled sidecar smoke explicit')
assertIncludes(tauriGate, 'if [[ "${RUN_TAURI_SIDECAR_SMOKE:-false}" == "true" ]]; then', 'Tauri gate must keep bundled sidecar smoke as an explicit opt-in branch')
assertIncludes(tauriGate, 'TAURI_SIDECAR_DATABASE_URL', 'Tauri gate must support an explicit sidecar smoke DB URL')
assertIncludes(tauriGate, 'SIDECAR_SMOKE_PORT="${SIDECAR_SMOKE_PORT:-16824}"', 'Tauri gate must allow the bundled sidecar smoke port to be overridden')
assertIncludes(tauriGate, 'APP_HTTP__PORT="$SIDECAR_SMOKE_PORT"', 'Tauri gate must launch the bundled sidecar on the configured smoke port')
assertIncludes(tauriGate, 'sidecar_smoke_port=${SIDECAR_SMOKE_PORT}', 'Tauri gate diagnostics must print the selected smoke port')
assertIncludes(tauriGate, 'RUN_TAURI_DMG', 'Tauri gate must keep DMG validation explicit')
assertIncludes(tauriGate, 'if [[ "${RUN_TAURI_DMG:-false}" == "true" ]]; then', 'Tauri gate must keep DMG generation as an explicit opt-in branch')
assertIncludes(tauriContract, 'RUN_TAURI_SIDECAR_SMOKE', 'Tauri contract must statically lock sidecar smoke coverage')

assertIncludes(dockerContract, 'RUN_DOCKER_E2E', 'Docker contract must statically lock Docker real E2E requirements')
assertIncludes(ciWorkflow, 'workflow_dispatch:', 'GitHub Actions must stay manual during active development')
assert(!ciWorkflow.includes('push:'), 'GitHub Actions must not auto-run on push during active development')
assert(!ciWorkflow.includes('pull_request:'), 'GitHub Actions must not auto-run on pull_request during active development')
assertIncludes(ciWorkflow, 'release_candidate:', 'manual workflow must expose an explicit release candidate input')
assertIncludes(ciWorkflow, 'run_docker:', 'manual workflow must expose Docker release input')
assertIncludes(ciWorkflow, 'run_tauri:', 'manual workflow must expose Tauri release input')
assertIncludes(ciWorkflow, 'run_tauri_dmg:', 'manual workflow must expose Tauri DMG release input')
assertIncludes(ciWorkflow, 'run_tauri_sidecar_smoke:', 'manual workflow must expose bundled Tauri sidecar smoke input')
assertIncludes(ciWorkflow, 'NPM_REGISTRY: https://registry.npmjs.org', 'GitHub workflow must pin the npm registry used by release jobs')
assertOccurrences(ciWorkflow, 'install-frontend-deps.sh', 4, 'GitHub release workflow npm installs must delegate to the shared frontend dependency installer')
assertIncludes(ciWorkflow, 'release-candidate-preflight:', 'manual workflow must include a release candidate preflight job')
assertIncludes(ciWorkflow, 'RELEASE_CANDIDATE: ${{ inputs.release_candidate }}', 'release candidate preflight must read the release_candidate input')
assertIncludes(ciWorkflow, 'RUN_DOCKER: ${{ inputs.run_docker }}', 'release candidate preflight must verify the Docker toggle')
assertIncludes(ciWorkflow, 'RUN_DOCKER_E2E: ${{ inputs.run_docker_e2e }}', 'release candidate preflight must verify the Docker E2E toggle')
assertIncludes(ciWorkflow, 'RUN_TAURI: ${{ inputs.run_tauri }}', 'release candidate preflight must verify the Tauri toggle')
assertIncludes(ciWorkflow, 'RUN_TAURI_DMG: ${{ inputs.run_tauri_dmg }}', 'release candidate preflight must verify the Tauri DMG toggle')
assertIncludes(ciWorkflow, 'RUN_TAURI_SIDECAR_SMOKE: ${{ inputs.run_tauri_sidecar_smoke }}', 'release candidate preflight must verify the sidecar smoke toggle')
assertIncludes(ciWorkflow, "ADMIN_DB_TEST_DATABASE_URL_SET: ${{ secrets.ADMIN_DB_TEST_DATABASE_URL != '' }}", 'release candidate preflight must verify the real MySQL test secret exists')
assertIncludes(ciWorkflow, "OLD_DATABASE_URL_SET: ${{ secrets.OLD_DATABASE_URL != '' }}", 'release candidate preflight must verify the old migration DB secret exists')
assertIncludes(ciWorkflow, "NEW_DATABASE_URL_SET: ${{ secrets.NEW_DATABASE_URL != '' }}", 'release candidate preflight must verify the new migration DB secret exists')
assertIncludes(ciWorkflow, "NEW_AVATAR_DIR_SET: ${{ secrets.NEW_AVATAR_DIR != '' || vars.NEW_AVATAR_DIR != '' }}", 'release candidate preflight must verify the avatar target secret or variable exists')
assertIncludes(ciWorkflow, "TAURI_SIDECAR_DATABASE_URL_SET: ${{ secrets.TAURI_SIDECAR_DATABASE_URL != '' || secrets.DATABASE_URL != '' }}", 'release candidate preflight must verify a sidecar database secret exists')
assertIncludes(ciWorkflow, 'require_enabled_with_tauri "$RUN_TAURI_DMG" "run_tauri_dmg=true"', 'GitHub preflight must reject run_tauri_dmg=true when run_tauri=false')
assertIncludes(ciWorkflow, 'require_enabled_with_tauri "$RUN_TAURI_SIDECAR_SMOKE" "run_tauri_sidecar_smoke=true"', 'GitHub preflight must reject sidecar smoke when run_tauri=false')
assertIncludes(ciWorkflow, 'if [[ "$RUN_TAURI_SIDECAR_SMOKE" == "true" ]]; then', 'GitHub preflight must validate sidecar smoke inputs even outside release candidates')
assertIncludes(ciWorkflow, 'require_present "$TAURI_SIDECAR_DATABASE_URL_SET" "TAURI_SIDECAR_DATABASE_URL or DATABASE_URL secret"', 'GitHub preflight must require the sidecar smoke database secret as soon as smoke is enabled')
assertIncludes(ciWorkflow, 'FAIL: ${label} requires run_tauri=true.', 'GitHub preflight must explain invalid dependent Tauri inputs before heavy jobs start')
assertIncludes(ciWorkflow, 'GitHub release candidate preflight passed.', 'release candidate preflight must print an explicit success marker')
assertIncludes(ciWorkflow, 'needs: release-candidate-preflight', 'all GitHub jobs must depend on the release candidate preflight')
assertIncludes(ciWorkflow, 'RELEASE_GATE: ${{ inputs.release_candidate }}', 'backend and migration jobs must receive the release gate flag')
assertIncludes(ciWorkflow, 'RUN_DB_TESTS: ${{ inputs.release_candidate }}', 'backend job must enable real MySQL tests for release candidates')
assertIncludes(ciWorkflow, 'ADMIN_DB_TEST_DATABASE_URL: ${{ secrets.ADMIN_DB_TEST_DATABASE_URL }}', 'backend job must receive the real MySQL test secret')
assertIncludes(ciWorkflow, 'if: ${{ inputs.release_candidate }}', 'frontend job must gate coverage on release_candidate')
assertIncludes(ciWorkflow, 'npm run test:coverage', 'frontend job must run coverage for release candidates')
assertIncludes(ciWorkflow, 'OLD_DATABASE_URL: ${{ secrets.OLD_DATABASE_URL }}', 'migration job must receive the old database URL')
assertIncludes(ciWorkflow, 'NEW_DATABASE_URL: ${{ secrets.NEW_DATABASE_URL }}', 'migration job must receive the new database URL')
assertIncludes(ciWorkflow, 'MIGRATION_APPLY: ${{ inputs.release_candidate }}', 'migration job must force real apply for release candidates')
assertIncludes(ciWorkflow, 'NEW_AVATAR_DIR: ${{ vars.NEW_AVATAR_DIR || secrets.NEW_AVATAR_DIR }}', 'migration job must receive the avatar verification target')
assertIncludes(
  ciWorkflow,
  'RUN_TAURI_SIDECAR_SMOKE=${{ inputs.run_tauri_sidecar_smoke }}',
  'Tauri workflow must pass the sidecar smoke input into the build gate',
)
assertIncludes(
  ciWorkflow,
  'TAURI_SIDECAR_DATABASE_URL: ${{ secrets.TAURI_SIDECAR_DATABASE_URL || secrets.DATABASE_URL }}',
  'Tauri workflow must pass a sidecar smoke database secret into the build gate',
)
assertIncludes(ciWorkflow, 'name: tauri-macos-app', 'Tauri workflow must upload the macOS app bundle')
assertIncludes(ciWorkflow, 'name: tauri-macos-dmg', 'Tauri workflow must upload the macOS DMG bundle when requested')
assertIncludes(
  ciWorkflow,
  'if: ${{ inputs.run_tauri_dmg }}',
  'Tauri workflow must only require a DMG artifact when the DMG input is enabled',
)

assertIncludes(databaseMigration, 'verify-files', 'database migration docs must include avatar file verification')
assertIncludes(databaseMigration, 'rollback-plan', 'database migration docs must include rollback planning')
assertIncludes(apiCompatibility, 'RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=...', 'API compatibility docs must point release DB gates to real MySQL tests')
assertIncludes(apiCompatibility, '真实 MySQL HTTP', 'API compatibility docs must document real MySQL HTTP compatibility coverage')
assertIncludes(rebuildPlan, 'release_candidate=true', 'rebuild plan must document GitHub release candidate preflight')
assertIncludes(rebuildPlan, 'GitHub 发布候选', 'rebuild plan must include a GitHub release candidate gate row')

console.log('Release contract OK')
