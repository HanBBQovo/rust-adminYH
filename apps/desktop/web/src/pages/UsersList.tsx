import { Eye, KeyRound, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

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
  type UserListParams,
  type UserUpdatePayload,
} from '@/api/users'
import { DataTableSurface, StickyActionCell, StickyActionHead } from '@/components/layout/DataTableSurface'
import { FilterBar, FilterField } from '@/components/layout/FilterBar'
import { FormField, FormSection } from '@/components/layout/FormScaffold'
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
import { useConfirm } from '@/components/ui/use-confirm'
import { useGlobalToast } from '@/components/ui/use-global-toast'
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
  const confirm = useConfirm()
  const { showToast } = useGlobalToast()
  const [draft, setDraft] = useState<UserFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<UserListFilters>({})
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<UserFormMode>('create')
  const [selectedUser, setSelectedUser] = useState<LegacyUserDetail | null>()
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [passwordUser, setPasswordUser] = useState<LegacyUserListItem | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const query = useMemo<UserListParams>(() => ({ page, pageSize: PAGE_SIZE, ...filters }), [filters, page])
  const { data, loading, error, refresh } = useResource(() => listUsers(query), [query])
  const { data: rawRoleOptions, error: roleError, refresh: refreshRoles } = useResource(listAssignableRoles, [])
  const roleOptions = rawRoleOptions ?? []
  const rows = data?.rows ?? []
  const total = data?.total ?? 0

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

  const openCreateDialog = () => {
    setSelectedUser(null)
    setDialogMode('create')
    setDialogOpen(true)
  }

  const openUserDialog = async (mode: Extract<UserFormMode, 'edit' | 'view'>, user: LegacyUserListItem) => {
    setDialogMode(mode)
    setSelectedUser({
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
    })
    setDialogOpen(true)
    try {
      const detail = await getUser(user.id)
      if (detail) setSelectedUser(detail)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '用户详情加载失败', { translate: false })
    }
  }

  const submitCreate = async (values: UserCreatePayload) => {
    setSubmitting(true)
    try {
      await createUser(values)
      showToast('success', '创建用户成功！', { translate: false })
      setDialogOpen(false)
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '用户保存失败', { translate: false })
    } finally {
      setSubmitting(false)
    }
  }

  const submitUpdate = async (values: UserUpdatePayload) => {
    if (!selectedUser) return
    setSubmitting(true)
    try {
      await updateUser(selectedUser.id, values)
      showToast('success', '修改用户信息成功!', { translate: false })
      setDialogOpen(false)
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '用户保存失败', { translate: false })
    } finally {
      setSubmitting(false)
    }
  }

  const openPasswordDialog = (user: LegacyUserListItem) => {
    setPasswordUser(user)
    setPasswordDialogOpen(true)
  }

  const submitPassword = async (password: string) => {
    if (!passwordUser) return
    setSubmitting(true)
    try {
      await updateUserPassword(passwordUser.id, { password })
      showToast('success', '修改密码成功！', { translate: false })
      setPasswordDialogOpen(false)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '密码修改失败', { translate: false })
    } finally {
      setSubmitting(false)
    }
  }

  const removeUser = async (user: LegacyUserListItem) => {
    if (user.id === 58) {
      showToast('error', '删除用户失败！', { translate: false })
      return
    }

    const confirmed = await confirm({
      title: '删除用户',
      description: `确认删除用户 ${user.name}？用户 58 为旧系统保护账号，不允许删除。`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await deleteUser(user.id)
      showToast('success', '删除用户成功！', { translate: false })
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '用户删除失败', { translate: false })
    }
  }

  return (
    <PageShell
      title="用户管理"
      description="按旧 adminYh 用户模块重建列表、筛选、分页、头像展示、用户维护和独立改密；头像上传不在本切片处理。"
      width="full"
      actions={
        <>
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建用户
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => { refresh(); refreshRoles() }} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
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
        <FilterField label="权限名称">
          <Select value={draft.roleId || ANY_VALUE} onValueChange={(value) => updateDraft('roleId', value === ANY_VALUE ? '' : value)}>
            <SelectTrigger aria-label="权限名称">
              <SelectValue placeholder="请选择权限名称" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>全部</SelectItem>
              {roleOptions.map((role) => (
                <SelectItem key={role.id} value={String(role.id)}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="用户状态">
          <Select value={draft.enable || ANY_VALUE} onValueChange={(value) => updateDraft('enable', value === ANY_VALUE ? '' : value)}>
            <SelectTrigger aria-label="用户状态">
              <SelectValue placeholder="请选择用户状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>全部</SelectItem>
              <SelectItem value="1">启用</SelectItem>
              <SelectItem value="0">禁用</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
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
        pagination={data ? { page, pageSize: PAGE_SIZE, total, onPageChange: setPage } : undefined}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-right">序号</TableHead>
              <StickyActionHead className="min-w-[220px]" />
              <TableHead className="min-w-[120px]">用户名</TableHead>
              <TableHead className="min-w-[120px]">权限身份</TableHead>
              <TableHead className="min-w-[120px]">头像</TableHead>
              <TableHead className="min-w-[100px]">状态</TableHead>
              <TableHead className="min-w-[220px]">创建时间</TableHead>
              <TableHead className="min-w-[220px]">更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</TableCell>
                <StickyActionCell>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label="查看用户" onClick={() => openUserDialog('view', row)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="编辑用户" onClick={() => openUserDialog('edit', row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="重置密码" onClick={() => openPasswordDialog(row)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="删除用户" onClick={() => removeUser(row)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </StickyActionCell>
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
                <TableCell className="font-mono text-xs">{row.createAt || '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.updateAt || '-'}</TableCell>
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
        onOpenChange={setDialogOpen}
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
