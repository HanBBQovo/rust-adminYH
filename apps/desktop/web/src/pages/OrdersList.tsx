import { Download, Eye, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  updateOrder,
  type LegacyOrder,
  type OrderListFilters,
  type OrderListParams,
  type OrderMutationPayload,
} from '@/api/orders'
import { InlineLoader } from '@/components/PageLoader'
import { FilterBar, FilterField } from '@/components/layout/FilterBar'
import { PageShell, PageSurface } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useConfirm } from '@/components/ui/use-confirm'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useResource } from '@/lib/use-resource'
import { OrderFormDialog } from '@/pages/orders/OrderFormDialog'
import type { OrderFormMode } from '@/pages/orders/order-form-config'

interface OrderFilterDraft {
  oddnumber: string
  consignee: string
  consigneephone: string
  consignor: string
  consignorphone: string
  number: string
  company: string
  createAt: DateRangeValue
}

interface OrderColumn {
  key: keyof LegacyOrder
  label: string
  className?: string
}

const PAGE_SIZE = 10

const ORDER_COLUMNS: OrderColumn[] = [
  { key: 'oddnumber', label: '运单号', className: 'min-w-[140px] font-mono text-xs' },
  { key: 'billingAt', label: '开单时间', className: 'min-w-[120px]' },
  { key: 'consignee', label: '收货人', className: 'min-w-[100px]' },
  { key: 'consigneephone', label: '收货人号码', className: 'min-w-[120px] font-mono text-xs' },
  { key: 'address', label: '收货地址', className: 'min-w-[180px]' },
  { key: 'method', label: '送货方式', className: 'min-w-[100px]' },
  { key: 'goodsname', label: '货物名称', className: 'min-w-[100px]' },
  { key: 'number', label: '货物数量', className: 'min-w-[100px]' },
  { key: 'pack', label: '货物包装', className: 'min-w-[100px]' },
  { key: 'weight', label: '货物重量(KG)', className: 'min-w-[110px]' },
  { key: 'measurement', label: '货物体积(m³)', className: 'min-w-[120px]' },
  { key: 'cainsurance', label: '是否参保', className: 'min-w-[100px]' },
  { key: 'value', label: '声明价值', className: 'min-w-[100px]' },
  { key: 'insurance', label: '保险费', className: 'min-w-[100px]' },
  { key: 'consignor', label: '发货人', className: 'min-w-[100px]' },
  { key: 'consignorphone', label: '发货人号码', className: 'min-w-[120px] font-mono text-xs' },
  { key: 'freight', label: '运费(元)', className: 'min-w-[100px] text-right' },
  { key: 'delivery', label: '送货费(元)', className: 'min-w-[110px] text-right' },
  { key: 'sumfreight', label: '合计运费(元)', className: 'min-w-[120px] text-right font-medium' },
  { key: 'freightstate', label: '付款方式', className: 'min-w-[100px]' },
  { key: 'paynow', label: '现付(元)', className: 'min-w-[100px] text-right' },
  { key: 'paygo', label: '到付(元)', className: 'min-w-[100px] text-right' },
  { key: 'payback', label: '回付(元)', className: 'min-w-[100px] text-right' },
  { key: 'paymonth', label: '月结(元)', className: 'min-w-[100px] text-right' },
  { key: 'receiptnum', label: '回单数量', className: 'min-w-[100px] text-right' },
  { key: 'company', label: '发货单位', className: 'min-w-[120px]' },
  { key: 'remarks', label: '备注', className: 'min-w-[200px]' },
]

function emptyFilters(): OrderFilterDraft {
  return {
    oddnumber: '',
    consignee: '',
    consigneephone: '',
    consignor: '',
    consignorphone: '',
    number: '',
    company: '',
    createAt: { from: '', to: '' },
  }
}

