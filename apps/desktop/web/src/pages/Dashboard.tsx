import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import { logout } from '@/api/auth'
import { ChunkLoadBoundary } from '@/components/ChunkLoadBoundary'
import { PageLoader } from '@/components/PageLoader'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { PageShell, PageSurface } from '@/components/layout/PageScaffold'
import { EmptyState } from '@/components/ui/empty-state'
import { BRAND_NAME } from '@/config'
import { motion } from '@/lib/motion'
import { navigationForSession } from '@/session/menu-adapter'
import { readStoredPage, saveStoredPage } from '@/session/session-store'
import type { AdminSession, AppPage } from '@/session/types'

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

interface DashboardProps {
  session: AdminSession
  onLogout: () => void
}

export default function Dashboard({ session, onLogout }: DashboardProps) {
  const [activeSession, setActiveSession] = useState(session)
  const navItems = useMemo(() => navigationForSession(activeSession), [activeSession])
  const [currentPage, setCurrentPage] = useState<AppPage>(() => readStoredPage(navItems))

  const currentItem = useMemo(
    () => navItems.find((item) => item.key === currentPage) || navItems[0] || null,
    [currentPage, navItems],
  )

  useEffect(() => {
    const title = currentItem?.label ?? '暂无可用菜单'
    document.title = `${title} - ${BRAND_NAME}`
    if (currentItem) saveStoredPage(currentPage)
  }, [currentItem, currentPage])

  useEffect(() => {
    if (!navItems.some((item) => item.key === currentPage)) {
      setCurrentPage(navItems[0]?.key || 'workspace')
    }
  }, [currentPage, navItems])

  const handleLogout = async () => {
    await logout()
    onLogout()
  }

  const emptyPermissionState = (
    <PageShell title="暂无可用菜单" description="当前账号没有可显示的后台菜单权限。" width="4xl">
      <PageSurface>
        <EmptyState
          icon={<ShieldAlert className="h-5 w-5" />}
          title="暂无可用菜单"
          description="请联系管理员检查当前账号的角色和菜单授权。超级管理员会自动拥有全部系统入口。"
        />
      </PageSurface>
    </PageShell>
  )

  return (
    <DashboardShell
      navItems={navItems}
      currentPage={currentPage}
      currentItem={currentItem}
      onPageChange={setCurrentPage}
      onLogout={handleLogout}
    >
      {({ animationsEnabled }) => (
        <ChunkLoadBoundary scopeLabel={currentItem?.label ?? '暂无可用菜单'}>
          <Suspense fallback={<PageLoader />}>
            <motion.div
              key={currentPage}
              initial={animationsEnabled ? { opacity: 0, y: 20, scale: 0.99 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={animationsEnabled ? { type: 'spring', bounce: 0.15, duration: 0.4 } : { duration: 0 }}
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
      )}
    </DashboardShell>
  )
}
