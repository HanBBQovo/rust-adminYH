#!/usr/bin/env node
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(path, 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Backend route contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

function countOccurrences(content, needle) {
  return content.split(needle).length - 1
}

const routesSource = read('crates/admin-api/src/routes/mod.rs')
const routeCompatibilityTest = read('crates/admin-api/tests/route_compatibility.rs')
const backendGate = read('scripts/test-backend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')

assertIncludes(routesSource, 'fn compat_route(', 'router must expose one shared compat_route helper')
assertIncludes(routesSource, 'legacy_path: &\'static str', 'compat_route must receive the legacy route path only once')
assertIncludes(routesSource, 'format!("/api{legacy_path}")', 'compat_route must derive /api routes from legacy paths')
assertIncludes(routesSource, '.route(legacy_path, method_router.clone())', 'compat_route must register the legacy route')
assertIncludes(routesSource, '.route(&api_path, method_router)', 'compat_route must register the derived /api route')
assert(
  countOccurrences(routesSource, 'fn compat_route(') === 1,
  'router must keep exactly one compat_route helper',
)
assertNotMatches(
  routesSource,
  /\.route\(\s*"\/api\//,
  'router must not hand-register /api routes outside compat_route',
)
assertNotMatches(
  routesSource,
  /compat_route\([^,\n]+,\s*"\/api\//,
  'compat_route callers must pass legacy paths, not already-prefixed /api paths',
)

assertIncludes(
  routeCompatibilityTest,
  'documented_routes_are_live_on_legacy_and_api_paths',
  'route compatibility tests must prove legacy and /api paths are live',
)
assertIncludes(
  routeCompatibilityTest,
  'spec.api_route_path == format!("/api{}", spec.legacy_route_path)',
  'route compatibility tests must lock api paths as derived from legacy paths',
)
assertIncludes(
  routeCompatibilityTest,
  'StatusCode::NOT_FOUND',
  'route compatibility tests must reject unregistered route regressions',
)

assertIncludes(
  backendGate,
  'scripts/test-backend-route-contract.mjs',
  'backend gate must run the route contract',
)
assertIncludes(
  releaseContract,
  'scripts/test-backend-route-contract.mjs',
  'release contract must lock the backend route contract into default gates',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-backend-route-contract.mjs',
  'rebuild plan must document the backend route contract',
)
assertIncludes(
  rebuildPlan,
  'compat_route',
  'rebuild plan must document the shared compat_route helper',
)

console.log('Backend route contract OK')
