import { expect, test } from '@playwright/test'

test('renders the login shell from the frontend template', async ({ page }) => {
  await page.route('**/api/users/me', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ code: -200, message: '无效的token或登录已失效！请重新登录~' }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: '宇涵物流管理系统' })).toBeVisible()
  await expect(page.getByLabel('账号')).toBeVisible()
  await expect(page.getByLabel('密码')).toBeVisible()
  await expect(page.getByRole('button', { name: /登录/ })).toBeDisabled()
})
