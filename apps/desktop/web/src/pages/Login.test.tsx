import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import Login from '@/pages/Login'
import type { AdminSession } from '@/session/types'

const loginMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/auth', () => ({
  loginSession: loginMock,
}))

const TEST_SESSION: AdminSession = {
  token: 'token-123',
  user: { id: 58, name: 'admin', roles: [] },
  menus: [],
}

function renderLogin(onAuthenticated = vi.fn<(session: AdminSession) => void>()) {
  render(
    <ThemeProvider>
      <Login onAuthenticated={onAuthenticated} />
    </ThemeProvider>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it('submits credentials through the auth API wrapper', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    loginMock.mockResolvedValueOnce(TEST_SESSION)

    renderLogin(onAuthenticated)

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /登录/ }))

    expect(loginMock).toHaveBeenCalledWith({ name: 'admin', password: 'secret' })
    expect(onAuthenticated).toHaveBeenCalledWith(TEST_SESSION)
  })

  it('keeps submit disabled until account and password are filled', async () => {
    const user = userEvent.setup()
    renderLogin()

    const submit = screen.getByRole('button', { name: /登录/ })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('账号'), 'admin')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('密码'), 'secret')
    expect(submit).toBeEnabled()
  })

  it('renders API errors without writing password anywhere else', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValueOnce(new Error('密码错误，请重新输入密码尝试登录！'))

    renderLogin()

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'wrong')
    await user.click(screen.getByRole('button', { name: /登录/ }))

    expect(await screen.findByText('密码错误，请重新输入密码尝试登录！')).toBeInTheDocument()
    expect(window.localStorage.length).toBe(0)
  })
})
