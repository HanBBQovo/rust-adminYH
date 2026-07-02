import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiRequest, clearAuthToken, getAuthToken, setAuthToken } from '@/api/client'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest', () => {
  it('unwraps legacy response envelopes', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { id: 7, name: 'admin' }, message: 'success' }),
    })

    await expect(apiRequest<{ id: number; name: string }>('/users/me')).resolves.toEqual({
      id: 7,
      name: 'admin',
    })
  })

  it('injects bearer token and request id headers through the shared client', async () => {
    setAuthToken('token-123')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { ok: true } }),
    })

    await apiRequest('/health')

    const [, request] = fetchMock.mock.calls[0]
    expect(request.headers.authorization).toBe('Bearer token-123')
    expect(request.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-z0-9]+-[a-z0-9]+$/,
    )
  })

  it('does not force JSON content-type for multipart form uploads', async () => {
    const form = new FormData()
    form.append('avatar', new Blob(['PNGDATA'], { type: 'image/png' }), 'avatar.png')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: null, message: '上传头像成功！' }),
    })

    await apiRequest('/upload/avatar', { method: 'POST', body: form })

    const [, request] = fetchMock.mock.calls[0]
    expect(request.body).toBe(form)
    expect(request.headers['content-type']).toBeUndefined()
    expect(request.headers['x-request-id']).toBeTruthy()
  })

  it('throws ApiError for legacy business errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: -200, message: '无效的token或登录已失效！请重新登录~' }),
    })

    await expect(apiRequest('/users/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      code: -200,
      message: '无效的token或登录已失效！请重新登录~',
    } satisfies Partial<ApiError>)
  })
})

describe('auth token storage', () => {
  it('keeps token access centralized in api client', () => {
    expect(getAuthToken()).toBe('')

    setAuthToken('abc')
    expect(getAuthToken()).toBe('abc')

    clearAuthToken()
    expect(getAuthToken()).toBe('')
  })
})
