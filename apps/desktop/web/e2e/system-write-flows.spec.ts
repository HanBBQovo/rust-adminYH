import { expect, test } from '@playwright/test'

import { e2eToken, expectTemplateShell, loginAsAdmin, mockAdminSession } from './support/admin-session'

const roleFixture = {
  id: 1,
  name: '超级管理员',
  intro: '所有权限',
  createAt: '2026-07-01T08:00:00Z',
  updateAt: '2026-07-02T08:00:00Z',
}

const menuTreeFixture = {
  id: 3,
  name: '系统管理',
  type: 1,
  url: '/main/system',
  icon: 'Settings',
  sort: 3,
  createAt: '2026-07-01T08:00:00Z',
  updateAt: '2026-07-02T08:00:00Z',
  chilren: [
    {
      id: 31,
      name: '角色权限',
      type: 2,
      url: '/main/system/role',
      icon: 'KeyRound',
      sort: 1,
      partentId: 3,
    },
    {
      id: 32,
      name: '菜单管理',
      type: 2,
      url: '/main/system/menu',
      icon: 'ListTree',
      sort: 2,
      partentId: 3,
    },
  ],
}

const createdMenuFixture = {
  id: 33,
  name: '报表中心',
  type: 2,
  url: '/main/report',
  icon: 'ChartBar',
  sort: 7,
  partentId: 3,
  createAt: '2026-07-02T08:00:00Z',
  updateAt: '2026-07-02T08:00:00Z',
}

const navMenus = [
  { id: 1, name: '工作台', url: '/main/workbench' },
  { id: 2, name: '订单列表', url: '/main/order/orders' },
  { id: 3, name: '回单管理', url: '/main/receipt' },
  { id: 4, name: '发货公司', url: '/main/order/company' },
  { id: 5, name: '用户管理', url: '/main/system/user' },
  { id: 6, name: '角色权限', url: '/main/system/role' },
  { id: 7, name: '菜单管理', url: '/main/system/menu' },
  { id: 8, name: '页面注册表', url: '/main/registry' },
]

const navItems = navMenus.map((menu) => menu.name)

test.describe('system write E2E flows', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminSession(page, { menus: navMenus })
  })

  test('assigns role menu permissions through the legacy role assignment payload', async ({ page }) => {
    let assignRequestSeen = false

    await page.route('**/api/role/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { list: [roleFixture], totalCount: 1 } }),
      })
    })

    await page.route('**/api/menu/tree', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('GET')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: [menuTreeFixture] }),
      })
    })

    await page.route('**/api/role/1/menuIds', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('GET')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { ...roleFixture, menuIds: [3, 31] } }),
      })
    })

    await page.route('**/api/role/assign', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toEqual({ roleId: 1, menuList: [3, 31, 32] })
      assignRequestSeen = true

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: null, message: '分配权限成功！' }),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '角色权限' }).click()

    await expectTemplateShell(page, '角色权限', navItems)
    await expect(page.getByText(roleFixture.name).first()).toBeVisible()

    await page.getByRole('button', { name: '分配权限' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: '分配权限' })).toBeVisible()
    await expect(dialog.getByText('角色权限')).toBeVisible()
    await expect(dialog.getByText('菜单管理')).toBeVisible()

    await dialog.getByRole('checkbox', { name: '选择菜单 菜单管理' }).click()
    await dialog.getByRole('button', { name: '保存权限' }).click()

    await expect.poll(() => assignRequestSeen).toBe(true)
    await expect(page.getByText('分配权限成功！')).toBeVisible()
    await expectTemplateShell(page, '角色权限', navItems)
  })

  test('creates child menus through the legacy menu payload and refreshes the tree', async ({ page }) => {
    let created = false

    await page.route('**/api/menu/tree', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('GET')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          code: 0,
          data: [{ ...menuTreeFixture, chilren: created ? [...menuTreeFixture.chilren, createdMenuFixture] : menuTreeFixture.chilren }],
        }),
      })
    })

    await page.route('**/api/menu', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toEqual({
        name: '报表中心',
        type: 2,
        sort: 7,
        url: '/main/report',
        icon: 'ChartBar',
        parentId: 3,
      })
      created = true

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: null, message: '创建菜单成功！' }),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '菜单管理' }).click()

    await expectTemplateShell(page, '菜单管理', navItems)
    await expect(page.getByText('系统管理').first()).toBeVisible()

    await page.getByRole('button', { name: '创建菜单' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('菜单名称').fill('报表中心')
    await dialog.getByRole('combobox', { name: '类型' }).click()
    await page.getByRole('option', { name: '子菜单' }).click()
    await dialog.getByRole('combobox', { name: '父级菜单' }).click()
    await page.getByRole('option', { name: '系统管理' }).click()
    await dialog.getByLabel('排序').fill('7')
    await dialog.getByLabel('菜单 URL').fill('/main/report')
    await dialog.getByLabel('菜单 icon').fill('ChartBar')
    await dialog.getByRole('button', { name: '保存' }).click()

    await expect(page.getByText('创建菜单成功！')).toBeVisible()
    await expect(page.getByText('报表中心').first()).toBeVisible()
    await expect(page.getByText('/main/report')).toBeVisible()
    await expectTemplateShell(page, '菜单管理', navItems)
  })

  test('keeps the resource registry aligned with implemented modules', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('button', { name: '页面注册表' }).click()

    await expectTemplateShell(page, '页面注册表', navItems)
    await expect(page.getByRole('heading', { name: '业务模块' })).toBeVisible()

    const ordersRow = page.getByRole('row').filter({ hasText: '运单管理' })
    await expect(ordersRow.getByText('/order/list')).toBeVisible()
    await expect(ordersRow.getByText('可接入')).toBeVisible()
    await expect(ordersRow.getByText('建设中')).toHaveCount(0)

    for (const moduleName of ['回单管理', '角色权限', '菜单管理']) {
      await expect(page.getByRole('row').filter({ hasText: moduleName }).getByText('可接入')).toBeVisible()
    }
  })
})
