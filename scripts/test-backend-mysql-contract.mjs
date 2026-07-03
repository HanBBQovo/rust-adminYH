#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
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

function listFilesRecursive(dir, predicate) {
  try {
    return readdirSync(dir)
      .flatMap((entry) => {
        const path = join(dir, entry)
        const stats = statSync(path)
        if (stats.isDirectory()) {
          return listFilesRecursive(path, predicate)
        }
        return predicate(path) ? [path] : []
      })
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
const transactionHelper = read('crates/admin-db/src/transaction.rs')
const repositoryFiles = listFilesRecursive('crates/admin-db/src/repositories', (file) => file.endsWith('.rs'))

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
assertIncludes(
  transactionHelper,
  'pub type MySqlTransaction',
  'admin-db must expose a shared MySQL transaction type alias',
)
assertIncludes(
  transactionHelper,
  'begin_mysql_transaction',
  'admin-db must expose a shared MySQL transaction begin helper',
)
assertIncludes(
  transactionHelper,
  'commit_mysql_transaction',
  'admin-db must expose a shared MySQL transaction commit helper',
)
assertIncludes(
  transactionHelper,
  'transaction {scope} {phase} failed',
  'transaction helper errors must include the repository scope and transaction phase',
)
assertIncludes(
  rebuildPlan,
  'admin-db::transaction',
  'rebuild plan must document the shared admin-db transaction helper requirement',
)

for (const file of repositoryFiles) {
  const content = read(file)
  assert(
    !content.includes('.begin().await'),
    `${file} must use begin_mysql_transaction instead of direct pool.begin() calls`,
  )
  assert(
    !content.includes('.commit().await'),
    `${file} must use commit_mysql_transaction instead of direct tx.commit() calls`,
  )
  assert(
    !/Transaction<'_,\s*MySql>/.test(content),
    `${file} must use MySqlTransaction<'_> instead of raw sqlx Transaction aliases`,
  )
}

console.log('Backend MySQL contract OK')
