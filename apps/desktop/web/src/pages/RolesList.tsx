import { Eye, Pencil, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  assignRoleMenus,
  createRole,
  deleteRole,
  getRole,
  getRoleMenuIds,
  listMenuTree,
  listRoles,
  updateRole,
  type LegacyRole,
  type RoleListParams,
  type RoleMutationPayload,
} from '@/api/roles'
import { normalizeMenuTree, type MenuTreeItem } from '@/api/menus'
import { InlineLoader } from '@/components/PageLoader'
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
import { FilterBar, FilterField } from '@/components/layout/FilterBar'
import { FormField, FormSection, TreeIndent } from '@/components/layout/FormScaffold'
import { PageShell } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDetailDialog } from '@/lib/use-detail-dialog'
import { useMutationAction } from '@/lib/use-mutation-action'
import { usePaginatedResource } from '@/lib/use-paginated-resource'
import { useResource } from '@/lib/use-resource'

type RoleFormMode = 'create' | 'edit' | 'view'

interface RoleFilterDraft {
  name: string
  intro: string
  createAt: DateRangeValue
}

interface RoleFormDialogProps {
  mode: RoleFormMode
  open: boolean
  role?: LegacyRole | null
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: RoleMutationPayload) => Promise<void>
}

interface AssignMenusDialogProps {
  open: boolean
  role?: LegacyRole | null
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (menuIds: number[]) => Promise<void>
}

const PAGE_SIZE = 10

const TITLE_BY_MODE: Record<RoleFormMode, string> = {
  create: '新建角色',
  edit: '编辑角色',
  view: '查看角色',
}

function emptyFilters(): RoleFilterDraft {
  return {
    name: '',
    intro: '',
    createAt: { from: '', to: '' },
  }
}

function toAppliedFilters(draft: RoleFilterDraft): Pick<RoleListParams, 'name' | 'intro' | 'createAt'> {
  return {
    name: draft.name.trim(),
    intro: draft.intro.trim(),
    createAt: draft.createAt.from && draft.createAt.to ? [draft.createAt.from, draft.createAt.to] : undefined,
  }
}

function collectMenuIds(nodes: MenuTreeItem[]): number[] {
  return nodes.flatMap((node) => [node.id, ...collectMenuIds(node.children)])
}

