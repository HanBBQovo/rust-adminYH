import { apiRequest, clearAuthToken, getAuthToken, setAuthToken } from '@/api/client'

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
  roles: string[]
}

export async function login(input: LoginInput): Promise<void> {
  const result = await apiRequest<{ token: string; userInfo?: CurrentUser }>('/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  setAuthToken(result.token)
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: '{}' })
  } finally {
    clearAuthToken()
  }
}

export async function getAuthStatus(): Promise<boolean> {
  if (!getAuthToken()) return false
  try {
    await apiRequest<CurrentUser>('/users/me')
    return true
  } catch {
    return false
  }
}
