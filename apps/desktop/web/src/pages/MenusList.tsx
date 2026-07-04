import { FolderTree, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  buildMenuCreatePayload,
  createMenu,
  deleteMenu,
  flattenMenuTree,
  getMenu,
  listMenuTree,
  normalizeMenuTree,
  type MenuCreateFormValues,
  type MenuCreatePayload,
  type MenuTreeItem,
  updateMenu,
} from '@/api/menus'
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
import { FormField, FormSection, TreeIndent } from '@/components/layout/FormScaffold'
import { PageShell, PageStat, PageStatStrip } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDetailLoader } from '@/lib/use-detail-loader'
import { useMutationAction } from '@/lib/use-mutation-action'
import { useResource } from '@/lib/use-resource'

type MenuFormMode = 'create' | 'edit'

interface MenuFormDialogProps {
  mode: MenuFormMode
  open: boolean
  menu?: MenuTreeItem | null
  rootMenus: MenuTreeItem[]
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MenuCreatePayload) => Promise<void>
}

const ROOT_PARENT_VALUE = '__root__'

function emptyFormValues(): MenuCreateFormValues {
  return {
    name: '',
    type: '1',
    sort: '1',
    url: '',
    icon: '',
    parentId: '',
  }
}

function menuTypeLabel(type: number) {
  return type === 1 ? '一级菜单' : type === 2 ? '子菜单' : `类型 ${type}`
}

function menuToFormValues(menu?: MenuTreeItem | null): MenuCreateFormValues {
  if (!menu) return emptyFormValues()
  return {
    name: menu.name,
    type: String(menu.type),
    sort: String(menu.sort),
    url: menu.url ?? '',
    icon: menu.icon ?? '',
    parentId: menu.parentId ? String(menu.parentId) : '',
  }
}

