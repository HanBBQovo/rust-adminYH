import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import MenusList from '@/pages/MenusList'

const listMenuTreeMock = vi.hoisted(() => vi.fn())
const createMenuMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/menus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/menus')>()
  return {
    ...actual,
    listMenuTree: listMenuTreeMock,
    createMenu: createMenuMock,
  }
})

const MENU_TREE = [
  {
    id: 3,
    name: '系统管理',
    type: 1,
    url: '/main/system',
    icon: 'Setting',
    sort: 3,
    createAt: '2026-01-01T00:00:00Z',
    updateAt: '2026-01-02T00:00:00Z',
    chilren: [
      {
        id: 31,
        name: '用户管理',
        type: 2,
        url: '/main/system/user',
        icon: 'Users',
        sort: 1,
        partentId: 3,
      },
      {
        id: 32,
        name: '菜单管理',
        type: 2,
        url: '/main/system/menu',
        icon: 'ListTree',
        sort: 2,
        partentId: 3,
      },
    ],
  },
]

function renderMenusList(options?: { showToast?: ReturnType<typeof vi.fn> }) {
  const showToast = options?.showToast || vi.fn()
  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <MenusList />
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )
  return { showToast }
}

describe('MenusList', () => {
  beforeEach(() => {
    listMenuTreeMock.mockReset()
    createMenuMock.mockReset()
    listMenuTreeMock.mockResolvedValue(MENU_TREE)
    createMenuMock.mockResolvedValue(undefined)
  })

  it('renders the old menu tree fields and typo chilren children', async () => {
    renderMenusList()

    expect(await screen.findByText('系统管理')).toBeInTheDocument()
    expect(screen.getByText('用户管理')).toBeInTheDocument()
    expect(screen.getAllByText('菜单管理').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('/main/system/menu')).toBeInTheDocument()
    expect(screen.getAllByText('子菜单').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('ListTree')).toBeInTheDocument()
    expect(screen.getAllByText('一级菜单').length).toBeGreaterThanOrEqual(1)
    expect(listMenuTreeMock).toHaveBeenCalledTimes(1)
  })

  it('validates required old menu fields before creating', async () => {
    const user = userEvent.setup()
    renderMenusList()

    await screen.findByText('系统管理')
    await user.click(screen.getByRole('button', { name: '创建菜单' }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('菜单名称'))
    await user.clear(within(dialog).getByLabelText('排序'))
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('菜单名称不能为空！')).toBeInTheDocument()
    expect(screen.getByText('排序不能为空！')).toBeInTheDocument()
    expect(createMenuMock).not.toHaveBeenCalled()
  })

  it('creates a root menu through the API wrapper and refreshes the tree', async () => {
    const user = userEvent.setup()
    const { showToast } = renderMenusList()

    await screen.findByText('系统管理')
    await user.click(screen.getByRole('button', { name: '创建菜单' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('菜单名称'), '报表中心')
    await user.clear(within(dialog).getByLabelText('排序'))
    await user.type(within(dialog).getByLabelText('排序'), '4')
    await user.type(within(dialog).getByLabelText('菜单 URL'), '/main/report')
    await user.type(within(dialog).getByLabelText('菜单 icon'), 'ChartBar')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createMenuMock).toHaveBeenCalledWith({
        name: '报表中心',
        type: 1,
        sort: 4,
        url: '/main/report',
        icon: 'ChartBar',
        parentId: null,
      })
    })
    expect(showToast).toHaveBeenCalledWith('success', '创建菜单成功！', { translate: false })
    expect(listMenuTreeMock).toHaveBeenCalledTimes(2)
  })

  it('creates a child menu with old parentId semantics', async () => {
    const user = userEvent.setup()
    renderMenusList()

    await screen.findByText('系统管理')
    await user.click(screen.getByRole('button', { name: '创建菜单' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('菜单名称'), '角色权限')
    await user.click(within(dialog).getByRole('combobox', { name: '类型' }))
    await user.click(await screen.findByRole('option', { name: '子菜单' }))
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('父级菜单不能为空！')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('combobox', { name: '父级菜单' }))
    await user.click(await screen.findByRole('option', { name: '系统管理' }))
    await user.type(within(dialog).getByLabelText('菜单 URL'), '/main/system/role')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createMenuMock).toHaveBeenCalledWith({
        name: '角色权限',
        type: 2,
        sort: 1,
        url: '/main/system/role',
        parentId: 3,
      })
    })
  })

  it('renders the empty state', async () => {
    listMenuTreeMock.mockResolvedValueOnce([])
    renderMenusList()

    expect(await screen.findByText('暂无菜单')).toBeInTheDocument()
  })
})
