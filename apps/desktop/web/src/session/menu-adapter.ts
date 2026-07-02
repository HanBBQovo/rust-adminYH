import { Building2, ClipboardList, FileCheck2, KeyRound, LayoutDashboard, PackageCheck, Settings, Users } from 'lucide-react'

import type { AppPage, LegacyMenuItem, SessionNavItem } from '@/session/types'

const FALLBACK_NAV_ITEMS: SessionNavItem[] = [
  { key: 'workspace', label: '工作台', icon: LayoutDashboard },
  { key: 'orders', label: '订单列表', icon: PackageCheck },
  { key: 'receipts', label: '回单管理', icon: FileCheck2 },
  { key: 'companies', label: '发货公司', icon: Building2 },
  { key: 'users', label: '用户管理', icon: Users },
  { key: 'roles', label: '角色权限', icon: KeyRound },
  { key: 'registry', label: '页面注册表', icon: ClipboardList },
  { key: 'settings', label: '系统设置', icon: Settings },
]

const PAGE_MATCHERS: Array<{ key: AppPage; icon: SessionNavItem['icon']; patterns: RegExp[] }> = [
  { key: 'workspace', icon: LayoutDashboard, patterns: [/workbench|dashboard|workspace|工作台|统计|首页/i] },
  { key: 'orders', icon: PackageCheck, patterns: [/order\/orders|order\/list|\/order\b(?!\/company)|订单列表|运单|订单管理/i] },
  { key: 'receipts', icon: FileCheck2, patterns: [/receipt|notrecovery|recovery|回单|未回收|已回收/i] },
  { key: 'companies', icon: Building2, patterns: [/order\/company|company|发货公司/i] },
  { key: 'users', icon: Users, patterns: [/system\/user|\/users?\b|用户管理/i] },
  { key: 'roles', icon: KeyRound, patterns: [/system\/role|system\/menu|\/role\b|\/menu\b|角色管理|权限|菜单管理/i] },
  { key: 'registry', icon: ClipboardList, patterns: [/registry|system$|页面/i] },
  { key: 'settings', icon: Settings, patterns: [/setting|settings|profile|系统设置|设置/i] },
]

function flattenMenus(menus: LegacyMenuItem[]): LegacyMenuItem[] {
  return menus.flatMap((menu) => [menu, ...flattenMenus(menu.children || [])])
}

function menuText(menu: LegacyMenuItem): string {
  return [menu.name, menu.title, menu.url, menu.path].filter(Boolean).join(' ')
}

function labelForPage(page: AppPage, source?: LegacyMenuItem): string {
  const fallback = FALLBACK_NAV_ITEMS.find((item) => item.key === page)?.label || page
  return source?.name || source?.title || fallback
}

export function adaptLegacyMenus(menus: LegacyMenuItem[]): SessionNavItem[] {
  const flattened = flattenMenus(menus)
  const matched = PAGE_MATCHERS.flatMap(({ key, icon, patterns }) => {
    const source = flattened.find((menu) => patterns.some((pattern) => pattern.test(menuText(menu))))
    return source ? [{ key, label: labelForPage(key, source), icon }] : []
  })

  if (!matched.length) return FALLBACK_NAV_ITEMS

  const keys = new Set<AppPage>()
  return matched.filter((item) => {
    if (keys.has(item.key)) return false
    keys.add(item.key)
    return true
  })
}

export function fallbackNavItems(): SessionNavItem[] {
  return FALLBACK_NAV_ITEMS
}
