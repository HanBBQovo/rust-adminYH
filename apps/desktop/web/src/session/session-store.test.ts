import { describe, expect, it } from 'vitest'

import { lastPageStorageKey, readStoredPage, saveStoredPage } from '@/session/session-store'
import type { SessionNavItem } from '@/session/types'

const navItems = [
  { key: 'workspace', label: '工作台', icon: () => null },
  { key: 'orders', label: '订单列表', icon: () => null },
  { key: 'settings', label: '系统设置', icon: () => null },
] satisfies SessionNavItem[]

describe('session page store', () => {
  it('falls back to the first available nav item when no page was saved', () => {
    expect(readStoredPage(navItems)).toBe('workspace')
    expect(lastPageStorageKey()).toBe('admin-yh:last-page')
  })

  it('persists and restores only pages available in the current menu', () => {
    saveStoredPage('orders')

    expect(window.localStorage.getItem(lastPageStorageKey())).toBe('orders')
    expect(readStoredPage(navItems)).toBe('orders')
    expect(readStoredPage([{ key: 'settings', label: '系统设置', icon: () => null }])).toBe('settings')
  })

  it('falls back to workspace when no menu item is available', () => {
    window.localStorage.setItem(lastPageStorageKey(), 'orders')

    expect(readStoredPage([])).toBe('workspace')
  })
})
