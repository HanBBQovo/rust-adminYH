#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, sep } from 'node:path'

const root = process.cwd()
const sourceRoot = `${root}/src`

const allowedFetchFiles = new Set(['src/api/client.ts'])
const allowedStorageFiles = new Set([
  'src/api/client.ts',
  'src/api/settings.ts',
  'src/components/theme.tsx',
  'src/lib/font-loading.ts',
  'src/lib/logger.ts',
  'src/main.tsx',
  'src/session/session-store.ts',
])
const allowedStyleFiles = new Set([
  'src/components/layout/FormScaffold.tsx',
  'src/components/ui/chart.tsx',
  'src/components/ui/progress.tsx',
])
const businessVisualTokenRoots = ['src/pages/', 'src/components/account/']
const businessVisualTokenRules = [
  {
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
    message: '禁止业务页面/业务组件散写 raw hex 颜色；必须使用模板 token 或组件封装',
  },
  {
    pattern: /\bbox-shadow\b/gi,
    message: '禁止业务页面/业务组件散写 box-shadow；必须使用模板 shadow token 或组件封装',
  },
  {
    pattern: /\bfont-family\b/gi,
    message: '禁止业务页面/业务组件散写 font-family；必须使用模板字体 token',
  },
  {
    pattern: /\bboxShadow\s*:/g,
    message: '禁止业务页面/业务组件散写 React boxShadow；必须使用模板 shadow token 或组件封装',
  },
  {
    pattern: /\bfontFamily\s*:/g,
    message: '禁止业务页面/业务组件散写 React fontFamily；必须使用模板字体 token',
  },
  {
    pattern: /\b(?:bg|text|border)-\[#/g,
    message: '禁止业务页面/业务组件使用 Tailwind 任意颜色值；必须使用模板语义 token',
  },
  {
    pattern: /\bshadow-\[/g,
    message: '禁止业务页面/业务组件使用 Tailwind 任意阴影值；必须使用模板 shadow token',
  },
]
const productionUiTextPattern = /真实项目|模板只演示|参考页|mock only|demo only|后续新增|本切片|开发期提交|src\/|scripts\//gi

const violations = []

if (!statSync(sourceRoot).isDirectory()) {
  throw new Error(`source root missing: ${sourceRoot}`)
}

function listSourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      return listSourceFiles(path)
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return []
    }
    return [path]
  })
}

function toRelative(path) {
  return relative(root, path).split(sep).join('/')
}

function isTestFile(path) {
  return /\.(test|spec)\.(ts|tsx)$/.test(path) || path.includes('/test/')
}

function isBusinessVisualTokenFile(path) {
  return businessVisualTokenRoots.some((root) => path.startsWith(root)) && !isTestFile(path)
}

function addViolation(file, line, message) {
  violations.push(`${file}:${line}: ${message}`)
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

function assertIncludes(content, expected, message) {
  if (!content.includes(expected)) {
    addViolation('src/pages/ResourceRegistry.tsx', 1, message)
  }
}

for (const absolutePath of listSourceFiles(sourceRoot)) {
  const file = toRelative(absolutePath)
  const content = readFileSync(absolutePath, 'utf8')
  const isUiModule = file.startsWith('src/components/ui/')
  const isApiModule = file.startsWith('src/api/')
  const isStorageWrapper = allowedStorageFiles.has(file)

  for (const match of content.matchAll(/\bfetch\s*\(/g)) {
    if (!allowedFetchFiles.has(file)) {
      addViolation(file, lineNumber(content, match.index), '禁止绕过 src/api/client.ts 直接调用 fetch')
    }
  }

  for (const match of content.matchAll(/from\s+['"]axios['"]/g)) {
    addViolation(file, lineNumber(content, match.index), '禁止引入 axios；统一使用 src/api/client.ts')
  }

  for (const match of content.matchAll(/from\s+['"]@radix-ui\//g)) {
    if (!isUiModule) {
      addViolation(file, lineNumber(content, match.index), 'Radix 原语只能封装在 src/components/ui 内')
    }
  }

  for (const match of content.matchAll(/style=\{\{/g)) {
    if (!allowedStyleFiles.has(file)) {
      addViolation(file, lineNumber(content, match.index), '禁止页面/业务组件散写 inline style；抽成模板组件或 token 化 class')
    }
  }

  for (const match of content.matchAll(/\b(?:window\.)?(?:localStorage|sessionStorage)\s*\./g)) {
    if (!isTestFile(file) && !isStorageWrapper) {
      addViolation(file, lineNumber(content, match.index), '禁止业务代码直接读写 Web Storage；必须通过统一封装')
    }
  }

  for (const match of content.matchAll(productionUiTextPattern)) {
    if (!isTestFile(file) && (file.startsWith('src/pages/') || file.startsWith('src/components/'))) {
      addViolation(file, lineNumber(content, match.index), '禁止生产页面保留模板演示/假实现文案')
    }
  }

  if (!isTestFile(file) && !isApiModule) {
    for (const match of content.matchAll(/\bapiRequest\s*\(/g)) {
      addViolation(file, lineNumber(content, match.index), '业务层不得直接调用 apiRequest；必须通过 src/api/* 封装')
    }
  }

  if (isBusinessVisualTokenFile(file)) {
    for (const { pattern, message } of businessVisualTokenRules) {
      for (const match of content.matchAll(pattern)) {
        addViolation(file, lineNumber(content, match.index), message)
      }
    }
  }
}

const resourceRegistry = readFileSync(`${sourceRoot}/pages/ResourceRegistry.tsx`, 'utf8')
assertIncludes(
  resourceRegistry,
  "import { DataTableSurface } from '@/components/layout/DataTableSurface'",
  '页面注册表必须复用 DataTableSurface 管理 loading/error/empty/table 外壳',
)
assertIncludes(
  resourceRegistry,
  '<DataTableSurface',
  '页面注册表必须通过 DataTableSurface 渲染注册表表格',
)
assertIncludes(
  resourceRegistry,
  'toolbar={',
  '页面注册表必须通过 DataTableSurface toolbar 插槽保留搜索工具条',
)

if (violations.length > 0) {
  console.error('Frontend architecture gate failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend architecture gate passed.')
