import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { ConfirmDialogContext } from '@/components/ui/confirm-dialog-context'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import UsersList from '@/pages/UsersList'

const listUsersMock = vi.hoisted(() => vi.fn())
const getUserMock = vi.hoisted(() => vi.fn())
const createUserMock = vi.hoisted(() => vi.fn())
const updateUserMock = vi.hoisted(() => vi.fn())
const updateUserPasswordMock = vi.hoisted(() => vi.fn())
const deleteUserMock = vi.hoisted(() => vi.fn())
const listAssignableRolesMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/users', () => ({
  listUsers: listUsersMock,
  getUser: getUserMock,
  createUser: createUserMock,
  updateUser: updateUserMock,
  updateUserPassword: updateUserPasswordMock,
  deleteUser: deleteUserMock,
}))

vi.mock('@/api/roles', () => ({
  listAssignableRoles: listAssignableRolesMock,
}))

const ROLE_ROWS = [
  {
    id: 1,
    name: '超级管理员',
    intro: '所有权限',
    createAt: '2026-01-01T00:00:00Z',
    updateAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: '普通用户',
    intro: '部分权限',
    createAt: '2026-01-02T00:00:00Z',
    updateAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 3,
    name: '财务',
    intro: '财务权限',
    createAt: '2026-01-03T00:00:00Z',
    updateAt: '2026-01-03T00:00:00Z',
  },
]

const USER_ROW = {
  id: 58,
  name: 'admin',
  avatarUrl: 'http://127.0.0.1:8000/users/58/avatar',
  enable: 1,
  roleId: 1,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
}

const USER_DETAIL = {
  id: 58,
  name: 'admin',
  avatarUrl: 'http://127.0.0.1:8000/users/58/avatar',
  enable: 1,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
  role: ROLE_ROWS[0],
}

function renderUsersList(options?: { confirm?: () => Promise<boolean>; showToast?: ReturnType<typeof vi.fn> }) {
  const confirm = options?.confirm || vi.fn().mockResolvedValue(true)
  const showToast = options?.showToast || vi.fn()

  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <ConfirmDialogContext.Provider value={{ confirm }}>
          <UsersList />
        </ConfirmDialogContext.Provider>
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )

  return { confirm, showToast }
}

function userField(dialog: HTMLElement, key: string): HTMLInputElement {
  const field = dialog.querySelector<HTMLInputElement>(`#user-${key}`)
  if (!field) throw new Error(`missing user field: ${key}`)
  return field
}

