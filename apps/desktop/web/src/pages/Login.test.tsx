import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { nsKey } from '@/config'
import Login from '@/pages/Login'
import type { AdminSession } from '@/session/types'

const loginMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/auth', () => ({
  loginSession: loginMock,
}))

const TEST_SESSION: AdminSession = {
  token: 'token-123',
  user: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] },
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
    window.localStorage.clear()
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

  it('prefills the remembered account name without restoring any password', async () => {
    window.localStorage.setItem(nsKey('remembered-login-name'), 'admin')

    renderLogin()

    expect(screen.getByLabelText('账号')).toHaveValue('admin')
    expect(screen.getByLabelText('密码')).toHaveValue('')
    expect(screen.getByLabelText('记住账号')).toBeChecked()
  })

  it('remembers only the account name after a successful login', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValueOnce(TEST_SESSION)

    renderLogin()

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByLabelText('记住账号'))
    await user.click(screen.getByRole('button', { name: /登录/ }))

    expect(window.localStorage.getItem(nsKey('remembered-login-name'))).toBe('admin')
    expect(window.localStorage.getItem('password')).toBeNull()
    expect(window.localStorage.getItem(nsKey('password'))).toBeNull()
  })

  it('does not persist any password-like key after a successful login', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValueOnce(TEST_SESSION)

    renderLogin()

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByLabelText('记住账号'))
    await user.click(screen.getByRole('button', { name: /登录/ }))

    const storedKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index) || '')
    expect(storedKeys).toEqual([nsKey('remembered-login-name')])
    expect(storedKeys.some((key) => key.toLowerCase().includes('password'))).toBe(false)
  })

  it('clears the remembered account when the user opts out', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValueOnce(TEST_SESSION)
    window.localStorage.setItem(nsKey('remembered-login-name'), 'admin')

    renderLogin()

    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByLabelText('记住账号'))
    await user.click(screen.getByRole('button', { name: /登录/ }))

    expect(window.localStorage.getItem(nsKey('remembered-login-name'))).toBeNull()
  })

  it('keeps the login button disabled while submit is pending', async () => {
    const user = userEvent.setup()
    let resolveLogin!: (session: AdminSession) => void
    loginMock.mockReturnValueOnce(new Promise<AdminSession>((resolve) => {
      resolveLogin = resolve
    }))

    renderLogin()

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    const submit = screen.getByRole('button', { name: /登录/ })
    await user.click(submit)

    expect(submit).toBeDisabled()
    expect(loginMock).toHaveBeenCalledTimes(1)

    resolveLogin(TEST_SESSION)
    await screen.findByLabelText('账号')
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
