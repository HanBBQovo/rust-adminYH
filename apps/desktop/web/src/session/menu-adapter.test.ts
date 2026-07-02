import { describe, expect, it } from 'vitest'

import { adaptLegacyMenus } from '@/session/menu-adapter'

describe('adaptLegacyMenus', () => {
  it('falls back to template nav when old menus are empty', () => {
    expect(adaptLegacyMenus([]).map((item) => item.key)).toEqual(['workspace', 'orders', 'receipts', 'companies', 'registry', 'settings'])
  })

  it('maps old menu labels and urls into template pages', () => {
    const items = adaptLegacyMenus([
      { name: '工作台', url: '/main/analysis/overview' },
      { name: '订单管理', url: '/main/order/list' },
      { name: '系统设置', url: '/main/settings' },
    ])

    expect(items.map((item) => item.key)).toEqual(['workspace', 'orders', 'settings'])
    expect(items[1].label).toBe('订单管理')
  })

  it('deduplicates repeated menu matches', () => {
    const items = adaptLegacyMenus([
      {
        name: '系统管理',
        children: [
          { name: '用户管理', url: '/main/system/user' },
          { name: '角色管理', url: '/main/system/role' },
        ],
      },
    ])

    expect(items.map((item) => item.key)).toEqual(['registry'])
  })

  it('maps old company menus into the company page', () => {
    const items = adaptLegacyMenus([{ name: '发货公司', url: '/main/order/company' }])

    expect(items.map((item) => item.key)).toEqual(['companies'])
    expect(items[0].label).toBe('发货公司')
  })
})
