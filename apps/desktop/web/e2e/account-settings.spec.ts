import { expect, test, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'

const invalidTokenEnvelope = {
  code: -200,
  message: '无效的token或登录已失效！请重新登录~',
}

async function mockSettingsSession(page: Page) {
  let authenticated = false

  await page.route('**/api/users/58/avatar**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lSGkcwAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
  })

  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        authenticated
          ? { code: 0, data: { id: 58, name: 'admin', avatarUrl: '/users/58/avatar', roles: ['1'], roleIds: [1] } }
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
          { id: 9, name: '系统设置', url: '/main/settings' },
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
  await expect(page.getByRole('banner').getByRole('heading', { name: activeHeading, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '系统设置', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /退出登录/ })).toBeVisible()
}

test.describe('account settings E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockSettingsSession(page)
  })

  test('keeps the template shell while updating password and uploading avatar', async ({ page }) => {
    await page.route('**/api/users/58/password', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('PATCH')
      expect(request.headers().authorization).toBe('Bearer e2e-token')
      expect(request.postDataJSON()).toEqual({ password: 'new-secret' })

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: true, message: '修改密码成功！' }),
      })
    })

    await page.route('**/api/upload/avatar', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe('Bearer e2e-token')
      expect(request.headers()['content-type']).toContain('multipart/form-data')
      const body = request.postData() || ''
      expect(body).toContain('name="avatar"')
      expect(body).toContain('avatar.png')
      expect(body).toContain('PNGDATA')

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: null, message: '上传头像成功！' }),
      })
    })

    await login(page)
    await page.getByRole('button', { name: '系统设置' }).click()

    await expectTemplateShell(page, '系统设置')
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
    await expect(page.getByRole('button', { name: '账号', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '账号安全' })).toBeVisible()
    await expect(page.getByText('头像上传兼容旧字段 avatar')).toBeVisible()

    await page.getByRole('button', { name: '修改密码' }).click()
    const dialog = await page.getByRole('dialog')
    await dialog.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('密码不能为空！')).toBeVisible()
    await page.getByLabel('新密码').fill('new-secret')
    await dialog.getByRole('button', { name: '确定' }).click()
    await expect(page.getByText('修改密码成功！')).toBeVisible()
    await expectTemplateShell(page, '系统设置')

    await page.getByLabel('选择头像文件').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('PNGDATA'),
    })
    await expect(page.getByText('上传头像成功！')).toBeVisible()
    await expect(page.getByTestId('account-avatar-image')).toHaveAttribute('src', /\/api\/users\/58\/avatar\?ts=/)
    await expectTemplateShell(page, '系统设置')
  })
})
