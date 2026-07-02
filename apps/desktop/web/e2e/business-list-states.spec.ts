import { expect, test, type Page } from '@playwright/test'

const invalidTokenEnvelope = {
  code: -200,
  message: '无效的token或登录已失效！请重新登录~',
}

const orderFixture = {
  id: 101,
  oddnumber: 'YH20260702001',
  billingAt: '2026-07-02',
  consignee: '上海收货人',
  consigneephone: '13800000001',
  address: '上海市浦东新区测试路 88 号',
  method: '送货',
  goodsname: '测试配件',
  number: '12',
  pack: '纸箱',
  weight: '120',
  measurement: '3.5',
  cainsurance: '是',
  value: '5000',
  insurance: '50',
  consignor: '杭州发货人',
  consignorphone: '13900000002',
  freight: '320',
  delivery: '30',
  sumfreight: '350',
  freightstate: '现付',
  paynow: '350',
  paygo: '0',
  payback: '0',
  paymonth: '0',
  receiptnum: 2,
  company: '宇涵测试客户',
  remarks: 'E2E 订单样本',
}

const receiptFixture = {
  id: 201,
  oddnumber: 'YH20260702001',
  billingAt: '2026-07-02',
  recoverystate: '未回收',
  issuestate: '未发放',
  poststate: '未寄出',
  recoverynumber: 2,
  consignor: '杭州发货人',
  consignee: '上海收货人',
  goodsname: '测试配件',
  goodsnumber: '12',
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
          { id: 2, name: '订单列表', url: '/main/order/orders' },
          { id: 3, name: '回单管理', url: '/main/receipt' },
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
  await expect(page.getByRole('main').getByRole('heading', { name: activeHeading })).toBeVisible()
  await expect(page.getByRole('button', { name: '工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '订单列表' })).toBeVisible()
  await expect(page.getByRole('button', { name: '回单管理' })).toBeVisible()
  await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible()
}

test.describe('business list E2E state matrix', () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page)
  })

  test('orders page keeps template shell across loading, loaded, empty, and error states', async ({ page }) => {
    let orderState: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/order/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe('Bearer e2e-token')
      expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

      if (orderState === 'loaded') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, data: { list: [orderFixture], totalCount: 1 } }),
        })
        return
      }

      if (orderState === 'empty') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, data: { list: [], totalCount: 0 } }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        status: 200,
        body: JSON.stringify({ code: -400, data: null, message: '订单列表加载失败' }),
      })
    })

    await login(page)
    await page.getByRole('button', { name: '订单列表' }).click()

    await expectTemplateShell(page, '订单列表')
    await expect(page.getByText('订单数据')).toBeVisible()
    await expect(page.getByText(orderFixture.oddnumber).first()).toBeVisible()
    await expect(page.getByText(orderFixture.company)).toBeVisible()

    orderState = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无订单')).toBeVisible()
    await expect(page.getByText(orderFixture.oddnumber)).toHaveCount(0)
    await expectTemplateShell(page, '订单列表')

    orderState = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('订单列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '订单列表')
  })

  test('receipts page keeps template shell across loading, loaded, empty, and error states', async ({ page }) => {
    let receiptState: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/receipt/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe('Bearer e2e-token')
      expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

      if (receiptState === 'loaded') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, data: { list: [receiptFixture], totalCount: 1 } }),
        })
        return
      }

      if (receiptState === 'empty') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, data: { list: [], totalCount: 0 } }),
        })
        return
      }

      await route.fulfill({
        contentType: 'application/json',
        status: 200,
        body: JSON.stringify({ code: -400, data: null, message: '回单列表加载失败' }),
      })
    })

    await login(page)
    await page.getByRole('button', { name: '回单管理' }).click()

    await expectTemplateShell(page, '回单管理')
    await expect(page.getByRole('heading', { name: '全部回单' })).toBeVisible()
    await expect(page.getByText(receiptFixture.oddnumber).first()).toBeVisible()
    await expect(page.getByText('未回收').first()).toBeVisible()

    receiptState = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无回单')).toBeVisible()
    await expect(page.getByText(receiptFixture.oddnumber)).toHaveCount(0)
    await expectTemplateShell(page, '回单管理')

    receiptState = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('回单列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '回单管理')
  })
})
