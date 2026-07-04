#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Frontend header action contract failed: ${message}`)
    process.exit(1)
  }
}

function assertIncludes(content, expected, message) {
  assert(content.includes(expected), message)
}

function extractPageShellActions(content, file) {
  const pageShellIndex = content.indexOf('<PageShell')
  assert(pageShellIndex !== -1, `${file} must render PageShell`)

  const marker = 'actions={'
  const start = content.indexOf(marker, pageShellIndex)
  assert(start !== -1, `${file} must define PageShell actions`)

  let depth = 0
  for (let index = start + marker.length - 1; index < content.length; index += 1) {
    const char = content[index]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return content.slice(start, index + 1)
      }
    }
  }

  throw new Error(`${file} PageShell actions block was not closed`)
}

const pageContracts = [
  {
    file: 'apps/desktop/web/src/pages/CompaniesList.tsx',
    labels: ['新建发货公司', '刷新'],
    required: ['icon={Plus}', 'icon={RefreshCw}', "iconClassName={loading ? 'animate-spin' : undefined}"],
  },
  {
    file: 'apps/desktop/web/src/pages/OrdersList.tsx',
    labels: ['新建订单', '刷新', '导出中', '导出筛选结果'],
    required: [
      'icon={Plus}',
      'icon={RefreshCw}',
      'icon={Download}',
      "label={exporting ? '导出中' : '导出筛选结果'}",
      'disabled={loading || total <= 0 || exporting}',
    ],
  },
  {
    file: 'apps/desktop/web/src/pages/UsersList.tsx',
    labels: ['新建用户', '刷新'],
    required: ['icon={Plus}', 'icon={RefreshCw}', 'refreshRoles()'],
  },
  {
    file: 'apps/desktop/web/src/pages/MenusList.tsx',
    labels: ['创建菜单', '刷新'],
    required: ['icon={Plus}', 'icon={RefreshCw}'],
  },
  {
    file: 'apps/desktop/web/src/pages/RolesList.tsx',
    labels: ['新建角色', '刷新'],
    required: ['icon={Plus}', 'icon={RefreshCw}'],
  },
  {
    file: 'apps/desktop/web/src/pages/ReceiptsList.tsx',
    labels: ['刷新'],
    required: ['icon={RefreshCw}', "iconClassName={loading ? 'animate-spin' : undefined}"],
  },
  {
    file: 'apps/desktop/web/src/pages/ResourceRegistry.tsx',
    labels: ['刷新'],
    required: ['icon={RefreshCw}', "iconClassName={loading ? 'animate-spin' : undefined}"],
  },
  {
    file: 'apps/desktop/web/src/pages/Workspace.tsx',
    labels: ['刷新'],
    required: ['icon={RefreshCw}', "iconClassName={loading ? 'animate-spin' : undefined}"],
    allowSegmentedControls: true,
  },
]

const frontendGate = read('scripts/test-frontend.sh')
const releaseContract = read('scripts/test-release-contract.mjs')
const rebuildPlan = read('docs/rebuild-plan.md')

assertIncludes(
  frontendGate,
  'scripts/test-frontend-header-action-contract.mjs',
  'frontend gate must run the header action contract',
)
assertIncludes(
  releaseContract,
  'scripts/test-frontend-header-action-contract.mjs',
  'release contract must lock the frontend header action contract into default gates',
)
assertIncludes(
  rebuildPlan,
  'scripts/test-frontend-header-action-contract.mjs',
  'rebuild plan must document the frontend header action contract',
)
assertIncludes(
  rebuildPlan,
  'HeaderActionButton',
  'rebuild plan must document HeaderActionButton as the shared page header action wrapper',
)

for (const { file, labels, required, allowSegmentedControls = false } of pageContracts) {
  const content = read(file)
  const actions = extractPageShellActions(content, file)

  assertIncludes(content, "import { HeaderActionButton } from '@/components/layout/HeaderActionButton'", `${file} must import HeaderActionButton`)
  assertIncludes(actions, '<HeaderActionButton', `${file} PageShell actions must use HeaderActionButton`)
  if (!allowSegmentedControls) {
    assert(!actions.includes('<Button'), `${file} PageShell actions must not hand-roll Button controls`)
  } else {
    assertIncludes(actions, 'RANGE_OPTIONS.map', `${file} may only keep inline Button controls for the range segmented control`)
  }
  assert(!actions.includes('className="gap-2"'), `${file} PageShell actions must not hand-roll gap-2 button styling`)

  for (const label of labels) {
    assertIncludes(actions, label, `${file} PageShell actions must preserve ${label}`)
  }
  for (const token of required) {
    assertIncludes(actions, token, `${file} PageShell actions must preserve ${token}`)
  }
}

console.log('Frontend header action contract OK')
