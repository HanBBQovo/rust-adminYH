import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { nsKey } from '@/config'
import Login from '@/pages/Login'
import type { AdminSession } from '@/session/types'

const loginMock = vi.hoisted(() => vi.fn())
const fetchCaptchaCodeMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/auth', () => ({
  fetchCaptchaCode: fetchCaptchaCodeMock,
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
    fetchCaptchaCodeMock.mockReset()
    fetchCaptchaCodeMock.mockResolvedValue('<svg>ABCD</svg>')
  })

  it('loads and refreshes the legacy captcha image through the auth API wrapper', async () => {
    const user = userEvent.setup()

    renderLogin()

    expect(await screen.findByAltText('验证码')).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/svg+xml;charset=UTF-8,'),
    )
    expect(fetchCaptchaCodeMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '刷新验证码' }))

    expect(fetchCaptchaCodeMock).toHaveBeenCalledTimes(2)
  })

  it('submits credentials and optional captcha code through the auth API wrapper', async () => {
    const user = userEvent.setup()
    const onAuthenticated = vi.fn()
    loginMock.mockResolvedValueOnce(TEST_SESSION)

    renderLogin(onAuthenticated)

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.type(screen.getByLabelText('验证码'), ' A1B2 ')
    await user.click(screen.getByRole('button', { name: /登录/ }))

    expect(loginMock).toHaveBeenCalledWith({ name: 'admin', password: 'secret', code: 'A1B2' })
    expect(onAuthenticated).toHaveBeenCalledWith(TEST_SESSION)
  })

  it('does not require the captcha code to submit the legacy login form', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValueOnce(TEST_SESSION)

    renderLogin()

    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /登录/ }))

    expect(loginMock).toHaveBeenCalledWith({ name: 'admin', password: 'secret' })
  })

  it('prefills the remembered account name without restoring any password', async () => {
    window.localStorage.setItem(nsKey('remembered-login-name'), 'admin')

    renderLogin()

    expect(await screen.findByAltText('验证码')).toBeInTheDocument()
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

  it('shows a non-blocking captcha load error', async () => {
    const user = userEvent.setup()
    fetchCaptchaCodeMock.mockRejectedValueOnce(new Error('network'))
    loginMock.mockResolvedValueOnce(TEST_SESSION)

    renderLogin()

    expect(await screen.findByText('验证码加载失败，可直接登录或稍后刷新')).toBeInTheDocument()
    await user.type(screen.getByLabelText('账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')

    const submit = screen.getByRole('button', { name: /登录/ })
    expect(submit).toBeEnabled()

    await user.click(submit)
    expect(loginMock).toHaveBeenCalledWith({ name: 'admin', password: 'secret' })
  })
})
