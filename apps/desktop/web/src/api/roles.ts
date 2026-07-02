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

export interface LegacyMenuNode {
  id: number
  name: string
  type: number
  url?: string | null
  icon?: string | null
  sort: number
  parentId?: number | null
  partentId?: number | null
  children?: LegacyMenuNode[] | null
  chilren?: LegacyMenuNode[] | null
}

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
  const { rows } = await listRoles({ page: 1, pageSize: 100 })
  return rows.filter((role) => role.id === 1 || role.id === 2)
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

export async function listMenuTree(): Promise<LegacyMenuNode[]> {
  return apiRequest<LegacyMenuNode[]>('/menu/tree')
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
