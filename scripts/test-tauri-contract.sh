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
assert(
  csp.includes('http://127.0.0.1:16824'),
  'Tauri CSP must allow the fixed local Rust API sidecar port',
)
assert(!csp.includes('http://127.0.0.1:*'), 'Tauri CSP must not allow wildcard local HTTP ports')
assert(!csp.includes('http://localhost:*'), 'Tauri CSP must not depend on ambiguous localhost ports')
assert(!csp.includes('ws://127.0.0.1:*'), 'Tauri CSP must not allow unused wildcard local websocket ports')
assert(csp.includes('https:'), 'Tauri CSP must allow explicitly configured remote HTTPS API connections')

assert(
  !('resources' in (tauriConfig.bundle || {})),
  'Tauri bundle resources must be injected only for release builds after admin-api exists',
)

const capability = JSON.parse(read('apps/desktop/src-tauri/capabilities/default.json'))
const permissions = capability.permissions || []
assert(permissions.includes('core:default'), 'Tauri capability must include core:default')
assert(permissions.includes('opener:default'), 'Tauri capability must include opener:default')
assert(
  !permissions.some((permission) => /^(shell|fs|dialog|process):/.test(String(permission))),
  'Tauri capability must not grant renderer-side shell/fs/dialog/process permissions',
)

const tauriCargo = read('apps/desktop/src-tauri/Cargo.toml')
assert(
  !tauriCargo.includes('tauri-plugin-shell'),
  'admin-api sidecar must be launched by the Rust main process, not exposed through shell plugin permissions',
)
assert(
  tauriCargo.includes('tauri-plugin-dialog = "2"') && tauriCargo.includes('tauri-plugin-opener = "2"'),
  'desktop export must use first-party Tauri dialog/opener plugins through Rust commands',
)

const tauriLib = read('apps/desktop/src-tauri/src/lib.rs')
assert(
  tauriLib.includes('Command::new(&binary_path)'),
  'Tauri main process must spawn the managed admin-api sidecar explicitly',
)
assert(
  tauriLib.includes('APP_HTTP__HOST", "127.0.0.1"') &&
    tauriLib.includes('APP_HTTP__PORT", ADMIN_API_PORT'),
  'admin-api sidecar must be pinned to the loopback host and fixed desktop port',
)
assert(
  tauriLib.includes('ADMIN_YH_DESKTOP_ADMIN_API_BIN') &&
    tauriLib.includes('ADMIN_YH_DESKTOP_DISABLE_SIDECAR'),
  'sidecar must expose documented operator diagnostics/override environment switches',
)
assert(
  tauriLib.includes('stdout') &&
    tauriLib.includes('stderr') &&
    tauriLib.includes('child.kill()'),
  'sidecar supervisor must drain output streams and stop the child process on app exit',
)
assert(
  tauriLib.includes('wait_for_admin_api_health()') &&
    tauriLib.includes('probe_admin_api_health') &&
    tauriLib.includes('admin-api sidecar health check passed') &&
    tauriLib.includes('health check timed out'),
  'sidecar supervisor must wait for the managed admin-api /api/health endpoint and emit diagnostics',
)
assert(
  tauriLib.includes('sidecar_preflight_skips_spawn_when_disable_env_is_true') &&
    tauriLib.includes('sidecar_preflight_skips_spawn_when_health_is_available') &&
    tauriLib.includes('missing_sidecar_binary_returns_diagnostic_error') &&
    tauriLib.includes('wait_for_admin_api_health_succeeds_when_endpoint_returns_200'),
  'Tauri sidecar runtime smoke tests must cover disable, already-running, missing binary, and health success paths',
)
assert(
  tauriLib.includes('export_orders_csv') &&
    tauriLib.includes('blocking_save_file()') &&
    tauriLib.includes('normalize_export_filename') &&
    tauriLib.includes('ensure_csv_extension') &&
    tauriLib.includes('open_path(parent'),
  'Tauri desktop export command must choose a save path, sanitize the CSV file name, write the file, and open the export directory',
)
assert(
  tauriLib.includes('export_filename_is_sanitized_and_forced_to_csv') &&
    tauriLib.includes('export_filename_rejects_non_regular_names') &&
    tauriLib.includes('csv_extension_is_added_only_when_missing'),
  'Tauri desktop export filename hardening must be covered by unit tests',
)
const desktopExport = read('apps/desktop/web/src/desktop/export.ts')
assert(
  desktopExport.includes("core.invoke<boolean>('export_orders_csv'") &&
    desktopExport.includes('getTauriCore()'),
  'frontend desktop export bridge must call the Tauri export_orders_csv command through a dedicated wrapper',
)
const orderExport = read('apps/desktop/web/src/pages/orders/order-export.ts')
assert(
  orderExport.includes('saveOrdersCsvWithDesktopDialog') &&
    orderExport.includes('downloadOrdersCsv(rows, options)') &&
    orderExport.includes("Promise<'desktop' | 'browser'>"),
  'order CSV export must try the desktop save dialog first and fall back to browser download',
)
assert(
  read('scripts/test-tauri-build.sh').includes('Tauri sidecar runtime smoke') &&
    read('scripts/test-tauri-build.sh').includes('cargo test --lib'),
  'RUN_TAURI build gate must run Tauri sidecar runtime smoke tests before packaging',
)
assert(
  read('scripts/test-tauri-build.sh').includes('Bundled sidecar runtime smoke') &&
    read('scripts/test-tauri-build.sh').includes('RUN_TAURI_SIDECAR_SMOKE') &&
    read('scripts/test-tauri-build.sh').includes('TAURI_SIDECAR_DATABASE_URL') &&
    read('scripts/test-tauri-build.sh').includes('SIDECAR_SMOKE_PORT="${SIDECAR_SMOKE_PORT:-16824}"') &&
    read('scripts/test-tauri-build.sh').includes('APP_HTTP__PORT="$SIDECAR_SMOKE_PORT"') &&
    read('scripts/test-tauri-build.sh').includes('sidecar_smoke_url=') &&
    read('scripts/test-tauri-build.sh').includes('sidecar_smoke_port=') &&
    read('scripts/test-tauri-build.sh').includes('sidecar_database_url=') &&
    read('scripts/test-tauri-build.sh').includes('curl --fail --silent --show-error "$SIDECAR_SMOKE_URL"'),
  'RUN_TAURI build gate must optionally launch the bundled admin-api sidecar on a configurable smoke port and verify /api/health with diagnostics',
)
const checkAll = read('scripts/check-all.sh')
assert(
  checkAll.includes('RUN_TAURI_SIDECAR_SMOKE') && checkAll.includes('TAURI_SIDECAR_DATABASE_URL'),
  'release gate must require bundled Tauri sidecar smoke configuration',
)

console.log('Tauri contract OK')
NODE
