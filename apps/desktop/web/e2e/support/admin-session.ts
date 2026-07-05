import { expect, type Page } from '@playwright/test'

export const e2eToken = 'e2e-token'

export const invalidTokenEnvelope = {
  code: -200,
  message: '无效的token或登录已失效！请重新登录~',
}

export interface MockSessionOptions {
  menus: Array<{ id: number; name: string; url: string }>
  currentUser?: Record<string, unknown>
  resources?: Array<Record<string, unknown>>
}

export async function mockAdminSession(page: Page, options: MockSessionOptions) {
  let authenticated = false

  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        authenticated
          ? {
              code: 0,
              data: {
                id: 58,
                name: 'admin',
                roles: ['1'],
                roleIds: [1],
                ...options.currentUser,
              },
            }
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
          token: e2eToken,
        },
      }),
    })
  })

  await page.route('**/api/role/1/menu', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${e2eToken}`)

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: options.menus }),
    })
  })

  await page.route('**/api/menu/tree', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: [] }),
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

  await page.route('**/api/admin/resources', async (route) => {
    expect(route.request().method()).toBe('GET')
    expect(route.request().headers().authorization).toBe(`Bearer ${e2eToken}`)

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: options.resources ?? [],
        message: 'success',
      }),
    })
  })
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()
  await page.getByRole('textbox', { name: '账号', exact: true }).fill('admin')
  await page.getByLabel('密码').fill('admin123')
  await page.getByRole('button', { name: /登录/ }).click()
  await expect(page.getByRole('main').getByRole('heading', { name: '工作台' })).toBeVisible()
}

export interface TemplateShellOptions {
  headingRegion?: 'banner' | 'main'
}

export async function expectTemplateShell(
  page: Page,
  activeHeading: string,
  navItems: string[],
  options: TemplateShellOptions = {},
) {
  const headingRoot = options.headingRegion === 'banner' ? page.getByRole('banner') : page.getByRole('main')

  await expect(headingRoot.getByRole('heading', { name: activeHeading, exact: true })).toBeVisible()
  for (const name of navItems) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible()
}
