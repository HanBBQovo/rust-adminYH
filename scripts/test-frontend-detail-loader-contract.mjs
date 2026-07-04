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
    console.error(`Frontend detail loader contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const detailLoader = read('apps/desktop/web/src/lib/use-detail-loader.ts')
const detailLoaderTest = read('apps/desktop/web/src/lib/use-detail-loader.test.tsx')
const detailDialog = read('apps/desktop/web/src/lib/use-detail-dialog.ts')
const detailDialogTest = read('apps/desktop/web/src/lib/use-detail-dialog.test.tsx')
const rebuildPlan = read('docs/rebuild-plan.md')

const detailPages = [
  ['CompaniesList', read('apps/desktop/web/src/pages/CompaniesList.tsx'), 'getCompany', '发货公司详情加载失败'],
  ['OrdersList', read('apps/desktop/web/src/pages/OrdersList.tsx'), 'getOrder', '订单详情加载失败'],
  ['RolesList', read('apps/desktop/web/src/pages/RolesList.tsx'), 'getRole', '角色详情加载失败'],
  ['MenusList', read('apps/desktop/web/src/pages/MenusList.tsx'), 'getMenu', '菜单详情加载失败'],
  ['UsersList', read('apps/desktop/web/src/pages/UsersList.tsx'), 'getUser', '用户详情加载失败'],
]

assertIncludes(detailLoader, 'export function useDetailLoader', 'shared detail loader hook must be exported')
assertIncludes(detailLoader, 'const requestIdRef = useRef(0)', 'detail loader must guard stale detail responses')
assertIncludes(detailLoader, 'const mountedRef = useRef(true)', 'detail loader must guard unmounted updates')
assertIncludes(detailLoader, 'resetDetail', 'detail loader must expose resetDetail for close/create flows')
assertIncludes(detailLoader, "{ translate: false }", 'detail loader must preserve untranslated legacy Chinese messages')
assertIncludes(detailLoaderTest, 'keeps only the latest detail response when requests resolve out of order', 'detail loader tests must cover stale response ordering')
assertIncludes(detailLoaderTest, 'ignores stale responses after resetDetail is called', 'detail loader tests must cover reset invalidation')
assertIncludes(detailLoaderTest, 'ignores empty detail responses without replacing the optimistic row', 'detail loader tests must cover empty detail fallback')
assertIncludes(detailLoaderTest, 'uses the fallback message for non-error rejections', 'detail loader tests must cover non-Error fallback messages')

assertIncludes(detailDialog, 'export function useDetailDialog', 'shared detail dialog hook must be exported')
assertIncludes(detailDialog, 'useDetailLoader()', 'detail dialog hook must reuse the shared detail loader')
assertIncludes(detailDialog, 'openCreate', 'detail dialog hook must centralize create dialog lifecycle')
assertIncludes(detailDialog, 'openDetail', 'detail dialog hook must centralize detail dialog lifecycle')
assertIncludes(detailDialog, 'seedDetail', 'detail dialog hook must support optimistic row seeding')
assertIncludes(detailDialog, 'mapLoaded', 'detail dialog hook must support transformed detail API shapes')
assertIncludes(detailDialog, 'onOpenChange', 'detail dialog hook must centralize close reset behavior')
assertIncludes(detailDialogTest, 'seeds the selected row before replacing it with loaded detail', 'detail dialog tests must cover optimistic seed replacement')
assertIncludes(detailDialogTest, 'keeps the seeded row open and shows the legacy fallback toast when loading fails', 'detail dialog tests must cover failed load behavior')
assertIncludes(detailDialogTest, 'clears detail on close and ignores stale detail responses', 'detail dialog tests must cover close invalidation behavior')
assertIncludes(detailDialogTest, 'maps loaded detail before storing it for pages with transformed API shapes', 'detail dialog tests must cover transformed detail payloads')

for (const [pageName, pageContent, getterName, fallbackMessage] of detailPages) {
  assertIncludes(pageContent, "import { useDetailDialog } from '@/lib/use-detail-dialog'", `${pageName} must import the shared detail dialog hook`)
  assertIncludes(pageContent, 'useDetailDialog', `${pageName} must centralize detail dialog lifecycle through the shared hook`)
  assertIncludes(pageContent, 'openCreate: openCreateDialog', `${pageName} must derive create dialog opener from the shared hook`)
  assertIncludes(pageContent, 'onOpenChange: handleDialogOpenChange', `${pageName} must derive close reset handler from the shared hook`)
  assertIncludes(pageContent, 'open: dialogOpen', `${pageName} must derive dialog open state from the shared hook`)
  assertNotMatches(pageContent, /useDetailLoader/, `${pageName} must not wire detail loader directly after migrating dialog lifecycle`)
  assertNotMatches(pageContent, /setDialogOpen\s*\(/, `${pageName} must not manually toggle detail dialog open state`)
  assertNotMatches(pageContent, /setDialogMode\s*\(/, `${pageName} must not manually toggle detail dialog mode`)
  assertIncludes(pageContent, `fallbackMessage: '${fallbackMessage}'`, `${pageName} must keep its legacy detail fallback message`)
  assertNotMatches(pageContent, new RegExp(`try\\s*\\{[\\s\\S]{0,240}await\\s+${getterName}\\(`), `${pageName} must not hand-roll detail try/catch around ${getterName}`)
  assertNotMatches(pageContent, new RegExp(`showToast\\('error',[\\s\\S]{0,120}${fallbackMessage}`), `${pageName} must not hand-roll detail failure toast`)
}

assertIncludes(rebuildPlan, 'src/lib/use-detail-loader.ts', 'rebuild plan must document the shared detail loader hook')
assertIncludes(rebuildPlan, 'src/lib/use-detail-dialog.ts', 'rebuild plan must document the shared detail dialog hook')

console.log('Frontend detail loader contract OK')
