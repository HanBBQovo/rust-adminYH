import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listResourceSummaries, type ResourceSummary } from '@/api/registry'

const fetchMock = vi.fn()
const resourceRegistryFixture: ResourceSummary[] = [
  {
    key: 'orders',
    title: '订单管理',
    description: '承运单、货运信息、结算状态',
    count: 2,
    status: 'ready',
    apiPath: '/order/list',
    legacyPath: 'adminYh/src/views/orders',
    owner: '业务前台',
  },
  {
    key: 'receipts',
    title: '回单管理',
    description: '未回收、已回收、回单状态追踪',
    count: 2,
    status: 'ready',
    apiPath: '/receipt/list',
    legacyPath: 'adminYh/src/views/receipt',
    owner: '业务前台',
  },
  {
    key: 'companies',
    title: '公司档案',
    description: '承运公司与订单统计',
    count: 1,
    status: 'ready',
    apiPath: '/company/list',
    legacyPath: 'adminYh/src/views/company',
    owner: '基础资料',
  },
  {
    key: 'users',
    title: '用户管理',
    description: '账号、角色、启停状态',
    count: 1,
    status: 'ready',
    apiPath: '/users/list',
    legacyPath: 'adminYh/src/views/user',
    owner: '系统设置',
  },
  {
    key: 'roles',
    title: '角色权限',
    description: '角色、菜单授权、权限树',
    count: 2,
    status: 'ready',
    apiPath: '/role/list',
    legacyPath: 'adminYh/src/views/role',
    owner: '系统设置',
  },
  {
    key: 'menus',
    title: '菜单资源',
    description: '侧边栏、路由、权限节点',
    count: 6,
    status: 'ready',
    apiPath: '/menu/tree',
    legacyPath: 'adminYh/src/router',
    owner: '系统设置',
  },
]

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('resource registry', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks implemented primary modules as ready', () => {
    const readyKeys = ['orders', 'receipts', 'companies', 'users', 'roles', 'menus']

    for (const key of readyKeys) {
      expect(resourceRegistryFixture.find((resource) => resource.key === key)?.status).toBe('ready')
    }
  })

  it('always loads production registry data through the shared API client', async () => {
    vi.stubEnv('VITE_USE_MOCKS', '1')
    fetchMock.mockImplementationOnce(() => jsonResponse([resourceRegistryFixture[0]]))

    await expect(listResourceSummaries()).resolves.toEqual([resourceRegistryFixture[0]])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/resources')
  })
})
