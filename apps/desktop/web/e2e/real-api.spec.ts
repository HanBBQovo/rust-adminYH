import { expect, test } from '@playwright/test'

test.describe('real Rust API E2E', () => {
  test.skip(process.env.REAL_API_E2E !== 'true', 'requires Docker compose MySQL + admin-api + desktop-web')

  test('logs in through nginx to Rust API and renders seeded business data', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: '宇涵物流订单系统' })).toBeVisible()
    await page.getByLabel('账号').fill('admin')
    await page.getByLabel('密码').fill('admin123')
    await page.getByRole('button', { name: /登录/ }).click()

    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: '工作台' })).toBeVisible()
    await expect(main.getByText('订单总数', { exact: true })).toBeVisible()
    await expect(main.getByText('所有订单总数量')).toBeVisible()
    await expect(main.getByText('运费合计', { exact: true })).toBeVisible()
    await expect(main.getByText('¥350.00')).toBeVisible()
    await expect(page.getByRole('button', { name: '订单列表' })).toBeVisible()
    await expect(page.getByRole('button', { name: '回单管理' })).toBeVisible()
    await expect(page.getByRole('button', { name: '页面注册表' })).toBeVisible()

    await page.getByRole('button', { name: '订单列表' }).click()
    await expect(main.getByRole('heading', { name: '订单列表' })).toBeVisible()
    await expect(page.getByText('订单数据')).toBeVisible()
    await expect(page.getByText('YH-DOCKER-0001').first()).toBeVisible()
    await expect(page.getByText('Docker 发货公司').first()).toBeVisible()

    await page.getByRole('button', { name: '回单管理' }).click()
    await expect(main.getByRole('heading', { name: '回单管理' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '全部回单' })).toBeVisible()
    await expect(page.getByText('YH-DOCKER-0001').first()).toBeVisible()
    await expect(page.getByText('未回收').first()).toBeVisible()

    await page.getByRole('button', { name: '页面注册表' }).click()
    await expect(main.getByRole('heading', { name: '页面注册表' })).toBeVisible()
    const orderRegistryRow = page.getByRole('row').filter({ hasText: '订单管理' })
    await expect(orderRegistryRow.getByText('/order/list')).toBeVisible()
    await expect(orderRegistryRow.getByText('1')).toBeVisible()

    const receiptRegistryRow = page.getByRole('row').filter({ hasText: '回单管理' })
    await expect(receiptRegistryRow.getByText('/receipt/list')).toBeVisible()
    await expect(receiptRegistryRow.getByText('1')).toBeVisible()
  })
})