describe('UsersList', () => {
  beforeEach(() => {
    listUsersMock.mockReset()
    getUserMock.mockReset()
    createUserMock.mockReset()
    updateUserMock.mockReset()
    updateUserPasswordMock.mockReset()
    deleteUserMock.mockReset()
    listAssignableRolesMock.mockReset()
    listUsersMock.mockResolvedValue({ rows: [USER_ROW], total: 11 })
    getUserMock.mockResolvedValue(USER_DETAIL)
    createUserMock.mockResolvedValue(undefined)
    updateUserMock.mockResolvedValue(undefined)
    updateUserPasswordMock.mockResolvedValue(undefined)
    deleteUserMock.mockResolvedValue(undefined)
    listAssignableRolesMock.mockResolvedValue(ROLE_ROWS)
  })

  it('renders old user columns, avatar, status, and roles', async () => {
    renderUsersList()

    expect(await screen.findByText('admin')).toBeInTheDocument()
    expect(screen.getByText('权限身份')).toBeInTheDocument()
    expect(screen.getByText('启用')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(await screen.findByText('超级管理员')).toBeInTheDocument()
    expect(listUsersMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
    expect(listAssignableRolesMock).toHaveBeenCalled()
  })

  it('applies old filters and paginates through the API wrapper', async () => {
    const user = userEvent.setup()
    renderUsersList()

    await screen.findByText('admin')
    await user.type(screen.getByLabelText('用户名'), 'admin')
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          name: 'admin',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listUsersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          name: 'admin',
        }),
      )
    })
  })

  it('uses every returned role as a user filter and create option', async () => {
    const user = userEvent.setup()
    renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('combobox', { name: '权限名称' }))
    await user.click(await screen.findByRole('option', { name: '财务' }))
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listUsersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          roleId: 3,
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: '新建用户' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(userField(dialog, 'name'), 'finance')
    await user.type(userField(dialog, 'password'), 'secret3')
    await user.click(within(dialog).getByRole('combobox', { name: '选择角色' }))
    await user.click(await screen.findByRole('option', { name: '财务' }))
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith({ name: 'finance', password: 'secret3', roleId: 3 })
    })
  })

  it('validates required old user fields before creating', async () => {
    const user = userEvent.setup()
    renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('button', { name: '新建用户' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('用户名不能为空！')).toBeInTheDocument()
    expect(screen.getByText('密码不能为空！')).toBeInTheDocument()
    expect(screen.getByText('权限角色不能为空！')).toBeInTheDocument()
    expect(createUserMock).not.toHaveBeenCalled()
  })

  it('creates users with password and role through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('button', { name: '新建用户' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(userField(dialog, 'name'), 'operator2')
    await user.type(userField(dialog, 'password'), 'secret2')
    await waitFor(() => {
      expect(listAssignableRolesMock).toHaveResolved()
    })
    await user.click(within(dialog).getByRole('combobox', { name: '选择角色' }))
    await user.click(await screen.findByRole('option', { name: '普通用户' }))
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith({ name: 'operator2', password: 'secret2', roleId: 2 })
    })
    expect(showToast).toHaveBeenCalledWith('success', '创建用户成功！', { translate: false })
    expect(listUsersMock).toHaveBeenCalledTimes(2)
  })

  it('loads detail for view and keeps the form readonly without password', async () => {
    const user = userEvent.setup()
    renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('button', { name: '查看用户' }))

    expect(await screen.findByText('查看用户')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(getUserMock).toHaveBeenCalledWith(58)
    expect(userField(dialog, 'name')).toBeDisabled()
    expect(dialog.querySelector('#user-password')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('updates users without password through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('button', { name: '编辑用户' }))
    expect(await screen.findByText('编辑用户')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('#user-password')).not.toBeInTheDocument()
    await user.clear(userField(dialog, 'name'))
    await user.type(userField(dialog, 'name'), 'renamed')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith(58, { name: 'renamed', roleId: 1 })
    })
    expect(showToast).toHaveBeenCalledWith('success', '修改用户信息成功!', { translate: false })
  })

  it('resets password through a dedicated dialog', async () => {
    const user = userEvent.setup()
    const { showToast } = renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('button', { name: '重置密码' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(await screen.findByText('密码不能为空！')).toBeInTheDocument()
    await user.type(dialog.querySelector<HTMLInputElement>('#user-reset-password')!, 'new-secret')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(updateUserPasswordMock).toHaveBeenCalledWith(58, { password: 'new-secret' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '修改密码成功！', { translate: false })
  })

  it('protects user 58 from delete before calling the API', async () => {
    const user = userEvent.setup()
    const { confirm, showToast } = renderUsersList()

    await screen.findByText('admin')
    await user.click(screen.getByRole('button', { name: '删除用户' }))

    expect(deleteUserMock).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('error', '删除用户失败！', { translate: false })
  })

  it('confirms before deleting non-protected users', async () => {
    listUsersMock.mockResolvedValueOnce({
      rows: [{ ...USER_ROW, id: 59, name: 'operator', roleId: 2 }],
      total: 1,
    })
    const user = userEvent.setup()
    const { confirm, showToast } = renderUsersList()

    await screen.findByText('operator')
    await user.click(screen.getByRole('button', { name: '删除用户' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除用户', variant: 'destructive' }))
      expect(deleteUserMock).toHaveBeenCalledWith(59)
    })
    expect(showToast).toHaveBeenCalledWith('success', '删除用户成功！', { translate: false })
  })

  it('renders the empty state', async () => {
    listUsersMock.mockResolvedValueOnce({ rows: [], total: 0 })
    renderUsersList()

    expect(await screen.findByText('暂无用户')).toBeInTheDocument()
  })
})
