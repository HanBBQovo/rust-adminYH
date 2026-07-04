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
    console.error(`Backend response contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const responseSource = read('crates/admin-api/src/response.rs')
const healthHandler = read('crates/admin-api/src/handlers/health.rs')
const memoryHandler = read('crates/admin-api/src/handlers/memory.rs')
const backendGate = read('scripts/test-backend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')
const handlerFiles = listFilesRecursive(
  'crates/admin-api/src/handlers',
  (file) => file.endsWith('.rs'),
)

assertIncludes(responseSource, 'pub struct JsonResponse<T>', 'response module must expose the default API envelope response')
assertIncludes(responseSource, 'pub struct StatusJsonResponse<T>', 'response module must expose status-aware API envelope responses')
assertIncludes(responseSource, 'pub struct LegacyDataResponse<T>', 'response module must expose data-only legacy responses')
assertIncludes(responseSource, 'Json(ApiResponse::ok(self.data))', 'status response must still use the canonical API envelope')
assertIncludes(responseSource, 'Json(LegacyDataBody { data: self.0 })', 'legacy data response must preserve old data-only memory shape')
assertIncludes(responseSource, 'Json(ApiResponse::with_message(EmptyResponse {}, self.0))', 'message response must keep the canonical success envelope')

assertIncludes(healthHandler, 'StatusJsonResponse::new(status, HealthResponse::from(report))', 'health handler must use the status-aware response wrapper')
assertIncludes(memoryHandler, 'LegacyDataResponse<Vec<MemoryRecord>>', 'memory handler must use the shared legacy data-only response wrapper')
assertIncludes(memoryHandler, '.map(LegacyDataResponse)', 'memory handler must construct the legacy response through the wrapper')

assertIncludes(
  backendGate,
  'scripts/test-backend-response-contract.mjs',
  'backend gate must run the response contract',
)
assertIncludes(
  releaseContract,
  'scripts/test-backend-response-contract.mjs',
  'release contract must lock the backend response contract into default gates',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-backend-response-contract.mjs',
  'rebuild plan must document the backend response contract',
)
assertIncludes(
  rebuildPlan,
  'StatusJsonResponse',
  'rebuild plan must document the status-aware response wrapper',
)
assertIncludes(
  rebuildPlan,
  'LegacyDataResponse',
  'rebuild plan must document the data-only legacy response wrapper',
)

for (const file of handlerFiles) {
  const content = read(file)
  assertNotMatches(
    content,
    /Json\s*\(\s*ApiResponse::/,
    `${file} must not build ApiResponse JSON directly outside response.rs`,
  )
  assertNotMatches(
    content,
    /\(\s*StatusCode::OK\s*,\s*Json\s*\(/,
    `${file} must not hand-roll OK JSON responses outside response.rs`,
  )
  assertNotMatches(
    content,
    /impl\s+IntoResponse\s+for\s+\w+/,
    `${file} must not define handler-local response wrappers outside response.rs`,
  )
}

console.log('Backend response contract OK')
