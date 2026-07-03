import { clearAuthToken, getAuthToken, setAuthToken } from '@/api/client'
import { nsKey } from '@/config'
import type { AdminSession, AppPage, SessionNavItem } from '@/session/types'

const SESSION_STORAGE_KEY = nsKey('session')
const REMEMBERED_LOGIN_NAME_KEY = nsKey('remembered-login-name')
const LAST_PAGE_STORAGE_KEY = nsKey('last-page')

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

export function readRememberedLoginName(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(REMEMBERED_LOGIN_NAME_KEY) || ''
}

export function saveRememberedLoginName(name: string): void {
  window.localStorage.setItem(REMEMBERED_LOGIN_NAME_KEY, name)
}

export function clearRememberedLoginName(): void {
  window.localStorage.removeItem(REMEMBERED_LOGIN_NAME_KEY)
}

function isAvailablePage(value: string | null, navItems: SessionNavItem[]): value is AppPage {
  return navItems.some((item) => item.key === value)
}

export function readStoredPage(navItems: SessionNavItem[]): AppPage {
  if (typeof window === 'undefined') return 'workspace'
  const value = window.localStorage.getItem(LAST_PAGE_STORAGE_KEY)
  return isAvailablePage(value, navItems) ? value : navItems[0]?.key || 'workspace'
}

export function saveStoredPage(page: AppPage): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAST_PAGE_STORAGE_KEY, page)
}

export function lastPageStorageKey(): string {
  return LAST_PAGE_STORAGE_KEY
}
