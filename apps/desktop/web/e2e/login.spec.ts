import { expect, test, type Page } from '@playwright/test'

const invalidTokenEnvelope = {
  code: -200,
  message: '无效的token或登录已失效！请重新登录~',
}

async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(invalidTokenEnvelope),
    })
  })
}

test('renders the login shell from the frontend template', async ({ page }) => {
  await mockUnauthenticatedSession(page)

  await page.goto('/')

  await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()
  await expect(page.getByLabel('账号')).toBeVisible()
  await expect(page.getByLabel('密码')).toBeVisible()
  await expect(page.getByRole('button', { name: /登录/ })).toBeDisabled()
})

test('logs in, renders dashboard data, and logs out', async ({ page }) => {
  await mockUnauthenticatedSession(page)

  await page.route('**/api/login', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBeUndefined()

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
          { id: 2, name: '订单列表', url: '/main/order/orders' },
          { id: 3, name: '回单管理', url: '/main/receipt' },
        ],
      }),
    })
  })

  await page.route('**/api/auth/logout', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer e2e-token')

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: true }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()

  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('admin123')
  await page.getByRole('button', { name: /登录/ }).click()

  await expect(page.getByRole('main').getByRole('heading', { name: '工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '订单列表' })).toBeVisible()
  await expect(page.getByRole('button', { name: '回单管理' })).toBeVisible()
  await expect(page.getByText('运费趋势')).toBeVisible()
  await expect(page.getByText('待处理事项')).toBeVisible()

  await page.getByRole('button', { name: '近 30 天' }).click()
  await expect(page.getByText('环比增长 6.8%')).toBeVisible()

  await page.getByRole('button', { name: /退出登录/ }).click()

  await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()
  await expect(page.getByLabel('账号')).toBeVisible()
})
