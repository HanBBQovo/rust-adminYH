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
const menuRepository = read('crates/admin-db/src/repositories/menu.rs')
const orderRepository = read('crates/admin-db/src/repositories/order.rs')
const roleRepository = read('crates/admin-db/src/repositories/role.rs')
const userRepository = read('crates/admin-db/src/repositories/user.rs')
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
  'pub struct MySqlTransaction',
  'admin-db must expose a shared scoped MySQL transaction wrapper',
)
assertIncludes(
  transactionHelper,
  "scope: &'static str",
  'shared MySQL transaction wrapper must store the transaction scope',
)
assertIncludes(
  transactionHelper,
  'pub fn scope(&self)',
  'shared MySQL transaction wrapper must expose its scope for diagnostics',
)
assertIncludes(
  transactionHelper,
  'begin_mysql_transaction',
  'admin-db must expose a shared MySQL transaction begin helper',
)
assertIncludes(
  transactionHelper,
  'pub async fn commit_mysql_transaction(tx: MySqlTransaction',
  'admin-db commit helper must consume the scoped transaction without a repeated scope argument',
)
assertIncludes(
  transactionHelper,
  'with_mysql_transaction',
  'admin-db must expose a transaction runner for begin/body/commit blocks',
)
assertIncludes(
  transactionHelper,
  'rollback_on_drop',
  'transaction runner must emit rollback-on-drop diagnostics when the body fails',
)
assertIncludes(
  transactionHelper,
  'transaction_sql_error',
  'transaction runner must provide scoped SQL operation error mapping',
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
assertIncludes(
  rebuildPlan,
  'with_mysql_transaction',
  'rebuild plan must document the shared transaction runner requirement',
)
assertIncludes(
  roleRepository,
  'with_mysql_transaction(&self.pool, "role.replace_menu_ids"',
  'role.replace_menu_ids must use the shared transaction runner',
)
assert(
  !roleRepository.includes('begin_mysql_transaction(&self.pool, "role.replace_menu_ids"'),
  'role.replace_menu_ids must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  roleRepository,
  'transaction_sql_error(scope, "delete_role_permissions"',
  'role.replace_menu_ids must include scoped SQL error context for delete',
)
assertIncludes(
  roleRepository,
  'transaction_sql_error(scope, "insert_role_permission"',
  'role.replace_menu_ids must include scoped SQL error context for insert',
)
assertIncludes(
  roleRepository,
  'with_mysql_transaction(&self.pool, "role.remove"',
  'role.remove must use the shared transaction runner',
)
assert(
  !roleRepository.includes('begin_mysql_transaction(&self.pool, "role.remove"'),
  'role.remove must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  roleRepository,
  'transaction_sql_error(scope, "ensure_role_not_assigned_to_users"',
  'role.remove must include scoped SQL error context for assigned-user guard',
)
assertIncludes(
  roleRepository,
  'transaction_sql_error(scope, "delete_role"',
  'role.remove must include scoped SQL error context for role delete',
)
assertIncludes(
  roleRepository,
  'transaction_sql_error(scope, "delete_role_permissions"',
  'role.remove must include scoped SQL error context for permission cleanup',
)
assertIncludes(
  menuRepository,
  'with_mysql_transaction(&self.pool, "menu.remove"',
  'menu.remove must use the shared transaction runner',
)
assert(
  !menuRepository.includes('begin_mysql_transaction(&self.pool, "menu.remove"'),
  'menu.remove must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  menuRepository,
  'transaction_sql_error(scope, "count_menu_children"',
  'menu.remove must include scoped SQL error context for child guard',
)
assertIncludes(
  menuRepository,
  'transaction_sql_error(scope, "delete_menu_permissions"',
  'menu.remove must include scoped SQL error context for permission cleanup',
)
assertIncludes(
  menuRepository,
  'transaction_sql_error(scope, "delete_menu"',
  'menu.remove must include scoped SQL error context for menu delete',
)
assertIncludes(
  userRepository,
  'with_mysql_transaction(&self.pool, "user.update_avatar"',
  'user.update_avatar must use the shared transaction runner',
)
assert(
  !userRepository.includes('begin_mysql_transaction(&self.pool, "user.update_avatar"'),
  'user.update_avatar must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  userRepository,
  'transaction_sql_error(scope, "ensure_user_exists"',
  'user.update_avatar must include scoped SQL error context for user existence check',
)
assertIncludes(
  userRepository,
  'transaction_sql_error(scope, "update_user_avatar_url"',
  'user.update_avatar must include scoped SQL error context for user avatar URL update',
)
assertIncludes(
  userRepository,
  'transaction_sql_error(scope, "find_existing_avatar"',
  'user.update_avatar must include scoped SQL error context for avatar lookup',
)
assertIncludes(
  userRepository,
  'transaction_sql_error(scope, "update_avatar_metadata"',
  'user.update_avatar must include scoped SQL error context for avatar update',
)
assertIncludes(
  userRepository,
  'transaction_sql_error(scope, "insert_avatar_metadata"',
  'user.update_avatar must include scoped SQL error context for avatar insert',
)
assertIncludes(
  orderRepository,
  'with_mysql_transaction(&self.pool, "order.remove"',
  'order.remove must use the shared transaction runner',
)
assert(
  !orderRepository.includes('begin_mysql_transaction(&self.pool, "order.remove"'),
  'order.remove must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "fetch_order_oddnumber"',
  'order.remove must include scoped SQL error context for old order lookup',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "delete_company_order"',
  'order.remove must include scoped SQL error context for company_order cleanup',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "count_same_oddnumber_orders"',
  'order.remove must include scoped SQL error context for duplicate oddnumber count',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "read_same_oddnumber_count"',
  'order.remove must include scoped SQL error context for duplicate oddnumber count decode',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "delete_receipt"',
  'order.remove must include scoped SQL error context for receipt cleanup',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "delete_order"',
  'order.remove must include scoped SQL error context for order delete',
)
assertIncludes(
  orderRepository,
  'with_mysql_transaction(&self.pool, "order.create"',
  'order.create must use the shared transaction runner',
)
assert(
  !orderRepository.includes('begin_mysql_transaction(&self.pool, "order.create"'),
  'order.create must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "insert_order"',
  'order.create must include scoped SQL error context for order insert',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "insert_company_order"',
  'order.create must include scoped SQL error context for company_order insert',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "insert_receipt_from_order"',
  'order.create must include scoped SQL error context for receipt insert',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "find_memory"',
  'order.create must include scoped SQL error context for memory lookup',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "insert_memory"',
  'order.create must include scoped SQL error context for memory insert',
)
assertIncludes(
  orderRepository,
  'with_mysql_transaction(&self.pool, "order.update"',
  'order.update must use the shared transaction runner',
)
assert(
  !orderRepository.includes('begin_mysql_transaction(&self.pool, "order.update"'),
  'order.update must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "fetch_order_for_update"',
  'order.update must include scoped SQL error context for old order lookup',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "update_order_row"',
  'order.update must include scoped SQL error context for order update',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "update_company_order"',
  'order.update must include scoped SQL error context for company_order update',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "update_receipt_from_order"',
  'order.update must include scoped SQL error context for receipt update',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "delete_receipt"',
  'order.update must include scoped SQL error context for receipt delete',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "count_positive_receipt_need"',
  'order.update must include scoped SQL error context for receipt need count',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(scope, "read_positive_receipt_need_count"',
  'order.update must include scoped SQL error context for receipt need count decode',
)
assertIncludes(
  orderRepository,
  'with_mysql_transaction(&self.pool, "receipt.batch_status"',
  'receipt.batch_status must use the shared transaction runner',
)
assert(
  !orderRepository.includes('begin_mysql_transaction(&self.pool, "receipt.batch_status"'),
  'receipt.batch_status must not hand-roll begin/commit after runner migration',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(tx.scope(), "fetch_existing_receipt_ids"',
  'receipt.batch_status must include scoped SQL error context for locked receipt lookup',
)
assertIncludes(
  orderRepository,
  'transaction_sql_error(tx.scope(), "update_receipt_status_rows"',
  'receipt.batch_status must include scoped SQL error context for batch update',
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
  assert(
    !/commit_mysql_transaction\([^,\n]+,\s*["'`]/.test(content),
    `${file} must rely on the scoped transaction wrapper instead of passing commit scope strings`,
  )
}

console.log('Backend MySQL contract OK')
