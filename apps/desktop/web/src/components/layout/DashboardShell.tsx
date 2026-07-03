import { useEffect, useState, type ReactNode } from 'react'
import { Boxes, ChevronLeft, ChevronRight, LogOut, PanelLeft, ShieldAlert } from 'lucide-react'

import {
  APP_PREFERENCES_CHANGED_EVENT,
  DEFAULT_APP_PREFERENCES,
  appPreferencesStorageKey,
  normalizeAppPreferences,
  readAppPreferencesSnapshot,
  type AppPreferences,
} from '@/api/settings'
import { ThemeToggleButton } from '@/components/theme'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BRAND_NAME } from '@/config'
import { AnimatePresence, motion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { AppPage, SessionNavItem } from '@/session/types'

const INSTANT_TRANSITION = { duration: 0 }

interface DashboardShellProps {
  navItems: SessionNavItem[]
  currentPage: AppPage
  currentItem: SessionNavItem | null
  onPageChange: (page: AppPage) => void
  onLogout: () => void
  children: (state: DashboardShellState) => ReactNode
}

interface DashboardShellState {
  animationsEnabled: boolean
}

export function DashboardShell({
  navItems,
  currentPage,
  currentItem,
  onPageChange,
  onLogout,
  children,
}: DashboardShellProps) {
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
  const CurrentIcon = currentItem?.icon ?? ShieldAlert

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
    const media = window.matchMedia('(max-width: 767px)')
    const syncViewport = () => {
      setIsMobileViewport(media.matches)
      if (!media.matches) setMobileNavOpen(false)
    }
    syncViewport()
    media.addEventListener('change', syncViewport)
    return () => media.removeEventListener('change', syncViewport)
  }, [])

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
          onPageChange(item.key)
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
              <div className={cn('min-w-0 truncate text-lg font-bold tracking-tight transition-opacity', collapsed ? 'opacity-0' : 'opacity-100')}>
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
                <Button variant="outline" size={isMobileViewport ? 'icon' : undefined} className="gap-2" onClick={onLogout}>
                  <LogOut className="h-4 w-4" />
                  {!isMobileViewport ? <span>退出登录</span> : null}
                </Button>
              </div>
            </header>

            <main className="p-4 md:p-6">{children({ animationsEnabled })}</main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
