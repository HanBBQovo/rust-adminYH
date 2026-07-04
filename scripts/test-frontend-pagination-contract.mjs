#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Frontend pagination contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const paginatedPages = [
  {
    file: 'apps/desktop/web/src/pages/CompaniesList.tsx',
    fetcher: 'listCompanies',
    requiresQueryDeps: false,
  },
  {
    file: 'apps/desktop/web/src/pages/OrdersList.tsx',
    fetcher: 'listOrders',
    requiresQueryDeps: true,
  },
  {
    file: 'apps/desktop/web/src/pages/ReceiptsList.tsx',
    fetcher: 'listReceipts',
    requiresQueryDeps: true,
  },
  {
    file: 'apps/desktop/web/src/pages/RolesList.tsx',
    fetcher: 'listRoles',
    requiresQueryDeps: true,
  },
  {
    file: 'apps/desktop/web/src/pages/UsersList.tsx',
    fetcher: 'listUsers',
    requiresQueryDeps: true,
  },
]

const pageFiles = [
  'apps/desktop/web/src/pages/CompaniesList.tsx',
  'apps/desktop/web/src/pages/Dashboard.tsx',
  'apps/desktop/web/src/pages/Login.tsx',
  'apps/desktop/web/src/pages/MenusList.tsx',
  'apps/desktop/web/src/pages/OrdersList.tsx',
  'apps/desktop/web/src/pages/ReceiptsList.tsx',
  'apps/desktop/web/src/pages/ResourceRegistry.tsx',
  'apps/desktop/web/src/pages/RolesList.tsx',
  'apps/desktop/web/src/pages/Settings.tsx',
  'apps/desktop/web/src/pages/SystemOverview.tsx',
  'apps/desktop/web/src/pages/UsersList.tsx',
  'apps/desktop/web/src/pages/Workspace.tsx',
]

const helper = read('apps/desktop/web/src/lib/use-paginated-resource.ts')

assertIncludes(helper, 'export function usePaginatedResource', 'shared pagination hook must exist')
assertIncludes(helper, 'const EMPTY_ROWS', 'shared pagination hook must keep a stable empty rows reference')
assertIncludes(helper, 'resource.data?.rows ?? EMPTY_ROWS', 'shared pagination hook must reuse the stable empty rows reference')
assertIncludes(helper, 'pagination: resource.data ? { page, pageSize, total, onPageChange: setPage } : undefined', 'shared pagination hook must centralize DataTable pagination props')

for (const page of paginatedPages) {
  const content = read(page.file)

  assertIncludes(content, "import { usePaginatedResource } from '@/lib/use-paginated-resource'", `${page.file} must import the shared pagination hook`)
  assertIncludes(content, 'usePaginatedResource({', `${page.file} must use the shared pagination hook`)
  assertIncludes(content, 'pageSize: PAGE_SIZE', `${page.file} must pass the page size into the shared hook`)
  assertIncludes(content, `fetcher: ${page.fetcher}`, `${page.file} must fetch the list through the shared hook`)
  assertIncludes(content, 'pagination={pagination}', `${page.file} must pass the hook pagination object into DataTableSurface`)
  assertIncludes(content, '<DataTableRowNumberCell value={(page - 1) * pageSize + index + 1}', `${page.file} row numbers must use the hook pageSize`)

  if (page.requiresQueryDeps) {
    assertIncludes(content, 'queryDeps:', `${page.file} must declare queryDeps for external filters or modes`)
  }

  assertNotMatches(content, /const\s+\[\s*page\s*,\s*setPage\s*\]\s*=\s*useState\s*\(/, `${page.file} must not hand-roll page state`)
  assertNotMatches(content, /useMemo\s*<[^>]*ListParams[^>]*>\s*\(/, `${page.file} must not hand-roll paginated query memo state`)
  assertNotMatches(content, new RegExp(`useResource\\s*\\(\\s*\\(\\)\\s*=>\\s*${page.fetcher}\\s*\\(`), `${page.file} must not call ${page.fetcher} through raw useResource`)
  assertNotMatches(content, /pagination=\{data\s*\?\s*\{/, `${page.file} must not hand-roll DataTable pagination props`)
  assertNotMatches(content, /onPageChange:\s*setPage/, `${page.file} must not hand-roll onPageChange pagination props`)
  assertNotMatches(content, /\(page\s*-\s*1\)\s*\*\s*PAGE_SIZE\s*\+\s*index\s*\+\s*1/, `${page.file} row numbers must not hard-code PAGE_SIZE`)
}

for (const file of pageFiles) {
  const content = read(file)

  assertNotMatches(content, /const\s+\[\s*page\s*,\s*setPage\s*\]\s*=\s*useState\s*\(/, `${file} must not introduce raw paginated page state`)
  assertNotMatches(content, /useResource\s*\(\s*\(\)\s*=>\s*list(?:Companies|Orders|Receipts|Roles|Users)\s*\(/, `${file} must not bypass usePaginatedResource for paginated list fetchers`)
}

console.log('Frontend pagination contract OK')
