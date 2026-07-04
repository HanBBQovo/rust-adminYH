#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function read(path) {
  return readFileSync(path, 'utf8')
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
    console.error(`Backend SQL helper contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

const helperSource = read('crates/admin-db/src/repositories/sql.rs')
const repositoriesMod = read('crates/admin-db/src/repositories/mod.rs')
const backendGate = read('scripts/test-backend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const repositoryFiles = listFilesRecursive(
  'crates/admin-db/src/repositories',
  (file) => file.endsWith('.rs') && !file.endsWith('/mod.rs') && !file.endsWith('/sql.rs'),
)

const helperNames = [
  'db_error',
  'fetch_count',
  'get_nullable_string',
  'get_string',
  'get_i32',
  'get_i64',
  'get_optional_i64',
]

const requiredHelpers = [
  'pub(super) fn db_error',
  'pub(super) async fn fetch_count',
  'pub(super) fn get_nullable_string',
  'pub(super) fn get_string',
  'pub(super) fn get_i32',
  'pub(super) fn get_i64',
  'pub(super) fn get_optional_i64',
  'AppError::Database(error.to_string())',
  "QueryBuilder<'_, MySql>",
  'try_get::<Option<String>, _>',
  'try_get::<u64, _>',
  'try_get::<Option<i64>, _>',
]

const requiredRepositoryHelpers = new Map([
  ['crates/admin-db/src/repositories/chart.rs', ['db_error', 'fetch_count', 'get_i64', 'get_string']],
  [
    'crates/admin-db/src/repositories/company.rs',
    ['db_error', 'fetch_count', 'get_i64', 'get_string'],
  ],
  ['crates/admin-db/src/repositories/health.rs', ['db_error']],
  [
    'crates/admin-db/src/repositories/menu.rs',
    ['db_error', 'get_i32', 'get_i64', 'get_nullable_string', 'get_optional_i64', 'get_string'],
  ],
  ['crates/admin-db/src/repositories/order.rs', ['db_error', 'fetch_count', 'get_i64', 'get_string']],
  ['crates/admin-db/src/repositories/role.rs', ['db_error', 'fetch_count', 'get_i64', 'get_string']],
  [
    'crates/admin-db/src/repositories/user.rs',
    ['db_error', 'fetch_count', 'get_i32', 'get_i64', 'get_nullable_string', 'get_string'],
  ],
])

assert(repositoryFiles.length > 0, 'admin-db repository files must exist')
assertIncludes(repositoriesMod, 'mod sql;', 'repository module must register the shared SQL helpers')
assertIncludes(
  backendGate,
  'scripts/test-backend-sql-helper-contract.mjs',
  'backend gate must run the SQL helper contract',
)
assertIncludes(
  releaseContract,
  'scripts/test-backend-sql-helper-contract.mjs',
  'release contract must lock the backend SQL helper contract into default gates',
)
assertIncludes(
  rebuildPlan,
  'crates/admin-db/src/repositories/sql.rs',
  'rebuild plan must document the shared repository SQL helper module',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-backend-sql-helper-contract.mjs',
  'rebuild plan must document the backend SQL helper contract',
)

for (const required of requiredHelpers) {
  assertIncludes(helperSource, required, `repositories/sql.rs must contain ${required}`)
}

for (const [file, helpers] of requiredRepositoryHelpers) {
  const content = read(file)
  assertIncludes(content, 'super::sql', `${file} must import shared repository SQL helpers`)
  for (const helper of helpers) {
    assertIncludes(content, helper, `${file} must use shared helper ${helper}`)
  }
}

for (const file of repositoryFiles) {
  const content = read(file)
  for (const helper of helperNames) {
    const duplicateHelper = new RegExp(`(^|\\n)\\s*(async\\s+)?fn\\s+${helper}\\b`)
    assert(
      !duplicateHelper.test(content),
      `${file} must not contain duplicate helper definitions outside repositories/sql.rs`,
    )
  }

  assert(
    !content.includes('AppError::Database(error.to_string())'),
    `${file} must not duplicate database error mapping outside repositories/sql.rs`,
  )
  assert(
    !content.includes('try_get::<Option<String>'),
    `${file} must not duplicate nullable string row decoding outside repositories/sql.rs`,
  )
  assert(
    !content.includes('try_get::<Option<i64>'),
    `${file} must not duplicate nullable i64 row decoding outside repositories/sql.rs`,
  )
}

console.log('Backend SQL helper contract OK')
