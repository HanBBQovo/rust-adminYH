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
    console.error(`Backend pagination contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

const paginationSource = read('crates/admin-db/src/pagination.rs')
const backendGate = read('scripts/test-backend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const repositoryFiles = listFilesRecursive('crates/admin-db/src/repositories', (file) => file.endsWith('.rs'))
const paginatedRepositories = [
  'crates/admin-db/src/repositories/company.rs',
  'crates/admin-db/src/repositories/order.rs',
  'crates/admin-db/src/repositories/role.rs',
  'crates/admin-db/src/repositories/user.rs',
]

assert(repositoryFiles.length > 0, 'admin-db repository files must exist')
assertIncludes(
  paginationSource,
  'pub fn push_limit_offset',
  'admin-db pagination module must expose a shared LIMIT/OFFSET binding helper',
)
assertIncludes(
  paginationSource,
  'Page::from_offset_size',
  'admin-db pagination module must support legacy offset/size list requests',
)
assertIncludes(
  backendGate,
  'scripts/test-backend-pagination-contract.mjs',
  'backend gate must run the pagination contract',
)
assertIncludes(
  releaseContract,
  'scripts/test-backend-pagination-contract.mjs',
  'release contract must lock the backend pagination contract into default gates',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-backend-pagination-contract.mjs',
  'rebuild plan must document the backend pagination contract',
)
assertIncludes(
  rebuildPlan,
  'push_limit_offset',
  'rebuild plan must document the shared pagination binding helper',
)

for (const file of paginatedRepositories) {
  const content = read(file)
  assertIncludes(content, 'push_limit_offset', `${file} must use the shared pagination binding helper`)
  assertIncludes(content, 'Page::from_offset_size', `${file} must convert legacy offset/size through Page`)
}

for (const file of repositoryFiles) {
  const content = read(file)
  assert(
    !/LIMIT\s+\?\s+OFFSET\s+\?/i.test(content),
    `${file} must not embed raw LIMIT ? OFFSET ? pagination SQL`,
  )

  content.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1
    assert(
      !/\.push\(\s*(?:r#*)?["'].*\bLIMIT\b/i.test(line),
      `${file}:${lineNumber} must not push raw LIMIT pagination SQL; use push_limit_offset`,
    )
    assert(
      !/\.push\(\s*(?:r#*)?["'].*\bOFFSET\b/i.test(line),
      `${file}:${lineNumber} must not push raw OFFSET pagination SQL; use push_limit_offset`,
    )
  })
}

console.log('Backend pagination contract OK')
