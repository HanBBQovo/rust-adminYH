import type { ElementType } from 'react'

export interface SessionUser {
  id: number
  name: string
  avatarUrl?: string
  roles: string[]
}

export interface LegacyMenuItem {
  id?: number
  name?: string
  title?: string
  type?: number
  url?: string
  path?: string
  icon?: string
  sort?: number
  parentId?: number | null
  partentId?: number | null
  children?: LegacyMenuItem[]
  chilren?: LegacyMenuItem[]
}

export type AppPage = 'workspace' | 'orders' | 'receipts' | 'companies' | 'users' | 'roles' | 'menus' | 'registry' | 'settings'

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