function MenuFormDialog({ mode, open, menu, rootMenus, submitting = false, onOpenChange, onSubmit }: MenuFormDialogProps) {
  const [values, setValues] = useState<MenuCreateFormValues>(() => menuToFormValues(menu))
  const [errors, setErrors] = useState<Partial<Record<keyof MenuCreateFormValues, string>>>({})
  const isChildMenu = values.type === '2'
  const parentOptions = rootMenus.filter((rootMenu) => rootMenu.id !== menu?.id)

  useEffect(() => {
    if (!open) return
    setValues(menuToFormValues(menu))
    setErrors({})
  }, [menu, open])

  const updateValue = (key: keyof MenuCreateFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const handleSubmit = async () => {
    const nextErrors: Partial<Record<keyof MenuCreateFormValues, string>> = {}
    if (!values.name.trim()) nextErrors.name = '菜单名称不能为空！'
    if (!values.type) nextErrors.type = '类型不能为空！'
    if (!values.sort.trim()) nextErrors.sort = '排序不能为空！'
    if (values.sort.trim() && Number.isNaN(Number(values.sort))) nextErrors.sort = '排序必须是数字！'
    if (isChildMenu && !values.parentId) nextErrors.parentId = '父级菜单不能为空！'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    await onSubmit(buildMenuCreatePayload(values))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '创建菜单' : '编辑菜单'}</DialogTitle>
          <DialogDescription>
            保留旧 adminYh 菜单字段，只提交 name、type、url、icon、sort、parentId。
          </DialogDescription>
        </DialogHeader>

        <FormSection>
          <FormField htmlFor="menu-name" label="菜单名称" required error={errors.name}>
            <Input
              id="menu-name"
              aria-label="菜单名称"
              value={values.name}
              placeholder="请输入菜单名称"
              onChange={(event) => updateValue('name', event.target.value)}
            />
          </FormField>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="类型" required error={errors.type}>
              <Select
                value={values.type}
                onValueChange={(value) => {
                  updateValue('type', value)
                  if (value === '1') updateValue('parentId', '')
                }}
              >
                <SelectTrigger aria-label="类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">一级菜单</SelectItem>
                  <SelectItem value="2">子菜单</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField htmlFor="menu-sort" label="排序" required error={errors.sort}>
              <Input
                id="menu-sort"
                aria-label="排序"
                value={values.sort}
                inputMode="numeric"
                placeholder="请输入排序"
                onChange={(event) => updateValue('sort', event.target.value)}
              />
            </FormField>
          </div>
          {isChildMenu ? (
            <FormField label="父级菜单" required error={errors.parentId}>
              <Select
                value={values.parentId || ROOT_PARENT_VALUE}
                onValueChange={(value) => updateValue('parentId', value === ROOT_PARENT_VALUE ? '' : value)}
              >
                <SelectTrigger aria-label="父级菜单">
                  <SelectValue placeholder="请选择父级菜单" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_PARENT_VALUE}>请选择父级菜单</SelectItem>
                  {parentOptions.map((parent) => (
                    <SelectItem key={parent.id} value={String(parent.id)}>
                      {parent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}
          <FormField htmlFor="menu-url" label="菜单 URL">
            <Input
              id="menu-url"
              aria-label="菜单 URL"
              value={values.url}
              placeholder="/main/system/menu"
              onChange={(event) => updateValue('url', event.target.value)}
            />
          </FormField>
          <FormField htmlFor="menu-icon" label="菜单 icon">
            <Input
              id="menu-icon"
              aria-label="菜单 icon"
              value={values.icon}
              placeholder="ListTree"
              onChange={(event) => updateValue('icon', event.target.value)}
            />
          </FormField>
        </FormSection>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" className="gap-2" onClick={handleSubmit} disabled={submitting}>
            <Save className="h-4 w-4" />
            {submitting ? '提交中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function MenusList() {
  const { loadDetail, resetDetail } = useDetailLoader()
  const { pending: submitting, runMutation, runConfirmedMutation } = useMutationAction()
  const [dialogMode, setDialogMode] = useState<MenuFormMode>('create')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMenu, setSelectedMenu] = useState<MenuTreeItem | null>(null)
  const { data, loading, error, refresh } = useResource(listMenuTree)
  const tree = useMemo(() => normalizeMenuTree(data ?? []), [data])
  const flatRows = useMemo(() => flattenMenuTree(tree), [tree])
  const rootMenus = useMemo(() => tree.filter((node) => node.type === 1), [tree])
  const childCount = flatRows.filter((node) => node.depth > 0).length

  const openCreateDialog = () => {
    resetDetail()
    setDialogMode('create')
    setSelectedMenu(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    resetDetail()
    setDialogOpen(false)
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) resetDetail()
    setDialogOpen(open)
  }

  const openEditDialog = async (menu: MenuTreeItem) => {
    setDialogMode('edit')
    setSelectedMenu(menu)
    setDialogOpen(true)
    await loadDetail(() => getMenu(menu.id), {
      fallbackMessage: '菜单详情加载失败',
      onLoaded: (detail) => setSelectedMenu(normalizeMenuTree([detail])[0] ?? menu),
    })
  }

  const submitMenu = async (values: MenuCreatePayload) => {
    const menuId = dialogMode === 'edit' ? selectedMenu?.id : undefined
    await runMutation(
      () => (menuId ? updateMenu(menuId, values) : createMenu(values)),
      {
        successMessage: menuId ? '修改菜单成功！' : '创建菜单成功！',
        errorMessage: '菜单保存失败',
        onSuccess: () => {
          closeDialog()
          refresh()
        },
      },
    )
  }

  const removeMenu = async (menu: MenuTreeItem) => {
    await runConfirmedMutation(
      () => deleteMenu(menu.id),
      {
        confirm: {
          title: '删除菜单',
          description: `确认删除菜单 ${menu.name}？存在子菜单时后端会拒绝删除，避免破坏权限树。`,
          confirmText: '删除',
          variant: 'destructive',
        },
        successMessage: '删除菜单成功！',
        errorMessage: '菜单删除失败',
        onSuccess: refresh,
      },
    )
  }

  return (
    <PageShell
      title="菜单管理"
      description="按旧 adminYh 菜单模块重建菜单树展示和新增菜单入口，接口统一走菜单 API 封装。"
      width="7xl"
      actions={
        <>
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            创建菜单
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
        </>
      }
    >
      <PageStatStrip>
        <PageStat label="一级菜单" value={rootMenus.length} note="type = 1" />
        <PageStat label="子菜单" value={childCount} note="children/chilren 兼容" />
        <PageStat label="接口" value="/menu/tree" note="新增使用 POST /menu" />
      </PageStatStrip>

      <DataTableSurface
        title="菜单列表"
        description="保留旧字段 name、type、url、icon、sort、permission、createAt、updateAt；同时兼容 children 和旧 typo chilren。"
        error={error}
        loading={loading && !data}
        isEmpty={!flatRows.length}
        emptyTitle="暂无菜单"
        emptyDescription="旧 /menu/tree 未返回菜单树。"
        onRetry={refresh}
        emptyActions={
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            创建菜单
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <DataTableRowNumberHead>ID</DataTableRowNumberHead>
              <StickyActionHead className="min-w-[120px]" />
              <TableHead className="min-w-[220px]">菜单名称</TableHead>
              <TableHead className="min-w-[110px]">类型</TableHead>
              <TableHead className="min-w-[240px]">菜单url</TableHead>
              <TableHead className="min-w-[140px]">菜单icon</TableHead>
              <TableHead className="min-w-[120px]">按钮权限</TableHead>
              <TableHead className="min-w-[90px] text-right">排序</TableHead>
              <TableHead className="min-w-[220px]">创建时间</TableHead>
              <TableHead className="min-w-[220px]">更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flatRows.map((row) => (
              <TableRow key={row.id}>
                <DataTableRowNumberCell value={row.id} />
                <StickyActionCell>
                  <DataTableActionGroup>
                    <DataTableIconAction label="编辑菜单" icon={Pencil} onClick={() => openEditDialog(row)} />
                    <DataTableIconAction label="删除菜单" icon={Trash2} destructive onClick={() => removeMenu(row)} />
                  </DataTableActionGroup>
                </StickyActionCell>
                <TableCell>
                  <TreeIndent depth={row.depth} className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-primary" />
                    <span className="font-medium">{row.name}</span>
                  </TreeIndent>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{menuTypeLabel(row.type)}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.url || '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.icon || '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.permission || '-'}</TableCell>
                <TableCell className="text-right font-mono text-xs">{row.sort}</TableCell>
                <DataTableDateCell value={row.createAt} />
                <DataTableDateCell value={row.updateAt} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>

      <MenuFormDialog
        mode={dialogMode}
        open={dialogOpen}
        menu={selectedMenu}
        rootMenus={rootMenus}
        submitting={submitting}
        onOpenChange={handleDialogOpenChange}
        onSubmit={submitMenu}
      />
    </PageShell>
  )
}
