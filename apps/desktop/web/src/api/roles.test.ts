import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assignRoleMenus,
  buildRoleListPayload,
  createRole,
  deleteRole,
  getRole,
  getRoleMenuIds,
  listAssignableRoles,
  listMenuTree,
  listRoles,
  updateRole,
} from '@/api/roles'

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

  it('returns every assignable role from the old role list route', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 3,
        list: ROLE_ROWS,
      }),
    )

    await expect(listAssignableRoles()).resolves.toEqual(ROLE_ROWS)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/role/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 0, size: 100 }),
      }),
    )
  })

  it('loads every assignable role across old paginated role responses', async () => {
    const firstPageRoles = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `角色 ${index + 1}`,
      intro: '分页权限',
      createAt: '2026-01-01T00:00:00Z',
      updateAt: '2026-01-01T00:00:00Z',
    }))
    const overflowRole = {
      id: 101,
      name: '仓库主管',
      intro: '仓库权限',
      createAt: '2026-01-04T00:00:00Z',
      updateAt: '2026-01-04T00:00:00Z',
    }

    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse({
          totalCount: 101,
          list: firstPageRoles,
        }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          totalCount: 101,
          list: [overflowRole],
        }),
      )

    await expect(listAssignableRoles()).resolves.toEqual([...firstPageRoles, overflowRole])
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/role/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 100, size: 100 }),
      }),
    )
  })

  it('wraps role detail, mutations, menu tree, menu ids, and assign routes', async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse(ROLE_ROWS[0]))
      .mockImplementationOnce(() => jsonResponse(null))
      .mockImplementationOnce(() => jsonResponse(null))
      .mockImplementationOnce(() => jsonResponse(null))
      .mockImplementationOnce(() => jsonResponse([
        {
          id: 1,
          name: '系统管理',
          type: 1,
          sort: 1,
          chilren: [{ id: 11, name: '角色管理', type: 2, sort: 1, partentId: 1 }],
        },
      ]))
      .mockImplementationOnce(() => jsonResponse({ id: 1, name: '超级管理员', intro: '所有权限', menuIds: [1, 11] }))
      .mockImplementationOnce(() => jsonResponse(null))
      .mockImplementationOnce(() => jsonResponse(null))

    await expect(getRole(1)).resolves.toEqual(ROLE_ROWS[0])
    await expect(createRole({ name: '财务', intro: '部分权限' })).resolves.toBeUndefined()
    await expect(updateRole(3, { name: '财务主管', intro: '所有权限' })).resolves.toBeUndefined()
    await expect(deleteRole(3)).resolves.toBeUndefined()
    await expect(listMenuTree()).resolves.toEqual([
      {
        id: 1,
        name: '系统管理',
        type: 1,
        sort: 1,
        chilren: [{ id: 11, name: '角色管理', type: 2, sort: 1, partentId: 1 }],
      },
    ])
    await expect(getRoleMenuIds(1)).resolves.toEqual({ id: 1, name: '超级管理员', intro: '所有权限', menuIds: [1, 11] })
    await expect(assignRoleMenus({ roleId: 1, menuList: [1, 11, 11] })).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/role/1', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/role',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '财务', intro: '部分权限' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/role/3',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: '财务主管', intro: '所有权限' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/role/3', expect.objectContaining({ method: 'DELETE' }))
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/menu/tree', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/role/1/menuIds', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      '/api/role/assign',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ roleId: 1, menuList: [1, 11, 11] }) }),
    )
  })
})
