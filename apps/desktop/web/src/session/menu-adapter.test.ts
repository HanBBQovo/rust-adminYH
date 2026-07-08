import { describe, expect, it } from 'vitest'

import { adaptLegacyMenus, navigationForSession, STATIC_NAV_ITEMS } from '@/session/menu-adapter'

describe('adaptLegacyMenus', () => {
  it('does not grant template nav permissions when old menus are empty', () => {
    expect(adaptLegacyMenus([])).toEqual([])
  })

  it('grants every static page to the super admin role even when menus are empty', () => {
    const items = navigationForSession({
      user: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] },
      menus: [],
    })

    expect(items.map((item) => item.key)).toEqual(STATIC_NAV_ITEMS.map((item) => item.key))
  })

  it('keeps regular roles constrained to backend menu permissions', () => {
    const items = navigationForSession({
      user: { id: 59, name: 'operator', roles: ['2'], roleIds: [2] },
      menus: [{ name: '订单列表', url: '/main/order/orders' }],
    })

    expect(items.map((item) => item.key)).toEqual(['orders'])
  })

  it('does not grant template nav permissions when menus do not match known pages', () => {
    expect(adaptLegacyMenus([{ name: '未知模块', url: '/main/unknown' }])).toEqual([])
  })

  it('maps old menu labels and urls into template pages', () => {
    const items = adaptLegacyMenus([
      { name: '系统概览', url: '/main/analysis/overview' },
      { name: '工作台', url: '/main/analysis/workbench' },
      { name: '订单管理', url: '/main/order/list' },
      { name: '系统设置', url: '/main/settings' },
    ])

    expect(items.map((item) => item.key)).toEqual(['workspace', 'orders', 'settings'])
    expect(items[1].label).toBe('订单管理')
  })

  it('ignores the removed old overview route and keeps the workbench page', () => {
    const items = adaptLegacyMenus([
      { name: '概览', url: '/main/analysis/overview' },
      { name: '工作台', url: '/main/analysis/workbench' },
    ])

    expect(items.map((item) => item.key)).toEqual(['workspace'])
    expect(items[0].label).toBe('工作台')
  })

  it('maps role and menu permission entries as separate template pages', () => {
    const items = adaptLegacyMenus([
      {
        name: '系统管理',
        children: [
          { name: '角色管理', url: '/main/system/role' },
          { name: '菜单管理', url: '/main/system/menu' },
        ],
      },
    ])

    expect(items.map((item) => item.key)).toEqual(['roles', 'menus'])
  })

  it('maps old company menus into the company page', () => {
    const items = adaptLegacyMenus([{ name: '发货公司', url: '/main/order/company' }])

    expect(items.map((item) => item.key)).toEqual(['companies'])
    expect(items[0].label).toBe('发货公司')
  })

  it('maps old user menus into the users page', () => {
    const items = adaptLegacyMenus([{ name: '用户管理', url: '/main/system/user' }])

    expect(items.map((item) => item.key)).toEqual(['users'])
    expect(items[0].label).toBe('用户管理')
  })

  it('maps old role menus into the roles page', () => {
    const items = adaptLegacyMenus([{ name: '角色管理', url: '/main/system/role' }])

    expect(items.map((item) => item.key)).toEqual(['roles'])
    expect(items[0].label).toBe('角色管理')
  })

  it('maps old typo chilren menu trees into the menu page', () => {
    const items = adaptLegacyMenus([
      {
        name: '系统管理',
        chilren: [{ name: '菜单管理', url: '/main/system/menu' }],
      },
    ])

    expect(items.map((item) => item.key)).toEqual(['menus'])
    expect(items[0].label).toBe('菜单管理')
  })

  it('does not map old type 1 order directories as order pages', () => {
    const items = adaptLegacyMenus([
      {
        name: '订单管理',
        type: 1,
        url: '/main/order',
        children: [{ name: '发货公司', type: 2, url: '/main/order/company' }],
      },
    ])

    expect(items.map((item) => item.key)).toEqual(['companies'])
    expect(items[0].label).toBe('发货公司')
  })

  it('maps legacy type 1 leaf menus into concrete template pages', () => {
    const items = adaptLegacyMenus([{ name: '订单管理', type: 1, url: '/main/order/list' }])

    expect(items.map((item) => item.key)).toEqual(['orders'])
    expect(items[0].label).toBe('订单管理')
  })

  it('does not map old type 1 system directories as registry pages', () => {
    const items = adaptLegacyMenus([
      {
        name: '系统管理',
        type: 1,
        url: '/main/system',
        children: [{ name: '角色管理', type: 2, url: '/main/system/role' }],
      },
    ])

    expect(items.map((item) => item.key)).toEqual(['roles'])
    expect(items[0].label).toBe('角色管理')
  })

  it('uses the concrete type 2 receipt child instead of the parent directory', () => {
    const items = adaptLegacyMenus([
      {
        name: '回单管理',
        type: 1,
        url: '/main/receipt',
        children: [{ name: '未回收回单', type: 2, url: '/main/receipt/notrecovery' }],
      },
    ])

    expect(items.map((item) => item.key)).toEqual(['receipts'])
    expect(items[0].label).toBe('未回收回单')
  })
})
