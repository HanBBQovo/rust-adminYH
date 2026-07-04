import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appPreferencesStorageKey } from '@/api/settings'
import { ConfirmDialogContext } from '@/components/ui/confirm-dialog-context'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import Settings from '@/pages/Settings'
import type { SessionUser } from '@/session/types'

const user: SessionUser = {
  id: 58,
  name: 'admin',
  roles: ['1'],
  roleIds: [1],
}

function renderSettings(options?: { confirm?: () => Promise<boolean>; showToast?: ReturnType<typeof vi.fn> }) {
  const confirm = options?.confirm || vi.fn().mockResolvedValue(true)
  const showToast = options?.showToast || vi.fn()
  render(
    <GlobalToastContext.Provider value={{ showToast }}>
      <ConfirmDialogContext.Provider value={{ confirm }}>
        <Settings user={user} />
      </ConfirmDialogContext.Provider>
    </GlobalToastContext.Provider>,
  )
  return { confirm, showToast }
}

describe('Settings page preferences', () => {
  it('loads saved preferences through the settings api wrapper', async () => {
    window.localStorage.setItem(
      appPreferencesStorageKey(),
      JSON.stringify({
        siteName: '迁移后台',
        contact: 'ops@example.com',
        owner: 'support',
        features: ['webhook'],
        compactMode: true,
        animations: false,
      }),
    )

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '通用' }))

    await expect(screen.findByDisplayValue('迁移后台')).resolves.toBeVisible()
    expect(screen.getByDisplayValue('ops@example.com')).toBeVisible()
    expect(screen.getByText('客服团队')).toBeVisible()
    expect(screen.getByText('Webhook')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /紧凑模式/ })).toBeChecked()
      expect(screen.getByRole('switch', { name: /页面动效/ })).not.toBeChecked()
    })
  })

  it('saves current preferences only after confirmation', async () => {
    const { confirm, showToast } = renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '通用' }))
    const siteName = await screen.findByDisplayValue('宇涵物流订单系统')
    const contact = screen.getByLabelText('联系邮箱')

    fireEvent.change(siteName, { target: { value: '重构后台' } })
    fireEvent.change(contact, { target: { value: 'support@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '保存系统偏好',
          confirmText: '保存',
        }),
      )
    })
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('success', '系统偏好已保存', { translate: false })
    })
    expect(JSON.parse(window.localStorage.getItem(appPreferencesStorageKey()) || '{}')).toEqual(
      expect.objectContaining({
        siteName: '重构后台',
        contact: 'support@example.com',
        owner: 'ops',
        features: ['audit-log', 'export'],
      }),
    )
  })

  it('does not persist preferences when confirmation is cancelled', async () => {
    const { showToast } = renderSettings({ confirm: vi.fn().mockResolvedValue(false) })
    fireEvent.click(screen.getByRole('button', { name: '通用' }))
    fireEvent.change(await screen.findByDisplayValue('宇涵物流订单系统'), { target: { value: '不要保存' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(showToast).not.toHaveBeenCalled()
    })
    expect(window.localStorage.getItem(appPreferencesStorageKey())).toBeNull()
  })

  it('resets only appearance preferences through the settings wrapper', async () => {
    window.localStorage.setItem(
      appPreferencesStorageKey(),
      JSON.stringify({
        siteName: '运营后台',
        contact: 'support@example.com',
        owner: 'growth',
        features: ['beta-panel'],
        compactMode: true,
        animations: false,
      }),
    )
    const { confirm, showToast } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '外观' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /紧凑模式/ })).toBeChecked()
      expect(screen.getByRole('switch', { name: /页面动效/ })).not.toBeChecked()
    })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '恢复默认外观', variant: 'destructive' }))
      expect(showToast).toHaveBeenCalledWith('success', '外观偏好已恢复默认', { translate: false })
    })
    expect(JSON.parse(window.localStorage.getItem(appPreferencesStorageKey()) || '{}')).toEqual(
      expect.objectContaining({
        siteName: '运营后台',
        contact: 'support@example.com',
        owner: 'growth',
        features: ['beta-panel'],
        compactMode: false,
        animations: true,
      }),
    )
  })
})
