import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Boxes, ChevronLeft, ChevronRight, LogOut, PanelLeft, ShieldAlert } from 'lucide-react'

import { logout } from '@/api/auth'
import {
  APP_PREFERENCES_CHANGED_EVENT,
  DEFAULT_APP_PREFERENCES,
  appPreferencesStorageKey,
  normalizeAppPreferences,
  readAppPreferencesSnapshot,
  type AppPreferences,
} from '@/api/settings'
import { ChunkLoadBoundary } from '@/components/ChunkLoadBoundary'
import { PageLoader } from '@/components/PageLoader'
import { PageShell, PageSurface } from '@/components/layout/PageScaffold'
import { ThemeToggleButton } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BRAND_NAME, nsKey } from '@/config'
import { AnimatePresence, motion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { adaptLegacyMenus } from '@/session/menu-adapter'
import type { AdminSession, AppPage, SessionNavItem } from '@/session/types'

const Workspace = lazy(() => import('@/pages/Workspace'))
const SystemOverview = lazy(() => import('@/pages/SystemOverview'))
const OrdersList = lazy(() => import('@/pages/OrdersList'))
const ReceiptsList = lazy(() => import('@/pages/ReceiptsList'))
const CompaniesList = lazy(() => import('@/pages/CompaniesList'))
const UsersList = lazy(() => import('@/pages/UsersList'))
const RolesList = lazy(() => import('@/pages/RolesList'))
const MenusList = lazy(() => import('@/pages/MenusList'))
const ResourceRegistry = lazy(() => import('@/pages/ResourceRegistry'))
const SettingsPage = lazy(() => import('@/pages/Settings'))

/**
 * 应用外壳:侧栏导航 + 顶栏 + 内容区。
 *
 * 这里用 useState 在几个页面间切换,而不是引入 react-router —— 对「登录后单视图、
 * 页面数有限、无深链接需求」的内部后台,这是刻意取舍(见 README「为什么不引路由」)。
 * 真要做深链接/多级路由时,把 `currentPage` 状态换成 router 即可,其余结构不动。
 */

const PAGE_STORAGE_KEY = nsKey('last-page')
const INSTANT_TRANSITION = { duration: 0 }

function isPage(value: string | null, navItems: SessionNavItem[]): value is AppPage {
  return navItems.some((item) => item.key === value)
}

function readStoredPage(navItems: SessionNavItem[]): AppPage {
  if (typeof window === 'undefined') return 'workspace'
  const value = window.localStorage.getItem(PAGE_STORAGE_KEY)
  return isPage(value, navItems) ? value : navItems[0]?.key || 'workspace'
}

interface DashboardProps {
  session: AdminSession
  onLogout: () => void
}

export default function Dashboard({ session, onLogout }: DashboardProps) {
  const [activeSession, setActiveSession] = useState(session)
  const navItems = useMemo(() => adaptLegacyMenus(activeSession.menus), [activeSession.menus])
  const [currentPage, setCurrentPage] = useState<AppPage>(() => readStoredPage(navItems))
  const [appPreferences, setAppPreferences] = useState<AppPreferences>(() =>
    typeof window === 'undefined' ? normalizeAppPreferences(DEFAULT_APP_PREFERENCES) : readAppPreferencesSnapshot(),
  )
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const animationsEnabled = appPreferences.animations
  const compactMode = appPreferences.compactMode
  const sidebarTransition = animationsEnabled ? { type: 'spring' as const, bounce: 0.15, duration: 0.4 } : INSTANT_TRANSITION
  const mobileDrawerTransition = animationsEnabled ? { type: 'spring' as const, bounce: 0.1, duration: 0.35 } : INSTANT_TRANSITION
  const headerTransition = animationsEnabled ? { type: 'spring' as const, bounce: 0.15, duration: 0.35 } : INSTANT_TRANSITION
  const pageTransition = animationsEnabled ? { type: 'spring' as const, bounce: 0.15, duration: 0.4 } : INSTANT_TRANSITION

  const currentItem = useMemo(
    () => navItems.find((item) => item.key === currentPage) || navItems[0] || null,
    [currentPage, navItems],
  )
  const CurrentIcon = currentItem?.icon ?? ShieldAlert

  useEffect(() => {
    const title = currentItem?.label ?? '暂无可用菜单'
    document.title = `${title} - ${BRAND_NAME}`
    if (currentItem) window.localStorage.setItem(PAGE_STORAGE_KEY, currentPage)
  }, [currentItem, currentPage])

  useEffect(() => {
    const handlePreferencesChanged = (event: Event) => {
      if (event instanceof CustomEvent) {
        setAppPreferences(normalizeAppPreferences(event.detail))
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === appPreferencesStorageKey()) {
        setAppPreferences(readAppPreferencesSnapshot())
      }
    }

    window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    if (!navItems.some((item) => item.key === currentPage)) {
      setCurrentPage(navItems[0]?.key || 'workspace')
    }
  }, [currentPage, navItems])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const syncViewport = () => {
      setIsMobileViewport(media.matches)
      if (!media.matches) setMobileNavOpen(false)
    }
    syncViewport()
    media.addEventListener('change', syncViewport)
    return () => media.removeEventListener('change', syncViewport)
  }, [])

  const handleLogout = async () => {
    await logout()
    onLogout()
  }

  const renderNavItem = (item: SessionNavItem, options?: { collapsed?: boolean; onSelect?: () => void }) => {
    const active = currentPage === item.key
    const Icon = item.icon
    const compact = options?.collapsed ?? collapsed
    const button = (
      <button
        type="button"
        key={item.key}
        data-active={active}
        className={cn(
          'dashboard-nav-item flex w-full items-center rounded-md py-2.5 text-left text-sm font-medium transition-colors',
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.05] dark:hover:text-white',
          compact ? 'justify-center px-2.5' : 'gap-3 px-3',
        )}
        onClick={() => {
          setCurrentPage(item.key)
          options?.onSelect?.()
        }}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!compact ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      </button>
    )

    if (!compact) return button

    return (
      <Tooltip key={item.key}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p>{item.label}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  const sidebar = (compact = collapsed, onSelect?: () => void) => (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => renderNavItem(item, { collapsed: compact, onSelect }))}
    </nav>
  )

  const emptyPermissionState = (
    <PageShell title="暂无可用菜单" description="当前账号没有可显示的后台菜单权限。" width="4xl">
      <PageSurface>
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="暂无可用菜单"
          description="请联系管理员检查当前账号的角色和菜单授权。系统不会在空菜单时回退显示默认管理入口。"
        />
      </PageSurface>
    </PageShell>
  )

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          'dashboard-shell flex h-screen overflow-hidden bg-muted/30',
          compactMode && 'dashboard-shell-compact',
          !animationsEnabled && 'dashboard-shell-reduced-motion',
        )}
        data-density={compactMode ? 'compact' : 'comfortable'}
        data-motion={animationsEnabled ? 'animated' : 'reduced'}
      >
        {/* 桌面侧栏:折叠态宽度用 spring 过渡 */}
        <motion.aside
          className="dashboard-aside relative hidden h-full shrink-0 flex-col border-r bg-background md:flex"
          animate={{ width: collapsed ? 68 : 256 }}
          transition={sidebarTransition}
        >
          <div className="flex h-16 items-center border-b px-4">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className={cn(
                'grid w-full items-center gap-3 overflow-hidden rounded-xl text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                collapsed ? 'grid-cols-[36px_0px]' : 'grid-cols-[36px_minmax(0,1fr)]',
              )}
            >
              <div className="dashboard-brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                <Boxes className="h-5 w-5" />
              </div>
              <div className={cn('min-w-0 overflow-hidden whitespace-nowrap text-lg font-bold tracking-tight transition-opacity', collapsed ? 'opacity-0' : 'opacity-100')}>
                {BRAND_NAME}
              </div>
            </button>
          </div>

          <div className="scrollbar-none flex-1 overflow-y-auto px-3 py-4">{sidebar()}</div>

          <div className="border-t p-3">
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </motion.aside>

        {/* 移动端抽屉 */}
        <AnimatePresence>
          {isMobileViewport && mobileNavOpen ? (
            <>
              <motion.button
                type="button"
                className="fixed inset-0 z-40 bg-black/42 md:hidden dark:bg-black/64"
                initial={animationsEnabled ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={animationsEnabled ? { duration: 0.18 } : INSTANT_TRANSITION}
                onClick={() => setMobileNavOpen(false)}
                aria-label="关闭导航"
              />
              <motion.aside
                className="dashboard-mobile-drawer fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[86vw] flex-col border-r bg-background md:hidden"
                initial={animationsEnabled ? { x: -320 } : false}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={mobileDrawerTransition}
              >
                <div className="flex h-16 items-center border-b px-4">
                  <div className="flex items-center gap-3">
                    <div className="dashboard-brand-mark flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                      <Boxes className="h-5 w-5" />
                    </div>
                    <div className="text-lg font-bold tracking-tight">{BRAND_NAME}</div>
                  </div>
                </div>
                <div className="scrollbar-none flex-1 overflow-y-auto px-3 py-4">{sidebar(false, () => setMobileNavOpen(false))}</div>
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="scrollbar-none flex-1 overflow-y-auto">
            <header className="dashboard-header sticky top-0 z-10 flex h-16 items-center gap-3 border-b bg-background px-4 md:px-6">
              <motion.div
                key={currentPage}
                initial={animationsEnabled ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={headerTransition}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {isMobileViewport ? (
                  <Button variant="outline" size="icon" className="h-9 w-9 md:hidden" onClick={() => setMobileNavOpen(true)}>
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                ) : null}
                <CurrentIcon className="h-5 w-5 text-primary" />
                <h2 className="truncate text-base font-semibold md:text-lg">{currentItem?.label ?? '暂无可用菜单'}</h2>
              </motion.div>

              <div className="ml-auto flex min-w-0 items-center gap-2">
                <ThemeToggleButton compact={isMobileViewport} showLabel={!isMobileViewport} />
                <Button variant="outline" size={isMobileViewport ? 'icon' : undefined} className="gap-2" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  {!isMobileViewport ? <span>退出登录</span> : null}
                </Button>
              </div>
            </header>

            <main className="p-4 md:p-6">
              <ChunkLoadBoundary scopeLabel={currentItem?.label ?? '暂无可用菜单'}>
                <Suspense fallback={<PageLoader />}>
                  <motion.div
                    key={currentPage}
                    initial={animationsEnabled ? { opacity: 0, y: 20, scale: 0.99 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={pageTransition}
                  >
                    {!navItems.length ? emptyPermissionState : null}
                    {navItems.length && currentPage === 'overview' ? <SystemOverview /> : null}
                    {navItems.length && currentPage === 'workspace' ? <Workspace /> : null}
                    {navItems.length && currentPage === 'orders' ? <OrdersList /> : null}
                    {navItems.length && currentPage === 'receipts' ? <ReceiptsList /> : null}
                    {navItems.length && currentPage === 'companies' ? <CompaniesList /> : null}
                    {navItems.length && currentPage === 'users' ? <UsersList /> : null}
                    {navItems.length && currentPage === 'roles' ? <RolesList /> : null}
                    {navItems.length && currentPage === 'menus' ? <MenusList /> : null}
                    {navItems.length && currentPage === 'registry' ? <ResourceRegistry /> : null}
                    {navItems.length && currentPage === 'settings' ? (
                      <SettingsPage
                        user={activeSession.user}
                        onAvatarUploaded={(cacheBust) => {
                          setActiveSession((current) => ({
                            ...current,
                            user: {
                              ...current.user,
                              avatarUrl: `/users/${current.user.id}/avatar?ts=${cacheBust}`,
                            },
                          }))
                        }}
                      />
                    ) : null}
                  </motion.div>
                </Suspense>
              </ChunkLoadBoundary>
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
