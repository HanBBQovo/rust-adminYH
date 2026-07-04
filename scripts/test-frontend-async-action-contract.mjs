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
    console.error(`Frontend async action contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const asyncAction = read('apps/desktop/web/src/lib/use-async-action.ts')
const asyncActionTest = read('apps/desktop/web/src/lib/use-async-action.test.tsx')
const loginPage = read('apps/desktop/web/src/pages/Login.tsx')
const loginTest = read('apps/desktop/web/src/pages/Login.test.tsx')
const rebuildPlan = read('docs/rebuild-plan.md')

assertIncludes(asyncAction, 'export function useAsyncAction', 'shared local async action hook must be exported')
assertIncludes(asyncAction, 'const pendingRef = useRef(false)', 'async action hook must prevent duplicate pending submissions')
assertIncludes(asyncAction, 'const [pending, setPending] = useState(false)', 'async action hook must centralize local pending state')
assertIncludes(asyncAction, "const [error, setError] = useState('')", 'async action hook must centralize local error state')
assertIncludes(asyncAction, 'runAction', 'async action hook must expose runAction')
assertIncludes(asyncAction, 'clearError', 'async action hook must expose clearError')
assertNotMatches(asyncAction, /useGlobalToast|useConfirm/, 'async action hook must remain form-local and not depend on toast or confirm providers')

assertIncludes(asyncActionTest, 'runs an async action with local pending state and success callback', 'async action tests must cover pending and success callback')
assertIncludes(asyncActionTest, 'stores action errors locally without calling the success callback', 'async action tests must cover local error behavior')
assertIncludes(asyncActionTest, 'does not start another action while one is already pending', 'async action tests must cover duplicate pending submissions')
assertIncludes(asyncActionTest, 'uses fallback messages for non-error rejections and can clear the error', 'async action tests must cover fallback errors and clearing')

assertIncludes(loginPage, "import { useAsyncAction } from '@/lib/use-async-action'", 'Login must import the shared async action hook')
assertIncludes(loginPage, 'runAction: runLoginAction', 'Login submit must use the shared async action runner')
assertIncludes(loginPage, "errorMessage: '登录失败'", 'Login must preserve local fallback error text')
assertIncludes(loginPage, 'saveRememberedLoginName(name)', 'Login must only remember the account name')
assertIncludes(loginPage, 'clearRememberedLoginName()', 'Login must clear remembered account name when opted out')
assertNotMatches(loginPage, /setSubmitting\s*\(|const\s+\[\s*submitting\s*,\s*setSubmitting\s*\]/, 'Login must not manually toggle submitting state')
assertNotMatches(loginPage, /setError\s*\(|const\s+\[\s*error\s*,\s*setError\s*\]/, 'Login must not manually manage submit error state')
assertNotMatches(loginPage, /saveRememberedLoginName\([^)]*password|localStorage\.setItem\([^)]*password/i, 'Login must not persist password values')

assertIncludes(loginTest, "expect(window.localStorage.getItem('password')).toBeNull()", 'Login tests must assert legacy password key is never saved')
assertIncludes(loginTest, "expect(window.localStorage.getItem(nsKey('password'))).toBeNull()", 'Login tests must assert namespaced password key is never saved')
assertIncludes(loginTest, 'renders API errors without writing password anywhere else', 'Login tests must cover failed login storage safety')

assertIncludes(rebuildPlan, 'src/lib/use-async-action.ts', 'rebuild plan must document the shared local async action hook')

console.log('Frontend async action contract OK')
