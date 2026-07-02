import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildUserListPayload,
  createUser,
  currentUserAvatarUrl,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  updateUserPassword,
  uploadCurrentUserAvatar,
} from '@/api/users'

const fetchMock = vi.fn()

const USER_ROW = {
  id: 58,
  name: 'admin',
  avatarUrl: 'http://127.0.0.1:8000/users/58/avatar',
  enable: 1,
  roleId: 1,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
}

const USER_DETAIL = {
  id: 58,
  name: 'admin',
  avatarUrl: 'http://127.0.0.1:8000/users/58/avatar',
  enable: 1,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
  role: {
    id: 1,
    name: '超级管理员',
    intro: '所有权限',
    createAt: '2026-01-01T00:00:00Z',
    updateAt: '2026-01-01T00:00:00Z',
  },
}

function jsonResponse(data: unknown, code = 0, message = 'ok') {
  return Promise.resolve(
    new Response(JSON.stringify({ code, data, message }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('users api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds old users list paging and filter payload', () => {
    expect(
      buildUserListPayload({
        page: 2,
        pageSize: 20,
        name: 'admin',
        roleId: 1,
        enable: 0,
        createAt: ['2026-01-01', '2026-01-31'],
      }),
    ).toEqual({
      offset: 20,
      size: 20,
      name: 'admin',
      roleId: 1,
      enable: 0,
      createAt: ['2026-01-01', '2026-01-31'],
    })
  })

  it('posts to the old users list route and normalizes totalCount', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 1,
        list: [USER_ROW],
      }),
    )

    await expect(listUsers({ page: 1, pageSize: 10, name: 'admin' })).resolves.toEqual({
      rows: [USER_ROW],
      total: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 0, size: 10, name: 'admin' }),
      }),
    )
  })

  it('wraps old user detail, mutation, password, and delete routes', async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse(USER_DETAIL))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))

    await expect(getUser(58)).resolves.toEqual(USER_DETAIL)
    await expect(createUser({ name: 'new_user', password: 'secret2', roleId: 2 })).resolves.toBeUndefined()
    await expect(updateUser(60, { name: 'renamed', roleId: 1 })).resolves.toBeUndefined()
    await expect(updateUserPassword(60, { password: 'new-secret' })).resolves.toBeUndefined()
    await expect(deleteUser(60)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/users/58', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/users',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'new_user', password: 'secret2', roleId: 2 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/users/60',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'renamed', roleId: 1 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/users/60/password',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ password: 'new-secret' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/users/60', expect.objectContaining({ method: 'DELETE' }))
  })

  it('rejects protected user delete when the old envelope returns code -200', async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse(null, -200, '删除用户失败！'))

    await expect(deleteUser(58)).rejects.toThrow('删除用户失败！')
  })

  it('uploads current user avatar with multipart form data and resolves avatar URLs', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    fetchMock.mockImplementationOnce(() => jsonResponse(null))
    const file = new File(['PNGDATA'], 'avatar.png', { type: 'image/png' })

    await expect(uploadCurrentUserAvatar(file)).resolves.toEqual({ uploadedAt: 1700000000000 })
    expect(currentUserAvatarUrl(58, 1700000000000)).toBe('/api/users/58/avatar?ts=1700000000000')
    const [, request] = fetchMock.mock.calls[0]
    expect(fetchMock).toHaveBeenCalledWith('/api/upload/avatar', expect.objectContaining({ method: 'POST' }))
    expect(request.body).toBeInstanceOf(FormData)
    expect((request.body as FormData).get('avatar')).toBe(file)
    nowSpy.mockRestore()
  })
})
