#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

function assert(condition, message) {
  if (!condition) {
    console.error(`Release preflight regression failed: ${message}`)
    process.exit(1)
  }
}

const baseEnv = {
  ...process.env,
  DATABASE_URL: '',
  RELEASE_GATE: 'true',
  SKIP_RELEASE_PREFLIGHT_SELFTEST: 'true',
}

const passingToggles = {
  RUN_DB_TESTS: 'true',
  ADMIN_DB_TEST_DATABASE_URL: 'mysql://release:test@127.0.0.1/admin_yh_release_test',
  OLD_DATABASE_URL: 'mysql://release:test@127.0.0.1/admin_yh_old_shadow',
  NEW_DATABASE_URL: 'mysql://release:test@127.0.0.1/admin_yh_new_shadow',
  MIGRATION_APPLY: 'true',
  NEW_AVATAR_DIR: '/tmp/admin-yh-release-avatar',
  RUN_E2E: 'true',
  RUN_COVERAGE: 'true',
  RUN_DOCKER: 'true',
  RUN_DOCKER_E2E: 'true',
  RUN_TAURI: 'true',
  RUN_TAURI_DMG: 'true',
  RUN_TAURI_SIDECAR_SMOKE: 'true',
  TAURI_SIDECAR_DATABASE_URL: 'mysql://release:test@127.0.0.1/admin_yh_tauri_shadow',
}

function runPreflight(envPatch) {
  return spawnSync('bash', ['scripts/check-all.sh'], {
    cwd: process.cwd(),
    env: {
      ...baseEnv,
      ...envPatch,
    },
    encoding: 'utf8',
    timeout: 30_000,
  })
}

function expectPreflightFailure(name, envPatch, expectedTokens) {
  const result = runPreflight(envPatch)
  const output = `${result.stdout || ''}\n${result.stderr || ''}`

  assert(result.error === undefined, `${name} must execute check-all without spawn errors: ${result.error?.message || ''}`)
  assert(result.status !== 0, `${name} must fail before ordinary gates`)
  assert(!output.includes('========== Backend =========='), `${name} must stop before backend gate`)
  assert(output.includes('========== Release gate preflight =========='), `${name} must enter release preflight`)

  for (const token of expectedTokens) {
    assert(output.includes(token), `${name} must mention ${token}`)
  }
}

const cases = [
  {
    name: 'missing RUN_DB_TESTS',
    env: {},
    tokens: ['FAIL: RELEASE_GATE=true', 'RUN_DB_TESTS=true'],
  },
  {
    name: 'missing ADMIN_DB_TEST_DATABASE_URL',
    env: { RUN_DB_TESTS: 'true' },
    tokens: ['FAIL: RELEASE_GATE=true', 'ADMIN_DB_TEST_DATABASE_URL'],
  },
  {
    name: 'missing migration URLs',
    env: {
      RUN_DB_TESTS: 'true',
      ADMIN_DB_TEST_DATABASE_URL: passingToggles.ADMIN_DB_TEST_DATABASE_URL,
    },
    tokens: ['FAIL: RELEASE_GATE=true', 'OLD_DATABASE_URL', 'NEW_DATABASE_URL'],
  },
  {
    name: 'missing MIGRATION_APPLY',
    env: {
      RUN_DB_TESTS: 'true',
      ADMIN_DB_TEST_DATABASE_URL: passingToggles.ADMIN_DB_TEST_DATABASE_URL,
      OLD_DATABASE_URL: passingToggles.OLD_DATABASE_URL,
      NEW_DATABASE_URL: passingToggles.NEW_DATABASE_URL,
    },
    tokens: ['FAIL: RELEASE_GATE=true', 'MIGRATION_APPLY=true'],
  },
  {
    name: 'missing NEW_AVATAR_DIR',
    env: {
      RUN_DB_TESTS: 'true',
      ADMIN_DB_TEST_DATABASE_URL: passingToggles.ADMIN_DB_TEST_DATABASE_URL,
      OLD_DATABASE_URL: passingToggles.OLD_DATABASE_URL,
      NEW_DATABASE_URL: passingToggles.NEW_DATABASE_URL,
      MIGRATION_APPLY: passingToggles.MIGRATION_APPLY,
    },
    tokens: ['FAIL: RELEASE_GATE=true', 'NEW_AVATAR_DIR'],
  },
  {
    name: 'missing RUN_COVERAGE',
    env: Object.fromEntries(Object.entries(passingToggles).filter(([key]) => key !== 'RUN_COVERAGE')),
    tokens: ['FAIL: RELEASE_GATE=true', 'RUN_COVERAGE=true'],
  },
  {
    name: 'missing RUN_DOCKER_E2E',
    env: Object.fromEntries(Object.entries(passingToggles).filter(([key]) => key !== 'RUN_DOCKER_E2E')),
    tokens: ['FAIL: RELEASE_GATE=true', 'RUN_DOCKER_E2E=true'],
  },
  {
    name: 'missing RUN_TAURI_DMG',
    env: Object.fromEntries(Object.entries(passingToggles).filter(([key]) => key !== 'RUN_TAURI_DMG')),
    tokens: ['FAIL: RELEASE_GATE=true', 'RUN_TAURI_DMG=true'],
  },
  {
    name: 'missing RUN_TAURI_SIDECAR_SMOKE',
    env: Object.fromEntries(
      Object.entries(passingToggles).filter(([key]) => key !== 'RUN_TAURI_SIDECAR_SMOKE'),
    ),
    tokens: ['FAIL: RELEASE_GATE=true', 'RUN_TAURI_SIDECAR_SMOKE=true'],
  },
  {
    name: 'missing TAURI sidecar database URL',
    env: Object.fromEntries(
      Object.entries(passingToggles).filter(([key]) => key !== 'TAURI_SIDECAR_DATABASE_URL'),
    ),
    tokens: ['FAIL: RELEASE_GATE=true', 'TAURI_SIDECAR_DATABASE_URL', 'DATABASE_URL'],
  },
]

for (const testCase of cases) {
  expectPreflightFailure(testCase.name, testCase.env, testCase.tokens)
}

console.log('Release preflight regression OK')
