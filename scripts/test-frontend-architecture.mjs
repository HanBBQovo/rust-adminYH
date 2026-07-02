#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, sep } from 'node:path'

const root = process.cwd()
const sourceRoot = `${root}/src`

const allowedFetchFiles = new Set(['src/api/client.ts'])
const allowedStyleFiles = new Set([
  'src/components/layout/FormScaffold.tsx',
  'src/components/ui/chart.tsx',
  'src/components/ui/progress.tsx',
])

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

function addViolation(file, line, message) {
  violations.push(`${file}:${line}: ${message}`)
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

for (const absolutePath of listSourceFiles(sourceRoot)) {
  const file = toRelative(absolutePath)
  const content = readFileSync(absolutePath, 'utf8')
  const isUiModule = file.startsWith('src/components/ui/')
  const isApiModule = file.startsWith('src/api/')

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

  if (!isTestFile(file) && !isApiModule) {
    for (const match of content.matchAll(/\bapiRequest\s*\(/g)) {
      addViolation(file, lineNumber(content, match.index), '业务层不得直接调用 apiRequest；必须通过 src/api/* 封装')
    }
  }
}

if (violations.length > 0) {
  console.error('Frontend architecture gate failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend architecture gate passed.')
