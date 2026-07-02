import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loginSession, restoreSession } from '@/api/auth'
import { getAuthToken } from '@/api/client'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('auth session API', () => {
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
        json: async () => ({ code: 0, data: [] }),
      })

    const session = await loginSession({ name: 'admin', password: 'secret' })

    expect(session.user).toEqual({ id: 58, name: 'admin', avatarUrl: '/users/58/avatar', roles: [] })
    expect(session.token).toBe('token-123')
    expect(getAuthToken()).toBe('token-123')
  })

  it('restores current user with the stored token', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', token: 'token-123' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { id: 58, name: 'admin', roles: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: [] }),
      })

    await loginSession({ name: 'admin', password: 'secret' })
    const restored = await restoreSession()

    expect(restored?.user.name).toBe('admin')
    expect(restored?.user.avatarUrl).toBe('/users/58/avatar')
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/users/me', expect.any(Object))
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
})
