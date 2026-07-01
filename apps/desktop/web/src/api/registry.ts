import { apiRequest } from '@/api/client'

export type ResourceKey = 'orders' | 'receipts' | 'companies' | 'users' | 'roles'

export interface ResourceSummary {
  key: ResourceKey
  title: string
  description: string
  count: number
  status: 'ready' | 'building' | 'blocked'
  apiPath: string
  legacyPath: string
  owner: string
}

export const RESOURCE_REGISTRY: ResourceSummary[] = [
  {
    key: 'orders',
    title: '运单管理',
    description: '承接旧 order_list、company_order，并保留订单导出字段。',
    count: 1268,
    status: 'building',
    apiPath: '/order/list',
    legacyPath: 'src/views/main/order/order',
    owner: '运营',
  },
  {
    key: 'receipts',
    title: '回单管理',
    description: '覆盖全部回单、未回收、已回收与状态流转。',
    count: 341,
    status: 'building',
    apiPath: '/receipt/list',
    legacyPath: 'src/views/main/receipt/*',
    owner: '客服',
  },
  {
    key: 'companies',
    title: '发货公司',
    description: '维护发货公司字典，并支持公司维度统计。',
    count: 58,
    status: 'ready',
    apiPath: '/company/list',
    legacyPath: 'src/views/main/order/company',
    owner: '运营',
  },
  {
    key: 'users',
    title: '用户管理',
    description: '用户 CRUD、头像和密码修改，兼容旧 MD5 登录升级。',
    count: 16,
    status: 'building',
    apiPath: '/users/list',
    legacyPath: 'src/views/main/system/user',
    owner: '管理员',
  },
  {
    key: 'roles',
    title: '角色权限',
    description: '角色、菜单树和 role_permission 关系维护。',
    count: 5,
    status: 'blocked',
    apiPath: '/role/list',
    legacyPath: 'src/views/main/system/role',
    owner: '管理员',
  },
]

export async function listResourceSummaries(): Promise<ResourceSummary[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== '0') {
    return new Promise((resolve) => window.setTimeout(() => resolve(RESOURCE_REGISTRY), 220))
  }
  return apiRequest<ResourceSummary[]>('/admin/resources')
}
