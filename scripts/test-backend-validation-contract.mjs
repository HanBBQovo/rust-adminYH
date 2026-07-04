#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function read(path) {
  return readFileSync(path, 'utf8')
}

function listFilesRecursive(dir, predicate) {
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
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Backend validation contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const validationSource = read('crates/admin-core/src/validation.rs')
const coreLib = read('crates/admin-core/src/lib.rs')
const orderService = read('crates/admin-core/src/services/order.rs')
const userService = read('crates/admin-core/src/services/user.rs')
const roleService = read('crates/admin-core/src/services/role.rs')
const backendGate = read('scripts/test-backend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const apiHandlers = listFilesRecursive('crates/admin-api/src/handlers', (file) => file.endsWith('.rs'))

const requiredValidationFunctions = [
  'pub fn normalize_order_mutation',
  'pub fn normalize_receipt_status',
  'pub fn normalize_receipt_batch_status',
  'pub fn normalize_user_create',
  'pub fn normalize_user_update',
  'pub fn normalize_user_password',
  'pub fn normalize_role_mutation',
  'pub fn normalize_role_assignment',
]

assertIncludes(coreLib, 'pub mod validation;', 'admin-core must expose a dedicated validation module')
for (const fnName of requiredValidationFunctions) {
  assertIncludes(validationSource, fnName, `validation module must expose ${fnName}`)
}

assertIncludes(orderService, 'normalize_order_mutation(input)?', 'order create/update must normalize through admin-core validation')
assertIncludes(orderService, 'normalize_receipt_status(input)?', 'single receipt status updates must normalize through admin-core validation')
assertIncludes(orderService, 'normalize_receipt_batch_status(input)?', 'batch receipt status updates must normalize through admin-core validation')
assertIncludes(userService, 'normalize_user_create(input)?', 'user create must normalize through admin-core validation')
assertIncludes(userService, 'normalize_user_update(input)?', 'user update must normalize through admin-core validation')
assertIncludes(userService, 'normalize_user_password(&input)?', 'user password updates must normalize through admin-core validation')
assertIncludes(roleService, 'normalize_role_mutation(input)?', 'role create/update must normalize through admin-core validation')
assertIncludes(roleService, 'normalize_role_assignment(input)?', 'role assignment must normalize through admin-core validation')

assertNotMatches(orderService, /fn\s+normalize_order\b/, 'order service must not define local order validation helpers')
assertNotMatches(orderService, /fn\s+normalize_receipt_status_strict\b/, 'order service must not define local receipt strict validation helpers')
assertNotMatches(userService, /fn\s+normalize_new_user\b/, 'user service must not define local user validation helpers')
assertNotMatches(roleService, /fn\s+normalize_role\b/, 'role service must not define local role validation helpers')
assertNotMatches(roleService, /fn\s+normalize_menu_ids\b/, 'role service must not define local menu id validation helpers')

for (const file of apiHandlers) {
  const content = read(file)
  if (file.endsWith('user.rs')) {
    const uploadHelperStart = content.indexOf('async fn read_avatar_upload')
    const beforeUploadHelper = uploadHelperStart >= 0 ? content.slice(0, uploadHelperStart) : content
    assertNotMatches(
      beforeUploadHelper,
      /AppError::Validation|\.trim\(\)\.is_empty\(\)|role_id\s*<=\s*0/,
      `${file} JSON handlers must not own business validation outside multipart upload transport checks`,
    )
    continue
  }
  assertNotMatches(
    content,
    /AppError::Validation|\.trim\(\)\.is_empty\(\)|role_id\s*<=\s*0/,
    `${file} handlers must not own business validation`,
  )
}

assertIncludes(
  backendGate,
  'scripts/test-backend-validation-contract.mjs',
  'backend gate must run the validation contract',
)
assertIncludes(
  releaseContract,
  'scripts/test-backend-validation-contract.mjs',
  'release contract must lock the backend validation contract into default gates',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-backend-validation-contract.mjs',
  'rebuild plan must document the backend validation contract',
)
assertIncludes(
  rebuildPlan,
  'crates/admin-core/src/validation.rs',
  'rebuild plan must document the centralized validation module',
)

console.log('Backend validation contract OK')
