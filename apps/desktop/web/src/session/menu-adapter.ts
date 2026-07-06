import { Building2, ClipboardList, FileCheck2, Info, KeyRound, LayoutDashboard, ListTree, PackageCheck, Settings, Users } from 'lucide-react'

import type { AdminSession, AppPage, LegacyMenuItem, SessionNavItem } from '@/session/types'

export const SUPER_ADMIN_ROLE_ID = 1

export const STATIC_NAV_ITEMS: SessionNavItem[] = [
  { key: 'overview', label: '系统概览', icon: Info },
  { key: 'workspace', label: '工作台', icon: LayoutDashboard },
  { key: 'orders', label: '订单列表', icon: PackageCheck },
  { key: 'receipts', label: '回单管理', icon: FileCheck2 },
  { key: 'companies', label: '发货公司', icon: Building2 },
  { key: 'users', label: '用户管理', icon: Users },
  { key: 'roles', label: '角色权限', icon: KeyRound },
  { key: 'menus', label: '菜单管理', icon: ListTree },
  { key: 'registry', label: '页面注册表', icon: ClipboardList },
  { key: 'settings', label: '系统设置', icon: Settings },
]

const PAGE_MATCHERS: Array<{ key: AppPage; icon: SessionNavItem['icon']; patterns: RegExp[] }> = [
  { key: 'overview', icon: Info, patterns: [/analysis\/overview|overview|系统概览|项目概览|概览|关于/i] },
  { key: 'workspace', icon: LayoutDashboard, patterns: [/analysis\/workbench|workbench|dashboard|workspace|工作台|统计|首页/i] },
  { key: 'orders', icon: PackageCheck, patterns: [/order\/orders|order\/list|\/order\b(?!\/company)|订单列表|运单|订单管理/i] },
  { key: 'receipts', icon: FileCheck2, patterns: [/receipt|notrecovery|recovery|回单|未回收|已回收/i] },
  { key: 'companies', icon: Building2, patterns: [/order\/company|company|发货公司/i] },
  { key: 'users', icon: Users, patterns: [/system\/user|\/users?\b|用户管理/i] },
  { key: 'roles', icon: KeyRound, patterns: [/system\/role|\/role\b|角色管理|权限/i] },
  { key: 'menus', icon: ListTree, patterns: [/system\/menu|\/menu\b|菜单管理|菜单列表/i] },
  { key: 'registry', icon: ClipboardList, patterns: [/registry|system$|页面/i] },
  { key: 'settings', icon: Settings, patterns: [/setting|settings|profile|系统设置|设置/i] },
]

function flattenMenus(menus: LegacyMenuItem[]): LegacyMenuItem[] {
  return menus.flatMap((menu) => [menu, ...flattenMenus([...(menu.children || []), ...(menu.chilren || [])])])
}

function menuChildren(menu: LegacyMenuItem): LegacyMenuItem[] {
  return [...(menu.children || []), ...(menu.chilren || [])]
}

function menuText(menu: LegacyMenuItem): string {
  return [menu.name, menu.title, menu.url, menu.path].filter(Boolean).join(' ')
}

function isPageMenu(menu: LegacyMenuItem): boolean {
  return menu.type === undefined || menu.type === null || menu.type === 2 || menuChildren(menu).length === 0
}

function labelForPage(page: AppPage, source?: LegacyMenuItem): string {
  const fallback = STATIC_NAV_ITEMS.find((item) => item.key === page)?.label || page
  return source?.name || source?.title || fallback
}

export function adaptLegacyMenus(menus: LegacyMenuItem[]): SessionNavItem[] {
  const flattened = flattenMenus(menus).filter(isPageMenu)
  const matched = PAGE_MATCHERS.flatMap(({ key, icon, patterns }) => {
    const source = flattened.find((menu) => patterns.some((pattern) => pattern.test(menuText(menu))))
    return source ? [{ key, label: labelForPage(key, source), icon }] : []
  })

  if (!matched.length) return []

  const keys = new Set<AppPage>()
  return matched.filter((item) => {
    if (keys.has(item.key)) return false
    keys.add(item.key)
    return true
  })
}

export function isSuperAdminRole(roleIds: number[]): boolean {
  return roleIds.includes(SUPER_ADMIN_ROLE_ID)
}

export function navigationForSession(session: Pick<AdminSession, 'user' | 'menus'>): SessionNavItem[] {
  if (isSuperAdminRole(session.user.roleIds)) {
    return [...STATIC_NAV_ITEMS]
  }

  return adaptLegacyMenus(session.menus)
}
