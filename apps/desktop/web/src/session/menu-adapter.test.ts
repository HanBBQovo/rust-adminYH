import { describe, expect, it } from 'vitest'

import { adaptLegacyMenus } from '@/session/menu-adapter'

describe('adaptLegacyMenus', () => {
  it('does not grant template nav permissions when old menus are empty', () => {
    expect(adaptLegacyMenus([])).toEqual([])
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

    expect(items.map((item) => item.key)).toEqual(['overview', 'workspace', 'orders', 'settings'])
    expect(items[2].label).toBe('订单管理')
  })

  it('keeps the old overview route separate from the workbench dashboard', () => {
    const items = adaptLegacyMenus([
      { name: '概览', url: '/main/analysis/overview' },
      { name: '工作台', url: '/main/analysis/workbench' },
    ])

    expect(items.map((item) => item.key)).toEqual(['overview', 'workspace'])
    expect(items[0].label).toBe('概览')
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
