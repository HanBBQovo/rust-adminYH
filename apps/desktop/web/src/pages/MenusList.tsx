import { FolderTree, Plus, RefreshCw, Save, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  buildMenuCreatePayload,
  createMenu,
  flattenMenuTree,
  listMenuTree,
  normalizeMenuTree,
  type MenuCreateFormValues,
  type MenuCreatePayload,
  type MenuTreeItem,
} from '@/api/menus'
import { InlineLoader } from '@/components/PageLoader'
import { FormField, FormSection } from '@/components/layout/FormScaffold'
import { PageShell, PageSurface, PageStat, PageStatStrip } from '@/components/layout/PageScaffold'
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
import { EmptyState } from '@/components/ui/empty-state'
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
import { useResource } from '@/lib/use-resource'

interface MenuFormDialogProps {
  open: boolean
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

function MenuFormDialog({ open, rootMenus, submitting = false, onOpenChange, onSubmit }: MenuFormDialogProps) {
  const [values, setValues] = useState<MenuCreateFormValues>(() => emptyFormValues())
  const [errors, setErrors] = useState<Partial<Record<keyof MenuCreateFormValues, string>>>({})
  const isChildMenu = values.type === '2'

  useEffect(() => {
    if (!open) return
    setValues(emptyFormValues())
    setErrors({})
  }, [open])

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
          <DialogTitle>创建菜单</DialogTitle>
          <DialogDescription>
            第一阶段保留旧 adminYh 创建菜单入口，只提交 name、type、url、icon、sort、parentId。
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
                  {rootMenus.map((menu) => (
                    <SelectItem key={menu.id} value={String(menu.id)}>
                      {menu.name}
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
  const { showToast } = useGlobalToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { data, loading, error, refresh } = useResource(listMenuTree)
  const tree = useMemo(() => normalizeMenuTree(data ?? []), [data])
  const flatRows = useMemo(() => flattenMenuTree(tree), [tree])
  const rootMenus = useMemo(() => tree.filter((node) => node.type === 1), [tree])
  const childCount = flatRows.filter((node) => node.depth > 0).length

  const submitMenu = async (values: MenuCreatePayload) => {
    setSubmitting(true)
    try {
      await createMenu(values)
      showToast('success', '创建菜单成功！', { translate: false })
      setDialogOpen(false)
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '菜单创建失败', { translate: false })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell
      title="菜单管理"
      description="按旧 adminYh 菜单模块重建菜单树展示和新增菜单入口，接口统一走菜单 API 封装。"
      width="7xl"
      actions={
        <>
          <Button type="button" className="gap-2" onClick={() => setDialogOpen(true)}>
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

      <PageSurface
        title="菜单列表"
        description="保留旧字段 name、type、url、icon、sort、permission、createAt、updateAt；同时兼容 children 和旧 typo chilren。"
        bodyClassName="p-0"
      >
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <InlineLoader />
          </div>
        ) : flatRows.length ? (
          <div className="ops-table-shell">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-right">ID</TableHead>
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
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{row.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2" style={{ paddingLeft: `${row.depth * 20}px` }}>
                        <FolderTree className="h-4 w-4 text-primary" />
                        <span className="font-medium">{row.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{menuTypeLabel(row.type)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.url || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.icon || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.permission || '-'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{row.sort}</TableCell>
                    <TableCell className="font-mono text-xs">{row.createAt || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.updateAt || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title="暂无菜单"
              description="旧 /menu/tree 未返回菜单树。"
              actions={
                <Button type="button" className="gap-2" onClick={() => setDialogOpen(true)}>
                  <Search className="h-4 w-4" />
                  创建菜单
                </Button>
              }
            />
          </div>
        )}
      </PageSurface>

      <MenuFormDialog
        open={dialogOpen}
        rootMenus={rootMenus}
        submitting={submitting}
        onOpenChange={setDialogOpen}
        onSubmit={submitMenu}
      />
    </PageShell>
  )
}
