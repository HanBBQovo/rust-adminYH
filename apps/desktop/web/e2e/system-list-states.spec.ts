import { expect, test } from '@playwright/test'

import { e2eToken, expectTemplateShell, loginAsAdmin, mockAdminSession } from './support/admin-session'
import { legacyListResponse } from './support/legacy-responses'

const companyFixture = {
  id: 301,
  name: '顺丰速运',
  Countorder: 7,
  createAt: '2026-07-01T08:00:00Z',
  updateAt: '2026-07-02T08:00:00Z',
}

const roleFixture = {
  id: 1,
  name: '超级管理员',
  intro: '所有权限',
  createAt: '2026-07-01T08:00:00Z',
  updateAt: '2026-07-02T08:00:00Z',
}

const userFixture = {
  id: 58,
  name: 'admin',
  avatarUrl: '/users/58/avatar',
  enable: 1,
  roleId: 1,
  createAt: '2026-07-01T08:00:00Z',
  updateAt: '2026-07-02T08:00:00Z',
}

const menuFixture = {
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
      name: '用户管理',
      type: 2,
      url: '/main/system/user',
      icon: 'Users',
      sort: 1,
      partentId: 3,
    },
  ],
}

const systemNavItems = ['工作台', '发货公司', '用户管理', '角色权限', '菜单管理']

test.describe('system management E2E state matrix', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminSession(page, {
      menus: [
        { id: 1, name: '工作台', url: '/main/workbench' },
        { id: 2, name: '发货公司', url: '/main/order/company' },
        { id: 3, name: '用户管理', url: '/main/system/user' },
        { id: 4, name: '角色权限', url: '/main/system/role' },
        { id: 5, name: '菜单管理', url: '/main/system/menu' },
      ],
    })
  })

  test('companies page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/company/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

      if (state === 'error') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: -400, data: null, message: '发货公司列表加载失败' }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(legacyListResponse(state === 'loaded' ? companyFixture : null)),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '发货公司' }).click()

    await expectTemplateShell(page, '发货公司', systemNavItems)
    await expect(page.getByRole('heading', { name: '发货公司列表' })).toBeVisible()
    await expect(page.getByText(companyFixture.name)).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无发货公司')).toBeVisible()
    await expect(page.getByText(companyFixture.name)).toHaveCount(0)
    await expectTemplateShell(page, '发货公司', systemNavItems)

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('发货公司列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '发货公司', systemNavItems)
  })

  test('users page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/role/list', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: { list: [roleFixture], totalCount: 1 } }),
      })
    })

    await page.route('**/api/users/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

      if (state === 'error') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: -400, data: null, message: '用户列表加载失败' }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(legacyListResponse(state === 'loaded' ? userFixture : null)),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '用户管理' }).click()

    await expectTemplateShell(page, '用户管理', systemNavItems)
    await expect(page.getByRole('heading', { name: '用户列表' })).toBeVisible()
    await expect(page.getByText(userFixture.name).first()).toBeVisible()
    await expect(page.getByText('超级管理员')).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无用户')).toBeVisible()
    await expect(page.getByRole('cell', { name: userFixture.name, exact: true })).toHaveCount(0)
    await expectTemplateShell(page, '用户管理', systemNavItems)

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('用户列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '用户管理', systemNavItems)
  })

  test('roles page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/role/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

      if (state === 'error') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: -400, data: null, message: '角色列表加载失败' }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(legacyListResponse(state === 'loaded' ? roleFixture : null)),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '角色权限' }).click()

    await expectTemplateShell(page, '角色权限', systemNavItems)
    await expect(page.getByRole('heading', { name: '角色列表' })).toBeVisible()
    await expect(page.getByText(roleFixture.name).first()).toBeVisible()
    await expect(page.getByText(roleFixture.intro).first()).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无角色')).toBeVisible()
    await expect(page.getByText(roleFixture.name)).toHaveCount(0)
    await expectTemplateShell(page, '角色权限', systemNavItems)

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('角色列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '角色权限', systemNavItems)
  })

  test('menus page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/menu/tree', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('GET')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)

      if (state === 'error') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: -400, data: null, message: '菜单列表加载失败' }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: state === 'loaded' ? [menuFixture] : [] }),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '菜单管理' }).click()

    await expectTemplateShell(page, '菜单管理', systemNavItems)
    await expect(page.getByRole('heading', { name: '菜单列表' })).toBeVisible()
    await expect(page.getByText('系统管理').first()).toBeVisible()
    await expect(page.getByText('用户管理').first()).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无菜单')).toBeVisible()
    await expect(page.getByText('系统管理')).toHaveCount(0)
    await expectTemplateShell(page, '菜单管理', systemNavItems)

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('菜单列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '菜单管理', systemNavItems)
  })
})
