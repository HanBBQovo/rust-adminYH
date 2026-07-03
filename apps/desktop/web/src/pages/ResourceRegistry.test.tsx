import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import ResourceRegistry from '@/pages/ResourceRegistry'

const listResourceSummariesMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/registry', () => ({
  listResourceSummaries: listResourceSummariesMock,
}))

const RESOURCE_ROWS = [
  {
    key: 'orders',
    title: '订单管理',
    description: '承运单、货运信息、结算状态',
    count: 12,
    status: 'ready',
    apiPath: '/order/list',
    legacyPath: 'adminYh/src/views/orders',
    owner: '业务前台',
  },
  {
    key: 'menus',
    title: '菜单资源',
    description: '侧边栏、路由、权限节点',
    count: 6,
    status: 'ready',
    apiPath: '/menu/tree',
    legacyPath: 'adminYh/src/router',
    owner: '系统设置',
  },
] as const

function renderRegistry() {
  render(
    <ThemeProvider>
      <ResourceRegistry />
    </ThemeProvider>,
  )
}

describe('ResourceRegistry', () => {
  beforeEach(() => {
    listResourceSummariesMock.mockReset()
    listResourceSummariesMock.mockResolvedValue(RESOURCE_ROWS)
  })

  it('shows business module labels instead of legacy source paths', async () => {
    renderRegistry()

    expect(await screen.findAllByText('订单管理')).toHaveLength(2)
    expect(screen.getByText('菜单权限')).toBeVisible()
    expect(screen.getByText('/order/list')).toBeVisible()
    expect(screen.queryByText('adminYh/src/views/orders')).not.toBeInTheDocument()
    expect(screen.queryByText('adminYh/src/router')).not.toBeInTheDocument()
  })

  it('uses production-facing empty copy when filters match nothing', async () => {
    listResourceSummariesMock.mockResolvedValueOnce([])
    renderRegistry()

    expect(await screen.findByText('没有匹配模块')).toBeVisible()
    expect(screen.getByText('请调整关键词或刷新模块数据。')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText(/src\/|切片|后续新增/)).not.toBeInTheDocument()
    })
  })
})
