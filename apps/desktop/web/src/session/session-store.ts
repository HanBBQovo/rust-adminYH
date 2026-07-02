import { clearAuthToken, getAuthToken, setAuthToken } from '@/api/client'
import { nsKey } from '@/config'
import type { AdminSession } from '@/session/types'

const SESSION_STORAGE_KEY = nsKey('session')

function isSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<AdminSession>
  const user = session.user as Partial<AdminSession['user']> | undefined
  return (
    typeof session.token === 'string' &&
    !!session.token &&
    !!user &&
    typeof user.id === 'number' &&
    typeof user.name === 'string' &&
    Array.isArray(user.roles) &&
    Array.isArray(user.roleIds) &&
    Array.isArray(session.menus)
  )
}

export function readStoredSession(): AdminSession | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(session: AdminSession): void {
  setAuthToken(session.token)
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  clearAuthToken()
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function readStoredToken(): string {
  return getAuthToken() || readStoredSession()?.token || ''
}
