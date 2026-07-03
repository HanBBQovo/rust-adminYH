import { apiRequest } from '@/api/client'

export interface LegacyRole {
  id: number
  name: string
  intro: string
  createAt: string
  updateAt: string
}

export interface RoleListParams {
  page: number
  pageSize: number
  name?: string
  intro?: string
  createAt?: [string, string]
}

export interface LegacyRoleListResponse {
  list: LegacyRole[]
  totalCount: number
}

export interface RoleListResult {
  rows: LegacyRole[]
  total: number
}

export interface RoleMutationPayload {
  name: string
  intro: string
}

export interface RoleAssignPayload {
  roleId: number
  menuList: number[]
}

export { listMenuTree, type LegacyMenuNode } from '@/api/menus'

export interface RoleMenuIdsResponse {
  id: number
  name: string
  intro: string
  menuIds: number[]
}

function cleanFilters(filters: Pick<RoleListParams, 'name' | 'intro' | 'createAt'>) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (Array.isArray(value)) return value.some(Boolean)
      return String(value ?? '').trim() !== ''
    }),
  )
}

export function buildRoleListPayload(params: RoleListParams) {
  const page = Math.max(params.page, 1)
  const pageSize = Math.max(params.pageSize, 1)

  return {
    offset: (page - 1) * pageSize,
    size: pageSize,
    ...cleanFilters({
      name: params.name,
      intro: params.intro,
      createAt: params.createAt,
    }),
  }
}

export async function listRoles(params: RoleListParams): Promise<RoleListResult> {
  const data = await apiRequest<LegacyRoleListResponse>('/role/list', {
    method: 'POST',
    body: JSON.stringify(buildRoleListPayload(params)),
  })

  return {
    rows: data.list,
    total: data.totalCount,
  }
}

export async function listAssignableRoles(): Promise<LegacyRole[]> {
  const pageSize = 100
  const firstPage = await listRoles({ page: 1, pageSize })
  const roles = [...firstPage.rows]

  for (let page = 2; roles.length < firstPage.total; page += 1) {
    const nextPage = await listRoles({ page, pageSize })
    if (!nextPage.rows.length) break
    roles.push(...nextPage.rows)
  }

  return roles
}

export async function getRole(roleId: number): Promise<LegacyRole | null> {
  return apiRequest<LegacyRole | null>(`/role/${roleId}`)
}

export async function createRole(payload: RoleMutationPayload): Promise<void> {
  await apiRequest('/role', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateRole(roleId: number, payload: RoleMutationPayload): Promise<void> {
  await apiRequest(`/role/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteRole(roleId: number): Promise<void> {
  await apiRequest(`/role/${roleId}`, {
    method: 'DELETE',
  })
}

export async function getRoleMenuIds(roleId: number): Promise<RoleMenuIdsResponse> {
  return apiRequest<RoleMenuIdsResponse>(`/role/${roleId}/menuIds`)
}

export async function assignRoleMenus(payload: RoleAssignPayload): Promise<void> {
  await apiRequest('/role/assign', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
