import { apiRequest, resolveAssetUrl } from '@/api/client'

export interface LegacyUserListItem {
  id: number
  name: string
  avatarUrl: string
  enable: number
  roleId: number
  createAt: string
  updateAt: string
}

export interface LegacyUserRole {
  id: number
  name: string
  intro: string
  createAt: string
  updateAt: string
}

export interface LegacyUserDetail {
  id: number
  name: string
  avatarUrl: string
  enable: number
  createAt: string
  updateAt: string
  role: LegacyUserRole
}

export interface UserListFilters {
  name?: string
  roleId?: number
  enable?: number
  createAt?: [string, string]
}

export interface UserListParams extends UserListFilters {
  page: number
  pageSize: number
}

export interface LegacyUserListResponse {
  list: LegacyUserListItem[]
  totalCount: number
}

export interface UserListResult {
  rows: LegacyUserListItem[]
  total: number
}

export interface UserCreatePayload {
  name: string
  password: string
  roleId: number
}

export interface UserUpdatePayload {
  name: string
  roleId: number
}

export interface UserPasswordPayload {
  password: string
}

export interface AvatarUploadResult {
  uploadedAt: number
}

function cleanFilters(filters: UserListFilters): UserListFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (Array.isArray(value)) return value.some(Boolean)
      return value !== undefined && value !== null && String(value).trim() !== ''
    }),
  ) as UserListFilters
}

export function buildUserListPayload(params: UserListParams) {
  const page = Math.max(params.page, 1)
  const pageSize = Math.max(params.pageSize, 1)

  return {
    offset: (page - 1) * pageSize,
    size: pageSize,
    ...cleanFilters({
      name: params.name,
      roleId: params.roleId,
      enable: params.enable,
      createAt: params.createAt,
    }),
  }
}

export async function listUsers(params: UserListParams): Promise<UserListResult> {
  const data = await apiRequest<LegacyUserListResponse>('/users/list', {
    method: 'POST',
    body: JSON.stringify(buildUserListPayload(params)),
  })

  return {
    rows: data.list,
    total: data.totalCount,
  }
}

export async function getUser(userId: number): Promise<LegacyUserDetail | null> {
  return apiRequest<LegacyUserDetail | null>(`/users/${userId}`, {
    method: 'GET',
  })
}

export async function createUser(payload: UserCreatePayload): Promise<void> {
  await apiRequest<unknown>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateUser(userId: number, payload: UserUpdatePayload): Promise<void> {
  await apiRequest<unknown>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateUserPassword(userId: number, payload: UserPasswordPayload): Promise<void> {
  await apiRequest<unknown>(`/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteUser(userId: number): Promise<void> {
  await apiRequest<unknown>(`/users/${userId}`, {
    method: 'DELETE',
  })
}

export async function uploadCurrentUserAvatar(file: File): Promise<AvatarUploadResult> {
  const form = new FormData()
  form.append('avatar', file)
  await apiRequest<unknown>('/upload/avatar', {
    method: 'POST',
    body: form,
  })
  return { uploadedAt: Date.now() }
}

export function currentUserAvatarUrl(userId: number, cacheBust?: number): string {
  const url = resolveAssetUrl(`/users/${userId}/avatar`)
  return cacheBust ? `${url}${url.includes('?') ? '&' : '?'}ts=${cacheBust}` : url
}
