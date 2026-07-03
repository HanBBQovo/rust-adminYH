import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCaptchaCode, loginSession, restoreSession } from '@/api/auth'
import { getAuthToken } from '@/api/client'
import { readStoredSession } from '@/session/session-store'

const fetchMock = vi.fn()

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth session API', () => {
  it('fetches the old data-only captcha SVG response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: '<svg>ABCD</svg>' }),
    })

    await expect(fetchCaptchaCode()).resolves.toBe('<svg>ABCD</svg>')
    expect(fetchMock).toHaveBeenCalledWith('/api/code', expect.any(Object))
  })

  it('logs in, stores the token, and returns a session', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: [] }),
      })

    const session = await loginSession({ name: 'admin', password: 'secret' })

    expect(session.user).toEqual({ id: 58, name: 'admin', avatarUrl: '/users/58/avatar', roles: ['1'], roleIds: [1] })
    expect(session.token).toBe('token-123')
    expect(getAuthToken()).toBe('token-123')
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/role/1/menu',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token-123' }),
      }),
    )
  })

  it('passes an optional legacy captcha code without changing the login flow', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: [] }),
      })

    await loginSession({ name: 'admin', password: 'secret', code: 'A1B2' })

    const loginInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/login', expect.any(Object))
    expect(JSON.parse(String(loginInit.body))).toEqual({ name: 'admin', password: 'secret', code: 'A1B2' })
  })

  it('restores current user with the stored token', async () => {
    const restoredMenus = [{ id: 2, name: '订单列表', url: '/main/order/orders' }]
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: restoredMenus }),
      })

    await loginSession({ name: 'admin', password: 'secret' })
    const restored = await restoreSession()

    expect(restored?.user.name).toBe('admin')
    expect(restored?.user.avatarUrl).toBe('/users/58/avatar')
    expect(restored?.user.roleIds).toEqual([1])
    expect(restored?.menus).toEqual(restoredMenus)
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/users/me', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/role/1/menu', expect.any(Object))
  })

  it('refreshes restored role menus instead of reusing stale cached menus', async () => {
    const staleMenus = [{ id: 1, name: '用户管理', url: '/main/system/users' }]
    const refreshedMenus = [{ id: 2, name: '菜单管理', url: '/main/system/menu' }]
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: staleMenus }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: refreshedMenus }),
      })

    await loginSession({ name: 'admin', password: 'secret' })
    const restored = await restoreSession()

    expect(restored?.menus).toEqual(refreshedMenus)
    expect(readStoredSession()?.menus).toEqual(refreshedMenus)
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/role/1/menu', expect.any(Object))
  })

  it('does not fall back to cached menus when restoring role menus fails', async () => {
    const staleMenus = [{ id: 1, name: '用户管理', url: '/main/system/users' }]
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: staleMenus }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: -400, message: '角色菜单加载失败' }),
      })

    await loginSession({ name: 'admin', password: 'secret' })
    const restored = await restoreSession()

    expect(restored?.menus).toEqual([])
    expect(readStoredSession()?.menus).toEqual([])
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/role/1/menu', expect.any(Object))
  })

  it('clears the session when restore fails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: -200, message: '无效的token或登录已失效！请重新登录~' }),
      })

    await loginSession({ name: 'admin', password: 'secret' })
    await expect(restoreSession()).resolves.toBeNull()
    expect(getAuthToken()).toBe('')
  })

  it('does not request role 1 menus when the current user has no explicit role id', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: [], roleIds: [] } }),
      })

    const session = await loginSession({ name: 'admin', password: 'secret' })

    expect(session.user.roleIds).toEqual([])
    expect(session.menus).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/role/1/menu', expect.any(Object))
  })
})