function RoleFormDialog({ mode, open, role, submitting = false, onOpenChange, onSubmit }: RoleFormDialogProps) {
  const [name, setName] = useState('')
  const [intro, setIntro] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'name' | 'intro', string>>>({})
  const readonly = mode === 'view'

  useEffect(() => {
    if (!open) return
    setName(role?.name ?? '')
    setIntro(role?.intro ?? '')
    setErrors({})
  }, [open, role])

  const handleSubmit = async () => {
    const nextErrors: Partial<Record<'name' | 'intro', string>> = {}
    if (!name.trim()) nextErrors.name = '角色名不能为空！'
    if (!intro.trim()) nextErrors.intro = '权限介绍不能为空！'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    await onSubmit({ name: name.trim(), intro: intro.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE_BY_MODE[mode]}</DialogTitle>
          <DialogDescription>
            字段和必填规则按旧 adminYh 角色弹窗迁移；菜单授权走独立分配入口。
          </DialogDescription>
        </DialogHeader>

        <FormSection>
          <FormField htmlFor="role-name" label="角色名" required error={errors.name}>
            <Input
              id="role-name"
              value={name}
              placeholder="请输入角色名"
              disabled={readonly}
              onChange={(event) => {
                setName(event.target.value)
                setErrors((current) => ({ ...current, name: undefined }))
              }}
            />
          </FormField>
          <FormField htmlFor="role-intro" label="权限介绍" required error={errors.intro}>
            <Input
              id="role-intro"
              value={intro}
              placeholder="请输入权限介绍"
              disabled={readonly}
              onChange={(event) => {
                setIntro(event.target.value)
                setErrors((current) => ({ ...current, intro: undefined }))
              }}
            />
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

function AssignMenusDialog({ open, role, submitting = false, onOpenChange, onSubmit }: AssignMenusDialogProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const menuTreeResource = useResource(listMenuTree, [open])
  const roleMenuResource = useResource(() => (role ? getRoleMenuIds(role.id) : Promise.resolve(null)), [open, role?.id])
  const menuTree = useMemo(() => normalizeMenuTree(menuTreeResource.data ?? []), [menuTreeResource.data])

  useEffect(() => {
    if (!open) return
    setSelectedIds(roleMenuResource.data?.menuIds ?? [])
  }, [open, roleMenuResource.data])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggleNode = (node: MenuTreeItem, checked: boolean) => {
    const ids = collectMenuIds([node])
    setSelectedIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return Array.from(next).sort((left, right) => left - right)
    })
  }

  const renderMenuNode = (node: MenuTreeItem, depth = 0) => {
    const childIds = collectMenuIds(node.children)
    const checked = selectedSet.has(node.id)
    const childCheckedCount = childIds.filter((id) => selectedSet.has(id)).length
    const partial = !checked && childCheckedCount > 0

    return (
      <div key={node.id} className="space-y-1">
        <TreeIndent
          as="label"
          depth={depth}
          base={8}
          className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted/70"
        >
          <Checkbox
            checked={checked || partial ? true : false}
            aria-label={`选择菜单 ${node.name}`}
            onCheckedChange={(value) => toggleNode(node, Boolean(value))}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.url ? <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{node.url}</span> : null}
        </TreeIndent>
        {node.children.length ? <div className="space-y-1">{node.children.map((child) => renderMenuNode(child, depth + 1))}</div> : null}
      </div>
    )
  }

  const loading = (menuTreeResource.loading && !menuTreeResource.data) || (roleMenuResource.loading && !roleMenuResource.data)
  const error = menuTreeResource.error || roleMenuResource.error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>分配权限</DialogTitle>
          <DialogDescription>
            当前角色：{role?.name ?? '-'}。保存时提交旧接口字段 roleId 和 menuList，并由后端幂等替换 role_permission。
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <ErrorState message={error} onRetry={() => {
            menuTreeResource.refresh()
            roleMenuResource.refresh()
          }} />
        ) : loading ? (
          <div className="flex h-56 items-center justify-center">
            <InlineLoader />
          </div>
        ) : menuTree.length ? (
          <div className="max-h-[420px] overflow-y-auto rounded-lg border bg-background p-2">
            {menuTree.map((node) => renderMenuNode(node))}
          </div>
        ) : (
          <EmptyState title="暂无菜单" description="旧 /menu/tree 未返回可分配菜单。" />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" className="gap-2" disabled={submitting || loading || Boolean(error)} onClick={() => onSubmit(selectedIds)}>
            <Save className="h-4 w-4" />
            {submitting ? '提交中...' : '保存权限'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function RolesList() {
  const {
    close: closeDialog,
    detail: selectedRole,
    mode: dialogMode,
    onOpenChange: handleDialogOpenChange,
    open: dialogOpen,
    openCreate: openCreateDialog,
    openDetail: openRoleDialog,
    setDetail: setSelectedRole,
  } = useDetailDialog<LegacyRole, LegacyRole, RoleFormMode, null>({
    createMode: 'create',
    emptyDetail: null,
    fallbackMessage: '角色详情加载失败',
    loadDetail: (role) => getRole(role.id),
  })
  const { pending: submitting, runMutation, runConfirmedMutation } = useMutationAction()
  const [filterDraft, setFilterDraft] = useState<RoleFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<Pick<RoleListParams, 'name' | 'intro' | 'createAt'>>({})
  const [assignOpen, setAssignOpen] = useState(false)

  const { data, loading, error, refresh, page, pageSize, setPage, rows, pagination } = usePaginatedResource({
    pageSize: PAGE_SIZE,
    queryDeps: [filters],
    buildQuery: ({ page, pageSize }) => ({ page, pageSize, ...filters }),
    fetcher: listRoles,
  })

  const applyFilters = () => {
    setPage(1)
    setFilters(toAppliedFilters(filterDraft))
  }

  const resetFilters = () => {
    setFilterDraft(emptyFilters())
    setFilters({})
    setPage(1)
  }

  const submitRole = async (values: RoleMutationPayload) => {
    const roleId = dialogMode === 'edit' ? selectedRole?.id : undefined
    await runMutation(
      () => (roleId ? updateRole(roleId, values) : createRole(values)),
      {
        successMessage: roleId ? '修改角色信息成功!' : '创建权限角色成功！',
        errorMessage: '角色保存失败',
        onSuccess: () => {
          closeDialog()
          refresh()
        },
      },
    )
  }

  const removeRole = async (role: LegacyRole) => {
    await runConfirmedMutation(
      () => deleteRole(role.id),
      {
        confirm: {
          title: '删除角色',
          description: `确认删除角色 ${role.name}？该操作会同时清理角色菜单关系。`,
          confirmText: '删除',
          variant: 'destructive',
        },
        successMessage: '删除权限角色成功！',
        errorMessage: '角色删除失败',
        onSuccess: refresh,
      },
    )
  }

  const openAssignDialog = (role: LegacyRole) => {
    setSelectedRole(role)
    setAssignOpen(true)
  }

  const submitAssignedMenus = async (menuIds: number[]) => {
    if (!selectedRole) return
    const roleId = selectedRole.id
    await runMutation(
      () => assignRoleMenus({ roleId, menuList: menuIds }),
      {
        successMessage: '分配权限成功！',
        errorMessage: '权限分配失败',
        onSuccess: () => setAssignOpen(false),
      },
    )
  }

  return (
    <PageShell
      title="角色权限"
      description="按旧 adminYh 角色模块重建角色 CRUD 和菜单授权，接口统一走角色 API 封装。"
      width="7xl"
      actions={
        <>
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建角色
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
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
        <FilterField label="角色名">
          <Input
            aria-label="角色名"
            value={filterDraft.name}
            placeholder="按角色名筛选"
            onChange={(event) => setFilterDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </FilterField>
        <FilterField label="权限介绍">
          <Input
            aria-label="权限介绍"
            value={filterDraft.intro}
            placeholder="按权限介绍筛选"
            onChange={(event) => setFilterDraft((current) => ({ ...current, intro: event.target.value }))}
          />
        </FilterField>
        <FilterField label="创建时间">
          <DateRangePicker value={filterDraft.createAt} onChange={(createAt) => setFilterDraft((current) => ({ ...current, createAt }))} />
        </FilterField>
      </FilterBar>

      <DataTableSurface
        title="角色列表"
        description="保留旧字段 name、intro、createAt、updateAt；菜单授权通过 /role/assign 幂等替换。"
        error={error}
        loading={loading && !data}
        isEmpty={!rows.length}
        emptyTitle="暂无角色"
        emptyDescription="当前筛选没有匹配旧角色数据。"
        onRetry={refresh}
        pagination={pagination}
        emptyActions={
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建角色
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <DataTableRowNumberHead />
              <StickyActionHead className="min-w-[180px]" />
              <TableHead className="min-w-[160px]">角色名</TableHead>
              <TableHead className="min-w-[220px]">权限介绍</TableHead>
              <TableHead className="min-w-[220px]">创建时间</TableHead>
              <TableHead className="min-w-[220px]">更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <DataTableRowNumberCell value={(page - 1) * pageSize + index + 1} />
                <StickyActionCell>
                  <DataTableActionGroup>
                    <DataTableIconAction label="查看角色" icon={Eye} onClick={() => openRoleDialog('view', row)} />
                    <DataTableIconAction label="编辑角色" icon={Pencil} onClick={() => openRoleDialog('edit', row)} />
                    <DataTableIconAction label="分配权限" icon={ShieldCheck} onClick={() => openAssignDialog(row)} />
                    <DataTableIconAction label="删除角色" icon={Trash2} destructive onClick={() => removeRole(row)} />
                  </DataTableActionGroup>
                </StickyActionCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="max-w-[18rem] truncate">
                    {row.intro}
                  </Badge>
                </TableCell>
                <DataTableDateCell value={row.createAt} />
                <DataTableDateCell value={row.updateAt} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>

      <RoleFormDialog
        mode={dialogMode}
        open={dialogOpen}
        role={selectedRole}
        submitting={submitting}
        onOpenChange={handleDialogOpenChange}
        onSubmit={submitRole}
      />
      <AssignMenusDialog
        open={assignOpen}
        role={selectedRole}
        submitting={submitting}
        onOpenChange={setAssignOpen}
        onSubmit={submitAssignedMenus}
      />
    </PageShell>
  )
}
