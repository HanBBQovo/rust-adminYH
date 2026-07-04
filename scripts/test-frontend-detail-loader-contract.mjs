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

for (const [pageName, pageContent, getterName, fallbackMessage] of detailPages) {
  assertIncludes(pageContent, "import { useDetailLoader } from '@/lib/use-detail-loader'", `${pageName} must import the shared detail loader hook`)
  assertIncludes(pageContent, 'loadDetail', `${pageName} must load row details through the shared detail loader`)
  assertIncludes(pageContent, 'resetDetail', `${pageName} must reset stale detail requests on create/close flows`)
  assertIncludes(pageContent, `fallbackMessage: '${fallbackMessage}'`, `${pageName} must keep its legacy detail fallback message`)
  assertNotMatches(pageContent, new RegExp(`try\\s*\\{[\\s\\S]{0,240}await\\s+${getterName}\\(`), `${pageName} must not hand-roll detail try/catch around ${getterName}`)
  assertNotMatches(pageContent, new RegExp(`showToast\\('error',[\\s\\S]{0,120}${fallbackMessage}`), `${pageName} must not hand-roll detail failure toast`)
}

assertIncludes(rebuildPlan, 'src/lib/use-detail-loader.ts', 'rebuild plan must document the shared detail loader hook')

console.log('Frontend detail loader contract OK')
