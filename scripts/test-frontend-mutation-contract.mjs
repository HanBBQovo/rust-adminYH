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
    console.error(`Frontend mutation contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function assertNotMatches(content, pattern, message) {
  assert(!pattern.test(content), message)
}

const mutationHook = read('apps/desktop/web/src/lib/use-mutation-action.ts')
const mutationHookTest = read('apps/desktop/web/src/lib/use-mutation-action.test.tsx')
const companiesList = read('apps/desktop/web/src/pages/CompaniesList.tsx')
const rolesList = read('apps/desktop/web/src/pages/RolesList.tsx')
const rebuildPlan = read('docs/rebuild-plan.md')

assertIncludes(mutationHook, 'export function useMutationAction', 'shared mutation action hook must be exported')
assertIncludes(mutationHook, 'const confirm = useConfirm()', 'mutation hook must centralize confirm integration')
assertIncludes(mutationHook, 'const { showToast } = useGlobalToast()', 'mutation hook must centralize toast integration')
assertIncludes(mutationHook, 'const [pending, setPending] = useState(false)', 'mutation hook must centralize pending state')
assertIncludes(mutationHook, 'runMutation', 'mutation hook must expose the base mutation runner')
assertIncludes(mutationHook, 'runConfirmedMutation', 'mutation hook must expose confirmed destructive action runner')
assertIncludes(mutationHook, "{ translate: false }", 'mutation hook must preserve untranslated legacy Chinese messages')

assertIncludes(mutationHookTest, 'does not run confirmed mutations when the user cancels', 'mutation hook tests must cover cancelled confirmation')
assertIncludes(mutationHookTest, 'runs confirmed mutations after confirmation succeeds', 'mutation hook tests must cover confirmed execution')
assertIncludes(mutationHookTest, 'normalizes mutation errors through the shared error toast', 'mutation hook tests must cover error toast behavior')
assertIncludes(mutationHookTest, 'shared pending state, success toast, and success callback', 'mutation hook tests must cover pending/success callback behavior')

const migratedPages = [
  ['CompaniesList', companiesList],
  ['RolesList', rolesList],
]

for (const [pageName, pageContent] of migratedPages) {
  assertIncludes(pageContent, "import { useMutationAction } from '@/lib/use-mutation-action'", `${pageName} must import the shared mutation hook`)
  assertIncludes(pageContent, 'pending: submitting', `${pageName} must derive submitting state from the shared mutation hook`)
  assertIncludes(pageContent, 'runMutation(', `${pageName} create/update or assignment path must use the shared mutation runner`)
  assertIncludes(pageContent, 'runConfirmedMutation(', `${pageName} destructive action path must use the shared confirmed mutation runner`)
  assertNotMatches(pageContent, /useConfirm/, `${pageName} must not wire confirm directly after migrating destructive actions to the hook`)
  assertNotMatches(pageContent, /const\s+\[\s*submitting\s*,\s*setSubmitting\s*\]\s*=\s*useState\s*\(/, `${pageName} must not keep local submitting state`)
  assertNotMatches(pageContent, /setSubmitting\s*\(/, `${pageName} must not manually toggle submitting state`)
}

assertIncludes(rebuildPlan, 'src/lib/use-mutation-action.ts', 'rebuild plan must document the shared mutation action hook')
assertIncludes(rebuildPlan, 'CompaniesList、RolesList', 'rebuild plan must document the current migrated pages')

console.log('Frontend mutation contract OK')
