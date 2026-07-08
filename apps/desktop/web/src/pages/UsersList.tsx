import { Eye, KeyRound, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { listAssignableRoles, type LegacyRole } from '@/api/roles'
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
  updateUserPassword,
  type LegacyUserDetail,
  type LegacyUserListItem,
  type UserCreatePayload,
  type UserListFilters,
  type UserUpdatePayload,
} from '@/api/users'
import {
  DataTableActionGroup,
  DataTableDateCell,
  DataTableIconAction,
  DataTableRowNumberCell,
  DataTableRowNumberHead,
  DataTableSurface,
  StickyActionCell,
  StickyActionHead,
} from '@/components/layout/DataTableSurface'
import { FilterBar, FilterField, SelectFilterField } from '@/components/layout/FilterBar'
import { FormField, FormSection } from '@/components/layout/FormScaffold'
import { HeaderActionButton } from '@/components/layout/HeaderActionButton'
import { PageShell } from '@/components/layout/PageScaffold'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useDetailDialog } from '@/lib/use-detail-dialog'
import { useMutationAction } from '@/lib/use-mutation-action'
import { usePaginatedResource } from '@/lib/use-paginated-resource'
import { useResource } from '@/lib/use-resource'

type UserFormMode = 'create' | 'edit' | 'view'

interface UserFilterDraft {
  name: string
  roleId: string
  enable: string
  createAt: DateRangeValue
}

interface UserFormValues {
  name: string
  password: string
  roleId: string
}

interface UserFormDialogProps {
  mode: UserFormMode
  open: boolean
  user?: LegacyUserDetail | null
  roles: LegacyRole[]
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (values: UserCreatePayload) => Promise<void>
  onUpdate: (values: UserUpdatePayload) => Promise<void>
}

interface PasswordDialogProps {
  open: boolean
  user?: LegacyUserListItem
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (password: string) => Promise<void>
}

const PAGE_SIZE = 10
const ANY_VALUE = '__any__'

const TITLE_BY_MODE: Record<UserFormMode, string> = {
  create: '新建用户',
  edit: '编辑用户',
  view: '查看用户',
}

function emptyFilters(): UserFilterDraft {
  return {
    name: '',
    roleId: '',
    enable: '',
    createAt: { from: '', to: '' },
  }
}

function toAppliedFilters(draft: UserFilterDraft): UserListFilters {
  return {
    name: draft.name.trim(),
    roleId: draft.roleId ? Number(draft.roleId) : undefined,
    enable: draft.enable ? Number(draft.enable) : undefined,
    createAt: draft.createAt.from && draft.createAt.to ? [draft.createAt.from, draft.createAt.to] : undefined,
  }
}

function detailToFormValues(user?: LegacyUserDetail | null): UserFormValues {
  return {
    name: user?.name ?? '',
    password: '',
    roleId: user?.role.id ? String(user.role.id) : '',
  }
}

function roleName(roleId: number, roles: LegacyRole[]) {
  return roles.find((role) => role.id === roleId)?.name || (roleId === 1 ? '管理员' : roleId === 2 ? '普通用户' : `角色 ${roleId}`)
}

