import { apiRequest, setAuthToken } from '@/api/client'
import { clearSession, readStoredSession, readStoredToken, saveSession } from '@/session/session-store'
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
}

export interface CurrentUser {
  id: number
  name: string
  avatarUrl?: string
  roles: string[]
}

interface LoginPayload {
  id: number
  name: string
  avatarUrl?: string
  token: string
}

function toSessionUser(user: CurrentUser | LoginPayload): SessionUser {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: 'avatarUrl' in user && typeof user.avatarUrl === 'string' ? user.avatarUrl : `/users/${user.id}/avatar`,
    roles: 'roles' in user && Array.isArray(user.roles) ? user.roles : [],
  }
}

async function fetchMenus(user: SessionUser): Promise<LegacyMenuItem[]> {
  try {
    return await apiRequest<LegacyMenuItem[]>(`/role/${user.roles[0] || 1}/menu`)
  } catch {
    return []
  }
}

export async function loginSession(input: LoginInput): Promise<AdminSession> {
  const result = await apiRequest<LoginPayload>('/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const user = toSessionUser(result)
  setAuthToken(result.token)
  const session: AdminSession = {
    token: result.token,
    user,
    menus: await fetchMenus(user),
  }
  saveSession(session)
  return session
}

export async function restoreSession(): Promise<AdminSession | null> {
  if (!readStoredToken()) return null

  try {
    const user = toSessionUser(await apiRequest<CurrentUser>('/users/me'))
    const cached = readStoredSession()
    const session: AdminSession = {
      token: readStoredToken(),
      user,
      menus: cached?.menus?.length ? cached.menus : await fetchMenus(user),
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
