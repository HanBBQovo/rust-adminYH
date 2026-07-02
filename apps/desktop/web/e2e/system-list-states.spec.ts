import { expect, test, type Page } from '@playwright/test'

const invalidTokenEnvelope = {
  code: -200,
  message: '无效的token或登录已失效！请重新登录~',
}

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

async function mockSession(page: Page) {
  let authenticated = false

  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        authenticated
          ? { code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }
          : invalidTokenEnvelope,
      ),
    })
  })

  await page.route('**/api/login', async (route) => {
    expect(route.request().method()).toBe('POST')
    authenticated = true

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          id: 58,
          name: 'admin',
          token: 'e2e-token',
        },
      }),
    })
  })

  await page.route('**/api/role/1/menu', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer e2e-token')

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: [
          { id: 1, name: '工作台', url: '/main/workbench' },
          { id: 2, name: '发货公司', url: '/main/order/company' },
          { id: 3, name: '用户管理', url: '/main/system/user' },
          { id: 4, name: '角色权限', url: '/main/system/role' },
          { id: 5, name: '菜单管理', url: '/main/system/menu' },
        ],
      }),
    })
  })

  await page.route('**/api/chart/headerList', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: [
          {
            amount: 'ordercount',
            title: '订单总数：',
            tips: '已同步旧系统 chart 数据',
            subtitle: '订单',
            number1: 12,
            number2: 0,
          },
        ],
      }),
    })
  })

  await page.route('**/api/chart/company/order/sumfreight', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [] }),
    })
  })

  await page.route('**/api/chart/company/receipt/sumreceipt', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [] }),
    })
  })
}

async function login(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('admin123')
  await page.getByRole('button', { name: /登录/ }).click()
  await expect(page.getByRole('main').getByRole('heading', { name: '工作台' })).toBeVisible()
}

async function expectTemplateShell(page: Page, activeHeading: string) {
  await expect(page.getByRole('main').getByRole('heading', { name: activeHeading, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '发货公司', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '用户管理', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '角色权限', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '菜单管理', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible()
}

function legacyListResponse(row: unknown | null) {
  return { code: 0, data: { list: row ? [row] : [], totalCount: row ? 1 : 0 } }
}

test.describe('system management E2E state matrix', () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page)
  })

  test('companies page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/company/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe('Bearer e2e-token')
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

    await login(page)
    await page.getByRole('button', { name: '发货公司' }).click()

    await expectTemplateShell(page, '发货公司')
    await expect(page.getByRole('heading', { name: '发货公司列表' })).toBeVisible()
    await expect(page.getByText(companyFixture.name)).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无发货公司')).toBeVisible()
    await expect(page.getByText(companyFixture.name)).toHaveCount(0)
    await expectTemplateShell(page, '发货公司')

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('发货公司列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '发货公司')
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
      expect(request.headers().authorization).toBe('Bearer e2e-token')
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

    await login(page)
    await page.getByRole('button', { name: '用户管理' }).click()

    await expectTemplateShell(page, '用户管理')
    await expect(page.getByRole('heading', { name: '用户列表' })).toBeVisible()
    await expect(page.getByText(userFixture.name).first()).toBeVisible()
    await expect(page.getByText('超级管理员')).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无用户')).toBeVisible()
    await expect(page.getByRole('cell', { name: userFixture.name, exact: true })).toHaveCount(0)
    await expectTemplateShell(page, '用户管理')

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('用户列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '用户管理')
  })

  test('roles page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/role/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe('Bearer e2e-token')
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

    await login(page)
    await page.getByRole('button', { name: '角色权限' }).click()

    await expectTemplateShell(page, '角色权限')
    await expect(page.getByRole('heading', { name: '角色列表' })).toBeVisible()
    await expect(page.getByText(roleFixture.name).first()).toBeVisible()
    await expect(page.getByText(roleFixture.intro).first()).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无角色')).toBeVisible()
    await expect(page.getByText(roleFixture.name)).toHaveCount(0)
    await expectTemplateShell(page, '角色权限')

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('角色列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '角色权限')
  })

  test('menus page keeps template shell across loaded, empty, and error states', async ({ page }) => {
    let state: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/menu/tree', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('GET')
      expect(request.headers().authorization).toBe('Bearer e2e-token')

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

    await login(page)
    await page.getByRole('button', { name: '菜单管理' }).click()

    await expectTemplateShell(page, '菜单管理')
    await expect(page.getByRole('heading', { name: '菜单列表' })).toBeVisible()
    await expect(page.getByText('系统管理').first()).toBeVisible()
    await expect(page.getByText('用户管理').first()).toBeVisible()

    state = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无菜单')).toBeVisible()
    await expect(page.getByText('系统管理')).toHaveCount(0)
    await expectTemplateShell(page, '菜单管理')

    state = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('菜单列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '菜单管理')
  })
})
