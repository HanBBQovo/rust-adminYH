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

async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(invalidTokenEnvelope),
    })
  })
}

async function mockLoginSession(page: Page) {
  let authenticated = false
  await mockUnauthenticatedSession(page)

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
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBeUndefined()
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
    expect(route.request().headers().authorization).toBe('Bearer e2e-token')

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
          {
            amount: 'orderfreight',
            title: '运费总额：',
            tips: '环比增长 6.8%',
            subtitle: '运费',
            number1: 3050.5,
            number2: 0,
          },
        ],
      }),
    })
  })

  await page.route('**/api/chart/company/order/sumfreight', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer e2e-token')

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: [
          { id: 1, name: '宇涵测试客户', sumfreight: 1880 },
          { id: 2, name: '上海直营网点', sumfreight: 1170.5 },
        ],
      }),
    })
  })

  await page.route('**/api/chart/company/receipt/sumreceipt', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer e2e-token')

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: [
          { id: 1, name: '宇涵测试客户', sumReceipt: 4 },
          { id: 2, name: '上海直营网点', sumReceipt: 0 },
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
}

async function login(page: Page) {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()

  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('admin123')
  await page.getByRole('button', { name: /登录/ }).click()

  await expect(page.getByRole('main').getByRole('heading', { name: '工作台' })).toBeVisible()
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
  await mockLoginSession(page)
  await login(page)

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

test('navigates core business pages with compatible API contracts', async ({ page }) => {
  await mockLoginSession(page)

  await page.route('**/api/order/list', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBe('Bearer e2e-token')
    expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { list: [orderFixture], totalCount: 1 } }),
    })
  })

  await page.route('**/api/receipt/list', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBe('Bearer e2e-token')
    expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { list: [receiptFixture], totalCount: 1 } }),
    })
  })

  await page.route('**/api/notrecovery/list', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBe('Bearer e2e-token')
    expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: { list: [receiptFixture], totalCount: 1 } }),
    })
  })

  await page.route('**/api/recovery/list', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('POST')
    expect(request.headers().authorization).toBe('Bearer e2e-token')
    expect(request.postDataJSON()).toMatchObject({ offset: 0, size: 10 })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        data: {
          list: [{ ...receiptFixture, recoverystate: '已回收' }],
          totalCount: 1,
        },
      }),
    })
  })

  await page.route('**/api/receipt/201', async (route) => {
    const request = route.request()
    expect(request.method()).toBe('PATCH')
    expect(request.headers().authorization).toBe('Bearer e2e-token')
    expect(request.postDataJSON()).toMatchObject({ recoverystate: '已回收' })

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data: true }),
    })
  })

  await login(page)

  await page.getByRole('button', { name: '订单列表' }).click()
  await expect(page.getByRole('main').getByRole('heading', { name: '订单列表' })).toBeVisible()
  await expect(page.getByText('订单数据')).toBeVisible()
  await expect(page.getByText(orderFixture.oddnumber).first()).toBeVisible()
  await expect(page.getByText(orderFixture.company)).toBeVisible()
  await expect(page.getByText(orderFixture.sumfreight).first()).toBeVisible()

  await page.getByRole('button', { name: '回单管理' }).click()
  await expect(page.getByRole('main').getByRole('heading', { name: '回单管理' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '全部回单' })).toBeVisible()
  await expect(page.getByText(receiptFixture.oddnumber).first()).toBeVisible()
  await expect(page.getByText('未回收').first()).toBeVisible()

  await page.getByRole('tab', { name: '未回收' }).click()
  await expect(page.getByText('兼容旧 /notrecovery/list')).toBeVisible()
  await expect(page.getByText(receiptFixture.oddnumber).first()).toBeVisible()

  await page.getByRole('tab', { name: '已回收' }).click()
  await expect(page.getByText('兼容旧 /recovery/list')).toBeVisible()
  await expect(page.getByText('已回收').first()).toBeVisible()

  await page.getByRole('tab', { name: '全部回单' }).click()
  await page.getByRole('button', { name: '回收', exact: true }).click()
  await expect(page.getByText('回单回收成功！')).toBeVisible()
})
