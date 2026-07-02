#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node <<'NODE'
const fs = require('fs')

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

const desktopApiBaseUrl = 'http://127.0.0.1:16824/api'
const configTs = read('apps/desktop/web/src/config.ts')
assert(
  configTs.includes(`DEFAULT_DESKTOP_API_BASE_URL = '${desktopApiBaseUrl}'`),
  'frontend production default API base URL must target the local Rust API contract',
)
assert(
  /env\.PROD\s*\?\s*DEFAULT_DESKTOP_API_BASE_URL\s*:\s*'\/api'/.test(configTs),
  'frontend config must use /api only in development and an absolute local API in production',
)

const viteConfig = read('apps/desktop/web/vite.config.ts')
assert(
  viteConfig.includes("process.env.APP_API_PORT || '16824'"),
  'Vite dev proxy default port must match the Rust API default port',
)
assert(
  viteConfig.includes('http://127.0.0.1:${apiPort}'),
  'Vite dev proxy must target 127.0.0.1 instead of ambiguous localhost',
)

const apiConfig = read('crates/admin-api/src/config.rs')
assert(
  apiConfig.includes('pub const DEFAULT_HTTP_PORT: u16 = 16824'),
  'admin-api default port constant must match the desktop API base URL',
)
assert(
  apiConfig.includes('parse_env("APP_HTTP__PORT", "16824")'),
  'admin-api APP_HTTP__PORT default must be 16824',
)

const tauriConfig = JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json'))
assert(
  tauriConfig.build?.devUrl === 'http://127.0.0.1:5278',
  'Tauri devUrl must use the loopback Vite server',
)
assert(
  tauriConfig.build?.frontendDist === '../web/dist',
  'Tauri production build must load the web/dist frontend artifact',
)

const csp = tauriConfig.app?.security?.csp || ''
assert(csp.includes('connect-src'), 'Tauri CSP must define connect-src')
assert(csp.includes('http://127.0.0.1:*'), 'Tauri CSP must allow local Rust API HTTP connections')
assert(csp.includes('https:'), 'Tauri CSP must allow explicitly configured remote HTTPS API connections')

const capability = JSON.parse(read('apps/desktop/src-tauri/capabilities/default.json'))
const permissions = capability.permissions || []
assert(permissions.includes('core:default'), 'Tauri capability must include core:default')
assert(permissions.includes('opener:default'), 'Tauri capability must include opener:default')
assert(
  !permissions.some((permission) => /^(shell|fs|dialog|process):/.test(String(permission))),
  'Tauri capability must not grant shell/fs/dialog/process permissions until the feature needs them',
)

console.log('Tauri contract OK')
NODE
