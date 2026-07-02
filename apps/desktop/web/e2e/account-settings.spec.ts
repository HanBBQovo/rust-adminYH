import { expect, test, type Page } from '@playwright/test'
import { Buffer } from 'node:buffer'

import { e2eToken, expectTemplateShell, loginAsAdmin, mockAdminSession } from './support/admin-session'

async function mockAvatarRoute(page: Page) {
  await page.route('**/api/users/58/avatar**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lSGkcwAAAABJRU5ErkJggg==',
        'base64',
      ),
    })
  })
}

const settingsNavItems = ['工作台', '系统设置']

test.describe('account settings E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvatarRoute(page)
    await mockAdminSession(page, {
      currentUser: { avatarUrl: '/users/58/avatar' },
      menus: [
        { id: 1, name: '工作台', url: '/main/workbench' },
        { id: 9, name: '系统设置', url: '/main/settings' },
      ],
    })
  })

  test('keeps the template shell while updating password and uploading avatar', async ({ page }) => {
    await page.route('**/api/users/58/password', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('PATCH')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
      expect(request.postDataJSON()).toEqual({ password: 'new-secret' })

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, data: true, message: '修改密码成功！' }),
      })
    })

    await page.route('**/api/upload/avatar', async (route) => {
      const request = route.request()
      expect(request.method()).toBe('POST')
      expect(request.headers().authorization).toBe(`Bearer ${e2eToken}`)
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

    await loginAsAdmin(page)
    await page.getByRole('button', { name: '系统设置' }).click()

    await expectTemplateShell(page, '系统设置', settingsNavItems, { headingRegion: 'banner' })
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
    await expectTemplateShell(page, '系统设置', settingsNavItems, { headingRegion: 'banner' })

    await page.getByLabel('选择头像文件').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('PNGDATA'),
    })
    await expect(page.getByText('上传头像成功！')).toBeVisible()
    await expect(page.getByTestId('account-avatar-image')).toHaveAttribute('src', /\/api\/users\/58\/avatar\?ts=/)
    await expectTemplateShell(page, '系统设置', settingsNavItems, { headingRegion: 'banner' })
  })
})
