import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildMenuCreatePayload,
  createMenu,
  flattenMenuTree,
  listMenuTree,
  normalizeMenuTree,
} from '@/api/menus'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('menus api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds the old create menu payload with numeric type, sort, and parentId', () => {
    expect(
      buildMenuCreatePayload({
        name: ' 菜单管理 ',
        type: '2',
        sort: '8',
        url: ' /main/system/menu ',
        icon: ' ListTree ',
        parentId: '3',
      }),
    ).toEqual({
      name: '菜单管理',
      type: 2,
      sort: 8,
      url: '/main/system/menu',
      icon: 'ListTree',
      parentId: 3,
    })

    expect(
      buildMenuCreatePayload({
        name: '系统管理',
        type: '1',
        sort: '3',
        url: '',
        icon: '',
        parentId: '',
      }),
    ).toEqual({
      name: '系统管理',
      type: 1,
      sort: 3,
      parentId: null,
    })
  })

  it('normalizes standard children and old chilren spelling into a sorted tree', () => {
    const normalized = normalizeMenuTree([
      {
        id: 2,
        name: '系统管理',
        type: 1,
        sort: 2,
        chilren: [
          { id: 22, name: '菜单管理', type: 2, sort: 2, partentId: 2 },
          { id: 21, name: '角色管理', type: 2, sort: 1, parentId: 2 },
        ],
      },
      {
        id: 1,
        name: '工作台',
        type: 1,
        sort: 1,
        children: [{ id: 11, name: '核心统计', type: 2, sort: 1, parentId: 1 }],
      },
    ])

    expect(normalized.map((node) => node.name)).toEqual(['工作台', '系统管理'])
    expect(normalized[1].children.map((node) => node.name)).toEqual(['角色管理', '菜单管理'])
    expect(normalized[1].children[0].parentId).toBe(2)
    expect(normalized[1].children[1].parentId).toBe(2)
    expect(flattenMenuTree(normalized).map((node) => [node.name, node.depth])).toEqual([
      ['工作台', 0],
      ['核心统计', 1],
      ['系统管理', 0],
      ['角色管理', 1],
      ['菜单管理', 1],
    ])
  })

  it('wraps menu tree and create routes through the shared API client', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse([
          {
            id: 1,
            name: '系统管理',
            type: 1,
            sort: 1,
            chilren: [{ id: 11, name: '菜单管理', type: 2, sort: 1, partentId: 1 }],
          },
        ]),
      )
      .mockImplementationOnce(() => jsonResponse(null))

    await expect(listMenuTree()).resolves.toEqual([
      {
        id: 1,
        name: '系统管理',
        type: 1,
        sort: 1,
        chilren: [{ id: 11, name: '菜单管理', type: 2, sort: 1, partentId: 1 }],
      },
    ])
    await expect(
      createMenu({ name: '菜单管理', type: 2, sort: 1, url: '/main/system/menu', parentId: 1 }),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/menu/tree', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/menu',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: '菜单管理', type: 2, sort: 1, url: '/main/system/menu', parentId: 1 }),
      }),
    )
  })
})
