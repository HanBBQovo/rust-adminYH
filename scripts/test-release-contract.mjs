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

const checkAll = read('scripts/check-all.sh')
const backendGate = read('scripts/test-backend.sh')
const backendMysqlContract = read('scripts/test-backend-mysql-contract.mjs')
const migrationGate = read('scripts/test-migration.sh')
const dockerGate = read('scripts/test-docker.sh')
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
assertIncludes(releasePreflight, 'RUN_COVERAGE=true', 'release preflight regression must execute a missing coverage case')
assertIncludes(releasePreflight, 'RUN_TAURI_SIDECAR_SMOKE=true', 'release preflight regression must execute a missing sidecar smoke case')
assertIncludes(releasePreflight, 'TAURI_SIDECAR_DATABASE_URL', 'release preflight regression must execute a missing sidecar database URL case')

assertIncludes(backendGate, 'FAIL: RELEASE_GATE=true 不允许跳过真实 MySQL repository 集成测试。', 'backend gate must not allow release builds to skip real MySQL tests')
assertIncludes(backendGate, 'scripts/test-backend-mysql-contract.mjs', 'backend gate must always run the MySQL coverage contract')
assertIncludes(backendGate, 'admin-api MySQL API compatibility integration tests', 'backend gate must include real MySQL HTTP compatibility tests')
assertIncludes(backendGate, '--test mysql_api_compatibility -- --ignored', 'backend gate must run ignored MySQL API compatibility tests when DB gate is enabled')
assertIncludes(backendMysqlContract, 'crates/admin-db/tests', 'backend MySQL contract must scan admin-db integration tests')
assertIncludes(backendMysqlContract, 'crates/admin-api/tests', 'backend MySQL contract must scan admin-api integration tests')
assertIncludes(backendMysqlContract, '-p ${packageName} --test ${testName} -- --ignored', 'backend MySQL contract must verify every mysql_*.rs file is wired into RUN_DB_TESTS')

assertIncludes(migrationGate, 'FAIL: RELEASE_GATE=true 不允许跳过真实数据库迁移 dry-run/verify', 'migration gate must not allow release builds to skip real migration verification')
assertIncludes(migrationGate, 'FAIL: RELEASE_GATE=true 需要 NEW_AVATAR_DIR', 'migration gate must require avatar file verification for release')
assertIncludes(migrationGate, 'migrate --dry-run', 'migration gate must run dry-run migration before any optional apply')
assertIncludes(migrationGate, 'verify --old "$OLD_DATABASE_URL" --new "$NEW_DATABASE_URL"', 'migration gate must run old/new database verify')
assertIncludes(migrationGate, 'verify-files --old-avatar-dir "$OLD_AVATAR_DIR" --new-avatar-dir "$NEW_AVATAR_DIR"', 'migration gate must verify avatar files when a new avatar dir is provided')

assertIncludes(dockerGate, 'RUN_DOCKER_E2E="${RUN_DOCKER_E2E:-false}"', 'Docker gate must keep real browser E2E opt-in')
assertIncludes(dockerGate, 'PLAYWRIGHT_BASE_URL="${WEB_URL%/}" REAL_API_E2E=true npm run e2e -- e2e/real-api.spec.ts', 'Docker gate must run browser E2E against compose nginx web URL')
assertIncludes(dockerGate, 'scripts/seed-docker-e2e.sql', 'Docker gate must seed MySQL before real API E2E')

assertIncludes(tauriGate, 'RUN_TAURI_SIDECAR_SMOKE', 'Tauri gate must keep bundled sidecar smoke explicit')
assertIncludes(tauriGate, 'if [[ "${RUN_TAURI_SIDECAR_SMOKE:-false}" == "true" ]]; then', 'Tauri gate must keep bundled sidecar smoke as an explicit opt-in branch')
assertIncludes(tauriGate, 'TAURI_SIDECAR_DATABASE_URL', 'Tauri gate must support an explicit sidecar smoke DB URL')
assertIncludes(tauriGate, 'RUN_TAURI_DMG', 'Tauri gate must keep DMG validation explicit')
assertIncludes(tauriGate, 'if [[ "${RUN_TAURI_DMG:-false}" == "true" ]]; then', 'Tauri gate must keep DMG generation as an explicit opt-in branch')
assertIncludes(tauriContract, 'RUN_TAURI_SIDECAR_SMOKE', 'Tauri contract must statically lock sidecar smoke coverage')

assertIncludes(dockerContract, 'RUN_DOCKER_E2E', 'Docker contract must statically lock Docker real E2E requirements')
assertIncludes(ciWorkflow, 'workflow_dispatch:', 'GitHub Actions must stay manual during active development')
assert(!ciWorkflow.includes('push:'), 'GitHub Actions must not auto-run on push during active development')
assert(!ciWorkflow.includes('pull_request:'), 'GitHub Actions must not auto-run on pull_request during active development')
assertIncludes(ciWorkflow, 'run_docker:', 'manual workflow must expose Docker release input')
assertIncludes(ciWorkflow, 'run_tauri:', 'manual workflow must expose Tauri release input')

assertIncludes(databaseMigration, 'verify-files', 'database migration docs must include avatar file verification')
assertIncludes(databaseMigration, 'rollback-plan', 'database migration docs must include rollback planning')
assertIncludes(apiCompatibility, 'RUN_DB_TESTS=true ADMIN_DB_TEST_DATABASE_URL=...', 'API compatibility docs must point release DB gates to real MySQL tests')
assertIncludes(apiCompatibility, '真实 MySQL HTTP', 'API compatibility docs must document real MySQL HTTP compatibility coverage')

console.log('Release contract OK')
