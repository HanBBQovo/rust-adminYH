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
    console.error(`Backend auth contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertMatches(content, pattern, message) {
  assert(pattern.test(content), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const authMiddleware = read('crates/admin-api/src/middleware/auth.rs')
const permissions = read('crates/admin-core/src/auth/permissions.rs')
const authMatrix = read('crates/admin-api/tests/authorization_matrix.rs')
const backendGate = read('scripts/test-backend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const handlerFiles = listFilesRecursive(
  'crates/admin-api/src/handlers',
  (file) => file.endsWith('.rs'),
)

const adminWriteHandlers = [
  ['crates/admin-api/src/handlers/company.rs', ['create(', 'update(', 'remove(']],
  ['crates/admin-api/src/handlers/menu.rs', ['create(', 'update(', 'remove(']],
  ['crates/admin-api/src/handlers/order.rs', ['create(', 'update(', 'remove(']],
  ['crates/admin-api/src/handlers/receipt.rs', ['update_status(', 'update_statuses(']],
  ['crates/admin-api/src/handlers/role.rs', ['create(', 'update(', 'remove(', 'assign(']],
  ['crates/admin-api/src/handlers/user.rs', ['create(', 'update(', 'remove(']],
]

assertIncludes(authMiddleware, 'pub enum AuthPolicy', 'auth middleware must define AuthPolicy')
assertIncludes(authMiddleware, 'Authenticated', 'AuthPolicy must include authenticated reads')
assertIncludes(authMiddleware, 'Admin', 'AuthPolicy must include admin writes')
assertIncludes(authMiddleware, 'SelfOrAdmin { user_id: i64 }', 'AuthPolicy must include self-or-admin updates')
assertIncludes(authMiddleware, 'fn permits(self, user: &CurrentUserResponse) -> bool', 'AuthPolicy must centralize permission checks')
assertIncludes(authMiddleware, 'pub async fn require_policy', 'auth middleware must expose require_policy')
assertIncludes(authMiddleware, 'pub async fn require_admin', 'auth middleware must expose require_admin as a thin wrapper')
assertIncludes(authMiddleware, 'pub async fn require_self_or_admin', 'auth middleware must expose require_self_or_admin as a thin wrapper')
assertIncludes(authMiddleware, 'require_policy(state, headers, AuthPolicy::Admin)', 'require_admin must delegate to require_policy')
assertIncludes(authMiddleware, 'require_policy(state, headers, AuthPolicy::SelfOrAdmin { user_id })', 'require_self_or_admin must delegate to require_policy')
assertIncludes(authMiddleware, 'is_super_admin(&user.role_ids)', 'super-admin role checks must stay inside AuthPolicy')

assertIncludes(permissions, 'pub const SUPER_ADMIN_ROLE_ID: i64 = 1', 'super-admin role id must be centralized in admin-core')
assertIncludes(permissions, 'pub fn is_super_admin(role_ids: &[i64]) -> bool', 'admin-core must expose one super-admin predicate')
assertIncludes(permissions, 'role_ids.contains(&SUPER_ADMIN_ROLE_ID)', 'super-admin predicate must use the centralized constant')

assertIncludes(authMatrix, 'read_routes_require_login_but_allow_operator_sessions', 'authorization matrix must cover read route policy')
assertIncludes(authMatrix, 'admin_write_routes_reject_operator_with_legacy_forbidden_shape', 'authorization matrix must cover admin write policy')
assertIncludes(authMatrix, 'self_or_admin_password_policy_is_centralized', 'authorization matrix must cover self-or-admin policy')
assertIncludes(authMatrix, 'public_avatar_route_stays_unauthenticated', 'authorization matrix must document unauthenticated avatar access')

assertIncludes(backendGate, 'scripts/test-backend-auth-contract.mjs', 'backend gate must run the auth contract')
assertIncludes(releaseContract, 'scripts/test-backend-auth-contract.mjs', 'release contract must lock the backend auth contract into default gates')
assertIncludes(rebuildPlan, 'scripts/test-backend-auth-contract.mjs', 'rebuild plan must document the backend auth contract')

for (const file of handlerFiles) {
  const content = read(file)
  assertNotMatches(content, /\bis_super_admin\b/, `${file} must not call super-admin checks directly`)
  assertNotMatches(content, /\bSUPER_ADMIN_ROLE_ID\b/, `${file} must not import or compare the super-admin role constant directly`)
  assertNotMatches(content, /\brole_id\s*==\s*1\b/, `${file} must not hard-code role_id == 1`)
  assertNotMatches(content, /\brole_ids\s*\.\s*contains\s*\(\s*&\s*1\s*\)/, `${file} must not hard-code role_ids.contains(&1)`)
}

for (const [file, functions] of adminWriteHandlers) {
  const content = read(file)
  assertIncludes(content, 'require_admin', `${file} must import/use require_admin for admin write policy`)
  for (const functionName of functions) {
    const functionPattern = new RegExp(`pub\\s+async\\s+fn\\s+${functionName.replace('(', '\\(')}[\\s\\S]*?\\{[\\s\\S]{0,500}?require_admin\\(&state,\\s*&headers\\)\\.await\\?`)
    assertMatches(content, functionPattern, `${file} ${functionName} must guard writes through require_admin`)
  }
}

const userHandler = read('crates/admin-api/src/handlers/user.rs')
assertIncludes(userHandler, 'require_self_or_admin(&state, &headers, user_id).await?', 'password changes must go through require_self_or_admin')

console.log('Backend auth contract OK')
