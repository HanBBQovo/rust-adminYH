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
