import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildRoleListPayload, listAssignableRoles, listRoles } from '@/api/roles'

const fetchMock = vi.fn()

const ROLE_ROWS = [
  {
    id: 1,
    name: '超级管理员',
    intro: '所有权限',
    createAt: '2026-01-01T00:00:00Z',
    updateAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: '普通用户',
    intro: '部分权限',
    createAt: '2026-01-02T00:00:00Z',
    updateAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 3,
    name: '财务',
    intro: '部分权限',
    createAt: '2026-01-03T00:00:00Z',
    updateAt: '2026-01-03T00:00:00Z',
  },
]

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('roles api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds old role list paging and filter payload', () => {
    expect(
      buildRoleListPayload({
        page: 2,
        pageSize: 20,
        name: '超级',
        intro: '',
        createAt: ['2026-01-01', '2026-01-31'],
      }),
    ).toEqual({
      offset: 20,
      size: 20,
      name: '超级',
      createAt: ['2026-01-01', '2026-01-31'],
    })
  })

  it('posts to the old role list route and normalizes totalCount', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 2,
        list: ROLE_ROWS.slice(0, 2),
      }),
    )

    await expect(listRoles({ page: 1, pageSize: 10, name: '用户' })).resolves.toEqual({
      rows: ROLE_ROWS.slice(0, 2),
      total: 2,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/role/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 0, size: 10, name: '用户' }),
      }),
    )
  })

  it('limits assignable roles to the currently accepted user role ids', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 3,
        list: ROLE_ROWS,
      }),
    )

    await expect(listAssignableRoles()).resolves.toEqual(ROLE_ROWS.slice(0, 2))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/role/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 0, size: 100 }),
      }),
    )
  })
})