function UserFormDialog({
  mode,
  open,
  user,
  roles,
  submitting = false,
  onOpenChange,
  onCreate,
  onUpdate,
}: UserFormDialogProps) {
  const [values, setValues] = useState<UserFormValues>(() => detailToFormValues())
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormValues, string>>>({})
  const readonly = mode === 'view'

  useEffect(() => {
    if (!open) return
    setValues(detailToFormValues(user))
    setErrors({})
  }, [open, user])

  const updateValue = (key: keyof UserFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const handleSubmit = async () => {
    const nextErrors: Partial<Record<keyof UserFormValues, string>> = {}
    if (!values.name.trim()) nextErrors.name = '用户名不能为空！'
    if (mode === 'create' && !values.password) nextErrors.password = '密码不能为空！'
    if (!values.roleId) nextErrors.roleId = '权限角色不能为空！'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    if (mode === 'create') {
      await onCreate({
        name: values.name.trim(),
        password: values.password,
        roleId: Number(values.roleId),
      })
      return
    }
    await onUpdate({
      name: values.name.trim(),
      roleId: Number(values.roleId),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE_BY_MODE[mode]}</DialogTitle>
          <DialogDescription>
            字段和必填规则按旧 adminYh 用户弹窗迁移；编辑用户不提交密码，改密走独立接口。
          </DialogDescription>
        </DialogHeader>

        <FormSection>
          <FormField htmlFor="user-name" label="用户名" required error={errors.name}>
            <Input
              id="user-name"
              value={values.name}
              placeholder="请输入用户名"
              disabled={readonly}
              onChange={(event) => updateValue('name', event.target.value)}
            />
          </FormField>

          {mode === 'create' ? (
            <FormField htmlFor="user-password" label="用户密码" required error={errors.password}>
              <Input
                id="user-password"
                type="password"
                value={values.password}
                placeholder="请输入密码"
                disabled={readonly}
                onChange={(event) => updateValue('password', event.target.value)}
              />
            </FormField>
          ) : null}

          <FormField label="选择角色" required error={errors.roleId}>
            <Select
              value={values.roleId || ANY_VALUE}
              onValueChange={(value) => updateValue('roleId', value === ANY_VALUE ? '' : value)}
              disabled={readonly}
            >
              <SelectTrigger aria-label="选择角色">
                <SelectValue placeholder="请选择角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>请选择角色</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </FormSection>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {readonly ? '关闭' : '取消'}
          </Button>
          {!readonly ? (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中...' : '保存'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasswordDialog({
  open,
  user,
  submitting = false,
  onOpenChange,
  onSubmit,
}: PasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPassword('')
    setError('')
  }, [open])

  const handleSubmit = async () => {
    if (!password) {
      setError('密码不能为空！')
      return
    }
    await onSubmit(password)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
          <DialogDescription>
            为用户 {user?.name || '-'} 设置新密码；仅提交到旧兼容改密接口，不写入本地存储。
          </DialogDescription>
        </DialogHeader>
        <FormSection>
          <FormField htmlFor="user-reset-password" label="新密码" required error={error}>
            <Input
              id="user-reset-password"
              type="password"
              value={password}
              placeholder="请输入新密码"
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
            />
          </FormField>
        </FormSection>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '提交中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function UsersList() {
  const { showToast } = useGlobalToast()
  const { pending: submitting, runMutation, runConfirmedMutation } = useMutationAction()
  const [draft, setDraft] = useState<UserFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<UserListFilters>({})
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [passwordUser, setPasswordUser] = useState<LegacyUserListItem | undefined>()

  const { data, loading, error, refresh, page, pageSize, setPage, rows, pagination } = usePaginatedResource({
    pageSize: PAGE_SIZE,
    queryDeps: [filters],
    buildQuery: ({ page, pageSize }) => ({ page, pageSize, ...filters }),
    fetcher: listUsers,
  })
  const { data: rawRoleOptions, error: roleError, refresh: refreshRoles } = useResource(listAssignableRoles, [])
  const roleOptions = rawRoleOptions ?? []
  const {
    close: closeDialog,
    detail: selectedUser,
    mode: dialogMode,
    onOpenChange: handleDialogOpenChange,
    open: dialogOpen,
    openCreate: openCreateDialog,
    openDetail: openUserDialog,
  } = useDetailDialog<LegacyUserListItem, LegacyUserDetail, UserFormMode, null>({
    createMode: 'create',
    emptyDetail: null,
    fallbackMessage: '用户详情加载失败',
    loadDetail: (user) => getUser(user.id),
    seedDetail: (user) => ({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      enable: user.enable,
      createAt: user.createAt,
      updateAt: user.updateAt,
      role: {
        id: user.roleId,
        name: roleName(user.roleId, roleOptions),
        intro: '',
        createAt: '',
        updateAt: '',
      },
    }),
  })

  const updateDraft = <K extends keyof UserFilterDraft>(key: K, value: UserFilterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const applyFilters = () => {
    setPage(1)
    setFilters(toAppliedFilters(draft))
  }

  const resetFilters = () => {
    setDraft(emptyFilters())
    setPage(1)
    setFilters({})
  }

  const submitCreate = async (values: UserCreatePayload) => {
    await runMutation(() => createUser(values), {
      successMessage: '创建用户成功！',
      errorMessage: '用户保存失败',
      onSuccess: () => {
        closeDialog()
        refresh()
      },
    })
  }

  const submitUpdate = async (values: UserUpdatePayload) => {
    if (!selectedUser) return
    await runMutation(() => updateUser(selectedUser.id, values), {
      successMessage: '修改用户信息成功!',
      errorMessage: '用户保存失败',
      onSuccess: () => {
        closeDialog()
        refresh()
      },
    })
  }

  const openPasswordDialog = (user: LegacyUserListItem) => {
    setPasswordUser(user)
    setPasswordDialogOpen(true)
  }

  const submitPassword = async (password: string) => {
    if (!passwordUser) return
    await runMutation(() => updateUserPassword(passwordUser.id, { password }), {
      successMessage: '修改密码成功！',
      errorMessage: '密码修改失败',
      onSuccess: () => setPasswordDialogOpen(false),
    })
  }

  const removeUser = async (user: LegacyUserListItem) => {
    if (user.id === 58) {
      showToast('error', '删除用户失败！', { translate: false })
      return
    }

    await runConfirmedMutation(() => deleteUser(user.id), {
      confirm: {
        title: '删除用户',
        description: `确认删除用户 ${user.name}？用户 58 为旧系统保护账号，不允许删除。`,
        confirmText: '删除',
        variant: 'destructive',
      },
      successMessage: '删除用户成功！',
      errorMessage: '用户删除失败',
      onSuccess: refresh,
    })
  }

  return (
    <PageShell
      title="用户管理"
      description="维护账号、角色、启停状态、头像展示和独立改密。"
      width="full"
      actions={
        <>
          <HeaderActionButton type="button" icon={Plus} label="新建用户" onClick={openCreateDialog} />
          <HeaderActionButton
            type="button"
            variant="outline"
            icon={RefreshCw}
            iconClassName={loading ? 'animate-spin' : undefined}
            label="刷新"
            onClick={() => { refresh(); refreshRoles() }}
            disabled={loading}
          />
        </>
      }
    >
      <FilterBar
        onReset={resetFilters}
        actions={
          <Button type="button" size="sm" className="gap-2" onClick={applyFilters}>
            <Search className="h-4 w-4" />
            查询
          </Button>
        }
      >
        <FilterField label="用户名">
          <Input aria-label="用户名" value={draft.name} placeholder="请输入用户名" onChange={(event) => updateDraft('name', event.target.value)} />
        </FilterField>
        <SelectFilterField
          label="权限名称"
          value={draft.roleId}
          allValue={ANY_VALUE}
          options={roleOptions.map((role) => ({ value: String(role.id), label: role.name }))}
          onValueChange={(value) => updateDraft('roleId', value)}
        />
        <SelectFilterField
          label="用户状态"
          value={draft.enable}
          allValue={ANY_VALUE}
          options={[
            { value: '1', label: '启用' },
            { value: '0', label: '禁用' },
          ]}
          onValueChange={(value) => updateDraft('enable', value)}
        />
        <FilterField label="创建时间">
          <DateRangePicker value={draft.createAt} onChange={(value) => updateDraft('createAt', value)} />
        </FilterField>
      </FilterBar>

      {roleError ? <ErrorState message={roleError} onRetry={refreshRoles} /> : null}

      <DataTableSurface
        title="用户列表"
        description="保留旧字段 name、roleId、avatarUrl、enable、createAt、updateAt；启用状态本阶段只展示和筛选，不提供假开关。"
        error={error}
        loading={loading && !data}
        isEmpty={!rows.length}
        emptyTitle="暂无用户"
        emptyDescription="调整筛选条件后重新查询，或新建用户补充账号。"
        onRetry={refresh}
        pagination={pagination}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <DataTableRowNumberHead />
              <TableHead className="min-w-[120px]">用户名</TableHead>
              <TableHead className="min-w-[120px]">权限身份</TableHead>
              <TableHead className="min-w-[120px]">头像</TableHead>
              <TableHead className="min-w-[100px]">状态</TableHead>
              <TableHead className="min-w-[220px]">创建时间</TableHead>
              <TableHead className="min-w-[220px]">更新时间</TableHead>
              <StickyActionHead className="min-w-[220px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <DataTableRowNumberCell value={(page - 1) * pageSize + index + 1} />
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{roleName(row.roleId, roleOptions)}</TableCell>
                <TableCell>
                  <Avatar className="h-11 w-11 rounded-md">
                    <AvatarImage src={row.avatarUrl} alt={`${row.name} 头像`} />
                    <AvatarFallback className="rounded-md">{row.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </TableCell>
                <TableCell>
                  <Badge variant={row.enable === 1 ? 'default' : 'secondary'}>{row.enable === 1 ? '启用' : '禁用'}</Badge>
                </TableCell>
                <DataTableDateCell value={row.createAt} />
                <DataTableDateCell value={row.updateAt} />
                <StickyActionCell>
                  <DataTableActionGroup>
                    <DataTableIconAction label="查看用户" icon={Eye} onClick={() => openUserDialog('view', row)} />
                    <DataTableIconAction label="编辑用户" icon={Pencil} onClick={() => openUserDialog('edit', row)} />
                    <DataTableIconAction label="重置密码" icon={KeyRound} onClick={() => openPasswordDialog(row)} />
                    <DataTableIconAction label="删除用户" icon={Trash2} destructive onClick={() => removeUser(row)} />
                  </DataTableActionGroup>
                </StickyActionCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>

      <UserFormDialog
        mode={dialogMode}
        open={dialogOpen}
        user={selectedUser}
        roles={roleOptions}
        submitting={submitting}
        onOpenChange={handleDialogOpenChange}
        onCreate={submitCreate}
        onUpdate={submitUpdate}
      />
      <PasswordDialog
        open={passwordDialogOpen}
        user={passwordUser}
        submitting={submitting}
        onOpenChange={setPasswordDialogOpen}
        onSubmit={submitPassword}
      />
    </PageShell>
  )
}
