import { apiRequest, setAuthToken } from '@/api/client'
import { clearSession, readStoredToken, saveSession } from '@/session/session-store'
import type { AdminSession, LegacyMenuItem, SessionUser } from '@/session/types'

/**
 * 鉴权相关接口。token 的存取与请求头注入都在 api/client 里,
 * 这里只负责登录 / 登出 / 状态查询三个动作。
 *
 * 模板假设后端是「单密码 + Bearer token」的最简方案,换成账号密码 /
 * OAuth 时只改这个文件,api/client 与页面层不用动。
 */

export interface LoginInput {
  name: string
  password: string
  code?: string
}

export interface CurrentUser {
  id: number
  name: string
  avatarUrl?: string
  roles: string[]
  roleIds?: number[]
}

interface LoginPayload {
  id: number
  name: string
  avatarUrl?: string
  token: string
  roles?: string[]
  roleIds?: number[]
}

function toSessionUser(user: CurrentUser | LoginPayload): SessionUser {
  const roleIds =
    'roleIds' in user && Array.isArray(user.roleIds)
      ? user.roleIds.filter((roleId) => Number.isFinite(roleId))
      : 'roles' in user && Array.isArray(user.roles)
        ? user.roles.map(Number).filter((roleId) => Number.isFinite(roleId))
        : []

  return {
    id: user.id,
    name: user.name,
    avatarUrl: 'avatarUrl' in user && typeof user.avatarUrl === 'string' ? user.avatarUrl : `/users/${user.id}/avatar`,
    roles: 'roles' in user && Array.isArray(user.roles) ? user.roles : [],
    roleIds,
  }
}

async function fetchMenus(user: SessionUser): Promise<LegacyMenuItem[]> {
  const roleId = user.roleIds[0]
  if (!roleId) return []

  try {
    return await apiRequest<LegacyMenuItem[]>(`/role/${roleId}/menu`)
  } catch {
    return []
  }
}

async function fetchCurrentUserAfterLogin(loginUser: SessionUser): Promise<SessionUser> {
  try {
    return toSessionUser(await apiRequest<CurrentUser>('/users/me'))
  } catch {
    return loginUser
  }
}

export async function loginSession(input: LoginInput): Promise<AdminSession> {
  const result = await apiRequest<LoginPayload>('/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const loginUser = toSessionUser(result)
  setAuthToken(result.token)
  const user = await fetchCurrentUserAfterLogin(loginUser)
  const session: AdminSession = {
    token: result.token,
    user,
    menus: await fetchMenus(user),
  }
  saveSession(session)
  return session
}

export async function fetchCaptchaCode(): Promise<string> {
  return apiRequest<string>('/code')
}

export async function restoreSession(): Promise<AdminSession | null> {
  if (!readStoredToken()) return null

  try {
    const user = toSessionUser(await apiRequest<CurrentUser>('/users/me'))
    const session: AdminSession = {
      token: readStoredToken(),
      user,
      menus: await fetchMenus(user),
    }
    saveSession(session)
    return session
  } catch {
    clearSession()
    return null
  }
}

export async function login(input: LoginInput): Promise<void> {
  await loginSession(input)
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: '{}' })
  } finally {
    clearSession()
  }
}

export async function getAuthStatus(): Promise<boolean> {
  return (await restoreSession()) !== null
}
