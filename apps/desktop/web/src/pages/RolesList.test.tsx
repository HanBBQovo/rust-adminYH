import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { ConfirmDialogContext } from '@/components/ui/confirm-dialog-context'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import RolesList from '@/pages/RolesList'

const listRolesMock = vi.hoisted(() => vi.fn())
const getRoleMock = vi.hoisted(() => vi.fn())
const createRoleMock = vi.hoisted(() => vi.fn())
const updateRoleMock = vi.hoisted(() => vi.fn())
const deleteRoleMock = vi.hoisted(() => vi.fn())
const listMenuTreeMock = vi.hoisted(() => vi.fn())
const getRoleMenuIdsMock = vi.hoisted(() => vi.fn())
const assignRoleMenusMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/roles', () => ({
  listRoles: listRolesMock,
  getRole: getRoleMock,
  createRole: createRoleMock,
  updateRole: updateRoleMock,
  deleteRole: deleteRoleMock,
  listMenuTree: listMenuTreeMock,
  getRoleMenuIds: getRoleMenuIdsMock,
  assignRoleMenus: assignRoleMenusMock,
}))

const ROLE_ROW = {
  id: 1,
  name: '超级管理员',
  intro: '所有权限',
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
}

const MENU_TREE = [
  {
    id: 1,
    name: '系统管理',
    type: 1,
    sort: 1,
    chilren: [
      { id: 11, name: '角色管理', type: 2, sort: 1, partentId: 1, url: '/main/system/role' },
      { id: 12, name: '菜单管理', type: 2, sort: 2, partentId: 1, url: '/main/system/menu' },
    ],
  },
]

function renderRolesList(options?: { confirm?: () => Promise<boolean>; showToast?: ReturnType<typeof vi.fn> }) {
  const confirm = options?.confirm || vi.fn().mockResolvedValue(true)
  const showToast = options?.showToast || vi.fn()

  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <ConfirmDialogContext.Provider value={{ confirm }}>
          <RolesList />
        </ConfirmDialogContext.Provider>
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )

  return { confirm, showToast }
}

function roleField(dialog: HTMLElement, key: string): HTMLInputElement {
  const field = dialog.querySelector<HTMLInputElement>(`#role-${key}`)
  if (!field) throw new Error(`missing role field: ${key}`)
  return field
}

describe('RolesList', () => {
  beforeEach(() => {
    listRolesMock.mockReset()
    getRoleMock.mockReset()
    createRoleMock.mockReset()
    updateRoleMock.mockReset()
    deleteRoleMock.mockReset()
    listMenuTreeMock.mockReset()
    getRoleMenuIdsMock.mockReset()
    assignRoleMenusMock.mockReset()
    listRolesMock.mockResolvedValue({ rows: [ROLE_ROW], total: 11 })
    getRoleMock.mockResolvedValue(ROLE_ROW)
    createRoleMock.mockResolvedValue(undefined)
    updateRoleMock.mockResolvedValue(undefined)
    deleteRoleMock.mockResolvedValue(undefined)
    listMenuTreeMock.mockResolvedValue(MENU_TREE)
    getRoleMenuIdsMock.mockResolvedValue({ id: 1, name: '超级管理员', intro: '所有权限', menuIds: [1, 11] })
    assignRoleMenusMock.mockResolvedValue(undefined)
  })

  it('renders old role columns and fields', async () => {
    renderRolesList()

    expect(await screen.findByText('超级管理员')).toBeInTheDocument()
    expect(screen.getAllByText('权限介绍').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('所有权限')).toBeInTheDocument()
    expect(screen.getAllByText('创建时间').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('更新时间')).toBeInTheDocument()
    expect(listRolesMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
  })

  it('applies old role filters and paginates through the API wrapper', async () => {
    const user = userEvent.setup()
    renderRolesList()

    await screen.findByText('超级管理员')
    await user.type(screen.getByLabelText('角色名'), '超级')
    await user.type(screen.getByLabelText('权限介绍'), '所有')
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listRolesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          name: '超级',
          intro: '所有',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listRolesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          name: '超级',
          intro: '所有',
        }),
      )
    })
  })

  it('validates required old role fields before creating', async () => {
    const user = userEvent.setup()
    renderRolesList()

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '新建角色' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('角色名不能为空！')).toBeInTheDocument()
    expect(screen.getByText('权限介绍不能为空！')).toBeInTheDocument()
    expect(createRoleMock).not.toHaveBeenCalled()
  })

  it('creates roles through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderRolesList()

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '新建角色' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(roleField(dialog, 'name'), '财务')
    await user.type(roleField(dialog, 'intro'), '部分权限')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createRoleMock).toHaveBeenCalledWith({ name: '财务', intro: '部分权限' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '创建权限角色成功！', { translate: false })
    expect(listRolesMock).toHaveBeenCalledTimes(2)
  })

  it('loads detail for view and keeps the form readonly', async () => {
    const user = userEvent.setup()
    renderRolesList()

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '查看角色' }))

    expect(await screen.findByText('查看角色')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(getRoleMock).toHaveBeenCalledWith(1)
    expect(roleField(dialog, 'name')).toBeDisabled()
    expect(roleField(dialog, 'intro')).toBeDisabled()
    expect(within(dialog).queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('updates roles through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderRolesList()

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '编辑角色' }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(roleField(dialog, 'name'))
    await user.type(roleField(dialog, 'name'), '财务主管')
    await user.clear(roleField(dialog, 'intro'))
    await user.type(roleField(dialog, 'intro'), '全部财务权限')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(updateRoleMock).toHaveBeenCalledWith(1, { name: '财务主管', intro: '全部财务权限' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '修改角色信息成功!', { translate: false })
  })

  it('assigns menu permissions with legacy children spelling support', async () => {
    const user = userEvent.setup()
    const { showToast } = renderRolesList()

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '分配权限' }))
    expect(await screen.findByText('角色管理')).toBeInTheDocument()
    expect(screen.getByText('菜单管理')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '选择菜单 菜单管理' }))
    await user.click(screen.getByRole('button', { name: '保存权限' }))

    await waitFor(() => {
      expect(listMenuTreeMock).toHaveBeenCalled()
      expect(getRoleMenuIdsMock).toHaveBeenCalledWith(1)
      expect(assignRoleMenusMock).toHaveBeenCalledWith({ roleId: 1, menuList: [1, 11, 12] })
    })
    expect(showToast).toHaveBeenCalledWith('success', '分配权限成功！', { translate: false })
  })

  it('confirms before deleting roles', async () => {
    const user = userEvent.setup()
    const { confirm, showToast } = renderRolesList()

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '删除角色' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除角色', variant: 'destructive' }))
      expect(deleteRoleMock).toHaveBeenCalledWith(1)
    })
    expect(showToast).toHaveBeenCalledWith('success', '删除权限角色成功！', { translate: false })
  })

  it('does not delete roles when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn().mockResolvedValue(false)
    renderRolesList({ confirm })

    await screen.findByText('超级管理员')
    await user.click(screen.getByRole('button', { name: '删除角色' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除角色', variant: 'destructive' }))
    })
    expect(deleteRoleMock).not.toHaveBeenCalled()
  })

  it('renders the empty state', async () => {
    listRolesMock.mockResolvedValueOnce({ rows: [], total: 0 })
    renderRolesList()

    expect(await screen.findByText('暂无角色')).toBeInTheDocument()
  })
})
