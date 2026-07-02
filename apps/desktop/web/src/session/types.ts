import type { ElementType } from 'react'

export interface SessionUser {
  id: number
  name: string
  roles: string[]
}

export interface LegacyMenuItem {
  id?: number
  name?: string
  title?: string
  url?: string
  path?: string
  icon?: string
  children?: LegacyMenuItem[]
}

export type AppPage = 'workspace' | 'orders' | 'receipts' | 'companies' | 'users' | 'roles' | 'registry' | 'settings'

export interface SessionNavItem {
  key: AppPage
  label: string
  icon: ElementType
}

export interface AdminSession {
  token: string
  user: SessionUser
  menus: LegacyMenuItem[]
}
