import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { APP_PREFERENCES_CHANGED_EVENT, appPreferencesStorageKey, type AppPreferences } from '@/api/settings'
import { ThemeProvider } from '@/components/theme'
import Dashboard from '@/pages/Dashboard'
import type { AdminSession } from '@/session/types'

vi.mock('@/api/dashboard', () => ({
  getDashboardSummary: vi.fn(() =>
    Promise.resolve({
      stats: [],
      freightTrend: [],
      pendingTasks: [],
    }),
  ),
}))

vi.mock('@/api/auth', () => ({
  logout: vi.fn(() => Promise.resolve()),
}))

function renderDashboard(session: AdminSession) {
  return render(
    <ThemeProvider>
      <Dashboard session={session} onLogout={vi.fn()} />
    </ThemeProvider>,
  )
}

describe('Dashboard', () => {
  it('does not expose default admin nav when the session has no menus', () => {
    renderDashboard({
      token: 'token-123',
      user: { id: 58, name: 'admin', roles: [], roleIds: [] },
      menus: [],
    })

    expect(screen.getAllByText('暂无可用菜单').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '用户管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '角色权限' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '菜单管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '页面注册表' })).not.toBeInTheDocument()
  })

  it('renders only menus returned by the authenticated role', () => {
    renderDashboard({
      token: 'token-123',
      user: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] },
      menus: [
        { id: 1, name: '工作台', url: '/main/workbench' },
        { id: 2, name: '订单列表', url: '/main/order/orders' },
      ],
    })

    expect(screen.getByRole('button', { name: '工作台' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '订单列表' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '用户管理' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '角色权限' })).not.toBeInTheDocument()
  })

  it('keeps the old analysis overview page separate from the workbench page', async () => {
    renderDashboard({
      token: 'token-123',
      user: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] },
      menus: [
        { id: 1, name: '系统概览', url: '/main/analysis/overview' },
        { id: 2, name: '工作台', url: '/main/analysis/workbench' },
      ],
    })

    expect(screen.getByRole('button', { name: '系统概览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '工作台' })).toBeInTheDocument()
    await expect(screen.findByRole('heading', { level: 1, name: '系统概览' }, { timeout: 5000 })).resolves.toBeInTheDocument()
  })

  it('applies persisted appearance preferences to the template shell', async () => {
    window.localStorage.setItem(
      appPreferencesStorageKey(),
      JSON.stringify({
        siteName: '宇涵物流订单系统',
        contact: 'admin@yuhang.local',
        owner: 'ops',
        features: ['audit-log', 'export'],
        compactMode: true,
        animations: false,
      }),
    )

    const { container } = renderDashboard({
      token: 'token-123',
      user: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] },
      menus: [{ id: 1, name: '工作台', url: '/main/workbench' }],
    })

    const shell = container.querySelector('.dashboard-shell')
    await waitFor(() => {
      expect(shell).toHaveAttribute('data-density', 'compact')
      expect(shell).toHaveAttribute('data-motion', 'reduced')
    })
    expect(shell).toHaveClass('dashboard-shell-compact')
    expect(shell).toHaveClass('dashboard-shell-reduced-motion')
  })

  it('updates shell appearance when Settings saves preferences', async () => {
    const { container } = renderDashboard({
      token: 'token-123',
      user: { id: 58, name: 'admin', roles: ['1'], roleIds: [1] },
      menus: [{ id: 1, name: '工作台', url: '/main/workbench' }],
    })
    const shell = container.querySelector('.dashboard-shell')
    await waitFor(() => {
      expect(shell).toHaveAttribute('data-density', 'comfortable')
      expect(shell).toHaveAttribute('data-motion', 'animated')
    })

    const saved: AppPreferences = {
      siteName: '宇涵物流订单系统',
      contact: 'admin@yuhang.local',
      owner: 'ops',
      features: ['audit-log', 'export'],
      compactMode: true,
      animations: false,
    }

    act(() => {
      window.dispatchEvent(new CustomEvent(APP_PREFERENCES_CHANGED_EVENT, { detail: saved }))
    })

    await waitFor(() => {
      expect(shell).toHaveAttribute('data-density', 'compact')
      expect(shell).toHaveAttribute('data-motion', 'reduced')
    })
  })
})
