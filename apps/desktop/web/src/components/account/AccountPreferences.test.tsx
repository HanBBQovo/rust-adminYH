import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountPreferences } from '@/components/account/AccountPreferences'
import { ThemeProvider } from '@/components/theme'
import { GlobalToastContext } from '@/components/ui/global-toast-context'

const updateUserPasswordMock = vi.hoisted(() => vi.fn())
const uploadCurrentUserAvatarMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/users')>()
  return {
    ...actual,
    updateUserPassword: updateUserPasswordMock,
    uploadCurrentUserAvatar: uploadCurrentUserAvatarMock,
  }
})

const SESSION_USER = {
  id: 58,
  name: 'admin',
  avatarUrl: '/users/58/avatar',
  roles: ['1'],
}

function renderAccountPreferences(options?: { showToast?: ReturnType<typeof vi.fn>; onAvatarUploaded?: ReturnType<typeof vi.fn> }) {
  const showToast = options?.showToast || vi.fn()
  const onAvatarUploaded = options?.onAvatarUploaded || vi.fn()
  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <AccountPreferences user={SESSION_USER} onAvatarUploaded={onAvatarUploaded} />
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )
  return { showToast, onAvatarUploaded }
}

describe('AccountPreferences', () => {
  beforeEach(() => {
    updateUserPasswordMock.mockReset()
    uploadCurrentUserAvatarMock.mockReset()
    updateUserPasswordMock.mockResolvedValue(undefined)
    uploadCurrentUserAvatarMock.mockResolvedValue({ uploadedAt: 1700000000000 })
  })

  it('renders current account and avatar with cache busting', () => {
    renderAccountPreferences()

    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('账号 ID：58')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('updates the current user password through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderAccountPreferences()

    await user.click(screen.getByRole('button', { name: '修改密码' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '确定' }))
    expect(await screen.findByText('密码不能为空！')).toBeInTheDocument()
    await user.type(screen.getByLabelText('新密码'), 'new-secret')
    await user.click(within(dialog).getByRole('button', { name: '确定' }))

    await waitFor(() => {
      expect(updateUserPasswordMock).toHaveBeenCalledWith(58, { password: 'new-secret' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '修改密码成功！', { translate: false })
  })

  it('validates avatar type and size before upload', async () => {
    const { showToast } = renderAccountPreferences()
    const fileInput = screen.getByLabelText('选择头像文件')

    fireEvent.change(fileInput, {
      target: { files: [new File(['bad'], 'avatar.gif', { type: 'image/gif' })] },
    })
    await waitFor(() => {
      expect(uploadCurrentUserAvatarMock).not.toHaveBeenCalled()
      expect(showToast).toHaveBeenCalledWith('error', '只能上传 jpg/png 文件！', { translate: false })
    })
    showToast.mockClear()

    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array(501 * 1024)], 'avatar.png', { type: 'image/png' })] },
    })
    expect(uploadCurrentUserAvatarMock).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('error', '头像不能超过 500kb！', { translate: false })
  })

  it('uploads avatar with the old avatar field and refreshes the preview', async () => {
    const user = userEvent.setup()
    const { showToast, onAvatarUploaded } = renderAccountPreferences()
    const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })

    await user.upload(screen.getByLabelText('选择头像文件'), file)

    await waitFor(() => {
      expect(uploadCurrentUserAvatarMock).toHaveBeenCalledWith(file)
    })
    expect(onAvatarUploaded).toHaveBeenCalledWith(1700000000000)
    expect(showToast).toHaveBeenCalledWith('success', '上传头像成功！', { translate: false })
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
