#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(path) {
  return readFileSync(path, 'utf8')
}

function listMysqlTests(dir) {
  try {
    return readdirSync(dir)
      .filter((file) => /^mysql_.*\.rs$/.test(file))
      .map((file) => join(dir, file))
      .sort()
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Backend MySQL contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

const backendGate = read('scripts/test-backend.sh')
const checkAll = read('scripts/check-all.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const apiCompatibility = read('docs/api-compatibility.md')

const testFiles = [
  ...listMysqlTests('crates/admin-db/tests'),
  ...listMysqlTests('crates/admin-api/tests'),
]

assert(testFiles.length > 0, 'at least one real MySQL integration test file must exist')
assertIncludes(checkAll, 'scripts/test-backend.sh', 'check-all must run the backend gate')
assertIncludes(backendGate, 'scripts/test-backend-mysql-contract.mjs', 'backend gate must run this contract before optional DB tests')
assertIncludes(backendGate, 'RUN_DB_TESTS:-false', 'backend gate must keep real MySQL tests behind RUN_DB_TESTS=true')
assertIncludes(backendGate, 'ADMIN_DB_TEST_DATABASE_URL', 'backend gate must require an explicit rebuildable MySQL test database URL')
assertIncludes(backendGate, 'FAIL: RELEASE_GATE=true 不允许跳过真实 MySQL repository 集成测试。', 'release gate must fail if real MySQL tests are skipped')
assertIncludes(backendGate, '-- --ignored', 'backend gate must run ignored MySQL tests explicitly when DB tests are enabled')
assertIncludes(backendGate, 'run_mysql_tests()', 'backend gate must centralize real MySQL test execution')
assertIncludes(backendGate, 'find "$test_dir" -maxdepth 1 -type f -name \'mysql_*.rs\' | sort', 'backend gate must auto-discover mysql_*.rs tests')
assertIncludes(backendGate, '-p "$package_name" --test "$test_name" -- --ignored', 'backend gate must execute each discovered MySQL test target')
assertIncludes(backendGate, 'run_mysql_tests "admin-db" "$ROOT_DIR/crates/admin-db/tests"', 'backend gate must auto-discover admin-db MySQL tests')
assertIncludes(backendGate, 'run_mysql_tests "admin-api" "$ROOT_DIR/crates/admin-api/tests"', 'backend gate must auto-discover admin-api MySQL tests')
assertIncludes(releaseContract, 'scripts/test-backend-mysql-contract.mjs', 'release contract must lock the backend MySQL contract into default gates')

for (const file of testFiles) {
  const content = read(file)
  const tokioTestCount = [...content.matchAll(/#\[tokio::test\]/g)].length
  const ignoredCount = [
    ...content.matchAll(/#\[ignore = "requires RUN_DB_TESTS=true and ADMIN_DB_TEST_DATABASE_URL"\]/g),
  ].length

  assert(tokioTestCount > 0, `${file} must contain at least one #[tokio::test] real MySQL test`)
  assert(
    ignoredCount === tokioTestCount,
    `${file} must mark every real MySQL test as ignored with the standard RUN_DB_TESTS message`,
  )
  assertIncludes(content, 'ADMIN_DB_TEST_DATABASE_URL', `${file} must read the explicit MySQL test database URL`)
}

assertIncludes(
  apiCompatibility,
  'Backend MySQL contract OK',
  'API compatibility docs must document this backend MySQL coverage contract',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-backend-mysql-contract.mjs',
  'rebuild plan must document the backend MySQL coverage contract',
)

console.log('Backend MySQL contract OK')
