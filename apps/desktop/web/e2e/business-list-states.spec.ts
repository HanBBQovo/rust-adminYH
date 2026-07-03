import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

import { e2eToken, expectTemplateShell, loginAsAdmin, mockAdminSession } from './support/admin-session'

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

const secondOrderFixture = {
  ...orderFixture,
  id: 102,
  oddnumber: 'YH20260702002',
  consignee: '上海筛选收货人',
  remarks: 'E2E 第二页订单样本',
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

const businessNavItems = ['工作台', '订单列表', '回单管理']

test.describe('business list E2E state matrix', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminSession(page, {
      menus: [
        { id: 1, name: '工作台', url: '/main/workbench' },
        { id: 2, name: '订单列表', url: '/main/order/orders' },
        { id: 3, name: '回单管理', url: '/main/receipt' },
      ],
    })
  })

  test('orders page keeps template shell across loading, loaded, empty, and error states', async ({ page }) => {
    let orderState: 'loaded' | 'empty' | 'error' = 'loaded'
    let orderListRequests = 0

    await page.route('**/api/order/list', async (route) => {
      const request = route.request()
      const payload = request.postDataJSON()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      orderListRequests += 1

      if (payload.size === 2) {
        expect(payload).toMatchObject({ offset: 0, size: 2, oddnumber: 'YH202607', consignee: '上海' })
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, data: { list: [orderFixture, secondOrderFixture], totalCount: 2 } }),
        })
        return
      }

      expect(payload).toMatchObject({ offset: 0, size: 10 })

      if (orderState === 'loaded') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, data: { list: [orderFixture], totalCount: 2 } }),
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

    await page.route('**/api/memory/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ value: 'E2E 自动收货人' }, { value: 'E2E 自动发货人' }],
        }),
      })
    })

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '订单列表' }).click()

    await expectTemplateShell(page, '订单列表', businessNavItems)
    await expect(page.getByText('订单数据')).toBeVisible()
    await expect(page.getByText(orderFixture.oddnumber).first()).toBeVisible()
    await expect(page.getByText(orderFixture.company)).toBeVisible()
    await expect(page.getByText(secondOrderFixture.oddnumber)).toHaveCount(0)
    await page.getByLabel('运单号').fill('YH202607')
    await page.getByRole('textbox', { name: '收货人', exact: true }).fill('上海')
    await page.getByRole('button', { name: '查询' }).click()
    await expect.poll(() => orderListRequests).toBeGreaterThanOrEqual(2)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出筛选结果' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.csv$/)
    const path = await download.path()
    expect(path).toBeTruthy()
    const csv = await readFile(path!, 'utf8')
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('运单号,开单时间,收货人')
    expect(csv).toContain(orderFixture.oddnumber)
    expect(csv).toContain(secondOrderFixture.oddnumber)
    expect(csv).toContain(orderFixture.company)
    expect(csv).toContain(orderFixture.remarks)
    expect(csv).toContain(secondOrderFixture.remarks)

    await page.getByRole('button', { name: '新建订单' }).click()
    const orderDialog = page.getByRole('dialog')
    const consigneeInput = orderDialog.locator('#order-consignee')
    const consignorInput = orderDialog.locator('#order-consignor')
    await consigneeInput.click()
    await expect(page.getByRole('option', { name: /E2E 自动收货人/ })).toBeVisible()
    await page.getByRole('option', { name: /E2E 自动收货人/ }).click()
    await expect(consigneeInput).toHaveValue('E2E 自动收货人')
    await consignorInput.click()
    await page.getByRole('option', { name: /E2E 自动发货人/ }).click()
    await expect(consignorInput).toHaveValue('E2E 自动发货人')
    await orderDialog.getByRole('button', { name: '取消' }).click()

    orderState = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无订单')).toBeVisible()
    await expect(page.getByText(orderFixture.oddnumber)).toHaveCount(0)
    await expectTemplateShell(page, '订单列表', businessNavItems)

    orderState = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('订单列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '订单列表', businessNavItems)
  })

  test('receipts page keeps template shell across loading, loaded, empty, and error states', async ({ page }) => {
    let receiptState: 'loaded' | 'empty' | 'error' = 'loaded'

    await page.route('**/api/receipt/list', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
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

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '回单管理' }).click()

    await expectTemplateShell(page, '回单管理', businessNavItems)
    await expect(page.getByRole('heading', { name: '全部回单' })).toBeVisible()
    await expect(page.getByText(receiptFixture.oddnumber).first()).toBeVisible()
    await expect(page.getByText('未回收').first()).toBeVisible()

    receiptState = 'empty'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('暂无回单')).toBeVisible()
    await expect(page.getByText(receiptFixture.oddnumber)).toHaveCount(0)
    await expectTemplateShell(page, '回单管理', businessNavItems)

    receiptState = 'error'
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByText('回单列表加载失败')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toHaveCount(0)
    await expectTemplateShell(page, '回单管理', businessNavItems)
  })
})
