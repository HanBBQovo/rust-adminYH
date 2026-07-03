import { Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  updateCompany,
  type CompanyMutationPayload,
  type LegacyCompany,
} from '@/api/companies'
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
import { FormField, FormSection } from '@/components/layout/FormScaffold'
import { PageShell } from '@/components/layout/PageScaffold'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useConfirm } from '@/components/ui/use-confirm'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useResource } from '@/lib/use-resource'

type CompanyFormMode = 'create' | 'edit' | 'view'

interface CompanyFormDialogProps {
  mode: CompanyFormMode
  open: boolean
  company?: LegacyCompany
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CompanyMutationPayload) => Promise<void>
}

const PAGE_SIZE = 10

const TITLE_BY_MODE: Record<CompanyFormMode, string> = {
  create: '新建发货公司',
  edit: '编辑发货公司',
  view: '查看发货公司',
}

function normalizeCompanyName(name: string) {
  return name.trim()
}

function CompanyFormDialog({
  mode,
  open,
  company,
  submitting = false,
  onOpenChange,
  onSubmit,
}: CompanyFormDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const readonly = mode === 'view'

  useEffect(() => {
    if (!open) return
    setName(company?.name ?? '')
    setError('')
  }, [company, open])

  const handleSubmit = async () => {
    const normalized = normalizeCompanyName(name)
    if (!normalized) {
      setError('发货公司不能为空！')
      return
    }
    await onSubmit({ name: normalized })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{TITLE_BY_MODE[mode]}</DialogTitle>
          <DialogDescription>
            字段和必填规则按旧 adminYh 发货公司弹窗迁移；公司改名不会在前端承诺级联历史订单。
          </DialogDescription>
        </DialogHeader>

        <FormSection>
          <FormField htmlFor="company-name" label="发货公司" required error={error}>
            <Input
              id="company-name"
              value={name}
              placeholder="请输入发货公司"
              disabled={readonly}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
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

export default function CompaniesList() {
  const confirm = useConfirm()
  const { showToast } = useGlobalToast()
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<CompanyFormMode>('create')
  const [selectedCompany, setSelectedCompany] = useState<LegacyCompany | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const query = useMemo(() => ({ page, pageSize: PAGE_SIZE }), [page])
  const { data, loading, error, refresh } = useResource(() => listCompanies(query), [query])
  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  const openCreateDialog = () => {
    setSelectedCompany(undefined)
    setDialogMode('create')
    setDialogOpen(true)
  }

  const openCompanyDialog = async (mode: Extract<CompanyFormMode, 'edit' | 'view'>, company: LegacyCompany) => {
    setDialogMode(mode)
    setSelectedCompany(company)
    setDialogOpen(true)
    try {
      const detail = await getCompany(company.id)
      if (detail) setSelectedCompany(detail)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '发货公司详情加载失败', { translate: false })
    }
  }

  const submitCompany = async (values: CompanyMutationPayload) => {
    setSubmitting(true)
    try {
      if (dialogMode === 'edit' && selectedCompany) {
        await updateCompany(selectedCompany.id, values)
        showToast('success', '修改发货公司成功！', { translate: false })
      } else {
        await createCompany(values)
        showToast('success', '创建发货公司成功！', { translate: false })
      }
      setDialogOpen(false)
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '发货公司保存失败', { translate: false })
    } finally {
      setSubmitting(false)
    }
  }

  const removeCompany = async (company: LegacyCompany) => {
    const confirmed = await confirm({
      title: '删除发货公司',
      description: `确认删除发货公司 ${company.name}？该操作不会在前端承诺级联历史订单。`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await deleteCompany(company.id)
      showToast('success', '删除发货公司成功！', { translate: false })
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '发货公司删除失败', { translate: false })
    }
  }

  return (
    <PageShell
      title="发货公司"
      description="按旧 adminYh 发货公司模块重建列表、分页、查看、新建、编辑和删除，接口统一走公司 API 封装。"
      width="7xl"
      actions={
        <>
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建发货公司
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
        </>
      }
    >
      <DataTableSurface
        title="发货公司列表"
        description="保留旧字段 name、Countorder、createAt、updateAt；公司名称变更不在本阶段级联历史订单文本。"
        error={error}
        loading={loading && !data}
        isEmpty={!rows.length}
        emptyTitle="暂无发货公司"
        emptyDescription="点击新建发货公司补充基础资料。"
        onRetry={refresh}
        pagination={data ? { page, pageSize: PAGE_SIZE, total, onPageChange: setPage } : undefined}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <DataTableRowNumberHead />
              <StickyActionHead className="min-w-[160px]" />
              <TableHead className="min-w-[180px]">发货公司</TableHead>
              <TableHead className="min-w-[120px] text-right">订单数量</TableHead>
              <TableHead className="min-w-[220px]">创建时间</TableHead>
              <TableHead className="min-w-[220px]">更新时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <DataTableRowNumberCell value={(page - 1) * PAGE_SIZE + index + 1} />
                <StickyActionCell>
                  <DataTableActionGroup>
                    <DataTableIconAction label="查看发货公司" icon={Eye} onClick={() => openCompanyDialog('view', row)} />
                    <DataTableIconAction label="编辑发货公司" icon={Pencil} onClick={() => openCompanyDialog('edit', row)} />
                    <DataTableIconAction label="删除发货公司" icon={Trash2} destructive onClick={() => removeCompany(row)} />
                  </DataTableActionGroup>
                </StickyActionCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline">{row.Countorder}</Badge>
                </TableCell>
                <DataTableDateCell value={row.createAt} />
                <DataTableDateCell value={row.updateAt} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>

      <CompanyFormDialog
        mode={dialogMode}
        open={dialogOpen}
        company={selectedCompany}
        submitting={submitting}
        onOpenChange={setDialogOpen}
        onSubmit={submitCompany}
      />
    </PageShell>
  )
}