function toAppliedFilters(draft: OrderFilterDraft): OrderListFilters {
  return {
    oddnumber: draft.oddnumber.trim(),
    consignee: draft.consignee.trim(),
    consigneephone: draft.consigneephone.trim(),
    consignor: draft.consignor.trim(),
    consignorphone: draft.consignorphone.trim(),
    number: draft.number.trim(),
    company: draft.company.trim(),
    createAt: draft.createAt.from && draft.createAt.to ? [draft.createAt.from, draft.createAt.to] : undefined,
  }
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadOrders(rows: LegacyOrder[]) {
  const header = ORDER_COLUMNS.map((column) => column.label).join(',')
  const body = rows
    .map((row) => ORDER_COLUMNS.map((column) => csvEscape(row[column.key])).join(','))
    .join('\n')
  const blob = new Blob([`\ufeff${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function renderCell(row: LegacyOrder, column: OrderColumn) {
  const value = row[column.key]
  if (column.key === 'cainsurance') {
    return <Badge variant={value === '是' ? 'default' : 'secondary'}>{value || '否'}</Badge>
  }
  if (column.key === 'freightstate') {
    return <Badge variant="outline">{value || '-'}</Badge>
  }
  return value === '' || value == null ? '-' : String(value)
}

export default function OrdersList() {
  const confirm = useConfirm()
  const { showToast } = useGlobalToast()
  const [draft, setDraft] = useState<OrderFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<OrderListFilters>({})
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<OrderFormMode>('create')
  const [selectedOrder, setSelectedOrder] = useState<LegacyOrder | undefined>()
  const [submitting, setSubmitting] = useState(false)

  const query = useMemo<OrderListParams>(() => ({ page, pageSize: PAGE_SIZE, ...filters }), [filters, page])
  const { data, loading, error, refresh } = useResource(() => listOrders(query), [query])
  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  const updateDraft = <K extends keyof OrderFilterDraft>(key: K, value: OrderFilterDraft[K]) => {
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
    setSelectedOrder(undefined)
    setDialogMode('create')
    setDialogOpen(true)
  }

  const openOrderDialog = async (mode: Extract<OrderFormMode, 'edit' | 'view'>, order: LegacyOrder) => {
    setDialogMode(mode)
    setSelectedOrder(order)
    setDialogOpen(true)
    try {
      const detail = await getOrder(order.id)
      if (detail) setSelectedOrder(detail)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '订单详情加载失败', { translate: false })
    }
  }

  const submitOrder = async (values: OrderMutationPayload) => {
    setSubmitting(true)
    try {
      if (dialogMode === 'edit' && selectedOrder) {
        await updateOrder(selectedOrder.id, values)
        showToast('success', '修改订单信息成功！', { translate: false })
      } else {
        await createOrder(values)
        showToast('success', '创建订单成功！', { translate: false })
      }
      setDialogOpen(false)
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '订单保存失败', { translate: false })
    } finally {
      setSubmitting(false)
    }
  }

  const removeOrder = async (order: LegacyOrder) => {
    const confirmed = await confirm({
      title: '删除订单',
      description: `确认删除运单 ${order.oddnumber}？该操作会按后端兼容逻辑删除订单。`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      await deleteOrder(order.id)
      showToast('success', '删除订单成功！', { translate: false })
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '订单删除失败', { translate: false })
    }
  }

  return (
    <PageShell
      title="订单列表"
      description="按旧 adminYh 订单字段重建列表、搜索、分页、导出和运单维护，接口通过封装层兼容 /order。"
      width="full"
      actions={
        <>
          <Button type="button" className="gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            新建订单
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
          <Button type="button" className="gap-2" onClick={() => downloadOrders(rows)} disabled={!rows.length}>
            <Download className="h-4 w-4" />
            导出当前页
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
        <FilterField label="运单号">
          <Input aria-label="运单号" value={draft.oddnumber} placeholder="请输入运单号" onChange={(event) => updateDraft('oddnumber', event.target.value)} />
        </FilterField>
        <FilterField label="收货人">
          <Input aria-label="收货人" value={draft.consignee} placeholder="请输入收货人" onChange={(event) => updateDraft('consignee', event.target.value)} />
        </FilterField>
        <FilterField label="收货人号码">
          <Input aria-label="收货人号码" value={draft.consigneephone} placeholder="请输入收货人号码" onChange={(event) => updateDraft('consigneephone', event.target.value)} />
        </FilterField>
        <FilterField label="发货人">
          <Input aria-label="发货人" value={draft.consignor} placeholder="请输入发货人" onChange={(event) => updateDraft('consignor', event.target.value)} />
        </FilterField>
        <FilterField label="发货人号码">
          <Input aria-label="发货人号码" value={draft.consignorphone} placeholder="请输入发货人号码" onChange={(event) => updateDraft('consignorphone', event.target.value)} />
        </FilterField>
        <FilterField label="货物数量">
          <Input aria-label="货物数量" value={draft.number} placeholder="请输入货物数量" onChange={(event) => updateDraft('number', event.target.value)} />
        </FilterField>
        <FilterField label="发货单位">
          <Input aria-label="发货单位" value={draft.company} placeholder="请输入发货单位" onChange={(event) => updateDraft('company', event.target.value)} />
        </FilterField>
        <FilterField label="开单时间">
          <DateRangePicker value={draft.createAt} onChange={(value) => updateDraft('createAt', value)} />
        </FilterField>
      </FilterBar>

      <PageSurface
        title="订单数据"
        description="保留旧系统字段名和中文列名；新增、查看、编辑、删除都通过 API 封装处理。"
        footer={data ? <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
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
        ) : rows.length ? (
          <div className="ops-table-shell">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-right">序号</TableHead>
                  <TableHead className="sticky left-0 z-10 min-w-[160px] bg-background">操作</TableHead>
                  {ORDER_COLUMNS.map((column) => (
                    <TableHead key={column.key} className={column.className}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</TableCell>
                    <TableCell className="sticky left-0 z-10 bg-background">
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" aria-label="查看订单" onClick={() => openOrderDialog('view', row)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" aria-label="编辑订单" onClick={() => openOrderDialog('edit', row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" aria-label="删除订单" onClick={() => removeOrder(row)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                    {ORDER_COLUMNS.map((column) => (
                      <TableCell key={column.key} className={column.className}>{renderCell(row, column)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title="暂无订单" description="调整筛选条件后重新查询，或在后续新增订单切片中创建数据。" />
        )}
      </PageSurface>

      <OrderFormDialog
        mode={dialogMode}
        open={dialogOpen}
        order={selectedOrder}
        submitting={submitting}
        onOpenChange={setDialogOpen}
        onSubmit={submitOrder}
      />
    </PageShell>
  )
}
