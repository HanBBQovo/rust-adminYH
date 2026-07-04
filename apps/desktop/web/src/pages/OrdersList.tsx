import { Download, Eye, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  listOrdersForExport,
  updateOrder,
  type LegacyOrder,
  type OrderListFilters,
  type OrderMutationPayload,
} from '@/api/orders'
import {
  DataTableActionGroup,
  DataTableIconAction,
  DataTableRowNumberCell,
  DataTableRowNumberHead,
  DataTableSurface,
  StickyActionCell,
  StickyActionHead,
} from '@/components/layout/DataTableSurface'
import { FilterBar, FilterField } from '@/components/layout/FilterBar'
import { PageShell } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useMutationAction } from '@/lib/use-mutation-action'
import { usePaginatedResource } from '@/lib/use-paginated-resource'
import { OrderFormDialog } from '@/pages/orders/OrderFormDialog'
import { ORDER_COLUMNS, exportOrdersCsv, type OrderColumn } from '@/pages/orders/order-export'
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

const PAGE_SIZE = 10

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
  const { showToast } = useGlobalToast()
  const { pending: submitting, runMutation, runConfirmedMutation } = useMutationAction()
  const [draft, setDraft] = useState<OrderFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<OrderListFilters>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<OrderFormMode>('create')
  const [selectedOrder, setSelectedOrder] = useState<LegacyOrder | undefined>()
  const [exporting, setExporting] = useState(false)

  const { data, loading, error, refresh, page, pageSize, setPage, rows, total, pagination } = usePaginatedResource({
    pageSize: PAGE_SIZE,
    queryDeps: [filters],
    buildQuery: ({ page, pageSize }) => ({ page, pageSize, ...filters }),
    fetcher: listOrders,
  })

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
    const selectedOrderId = dialogMode === 'edit' ? selectedOrder?.id : undefined
    const isEditing = selectedOrderId != null
    await runMutation(
      () => (isEditing ? updateOrder(selectedOrderId, values) : createOrder(values)),
      {
        successMessage: isEditing ? '修改订单信息成功！' : '创建订单成功！',
        errorMessage: '订单保存失败',
        onSuccess: () => {
          setDialogOpen(false)
          refresh()
        },
      },
    )
  }

  const removeOrder = async (order: LegacyOrder) => {
    await runConfirmedMutation(
      () => deleteOrder(order.id),
      {
        confirm: {
          title: '删除订单',
          description: `确认删除运单 ${order.oddnumber}？该操作会按后端兼容逻辑删除订单。`,
          confirmText: '删除',
          variant: 'destructive',
        },
        successMessage: '删除订单成功！',
        errorMessage: '订单删除失败',
        onSuccess: refresh,
      },
    )
  }

  const exportFilteredOrders = async () => {
    if (total <= 0) return
    setExporting(true)
    try {
      const exportRows = await listOrdersForExport(filters, total)
      const mode = await exportOrdersCsv(exportRows)
      showToast('success', mode === 'desktop' ? '订单 CSV 已保存到所选位置。' : '订单 CSV 已开始下载。', { translate: false })
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '订单导出失败', { translate: false })
    } finally {
      setExporting(false)
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
          <Button type="button" className="gap-2" onClick={exportFilteredOrders} disabled={loading || total <= 0 || exporting}>
            <Download className="h-4 w-4" />
            {exporting ? '导出中' : '导出筛选结果'}
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

      <DataTableSurface
        title="订单数据"
        description="展示运单、结算、回单联动数据；新增、查看、编辑、删除均通过统一服务接口处理。"
        error={error}
        loading={loading && !data}
        isEmpty={!rows.length}
        emptyTitle="暂无订单"
        emptyDescription="调整筛选条件后重新查询，或点击新建订单录入运单。"
        onRetry={refresh}
        pagination={pagination}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <DataTableRowNumberHead />
              <StickyActionHead className="min-w-[160px]" />
              {ORDER_COLUMNS.map((column) => (
                <TableHead key={column.key} className={column.className}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <DataTableRowNumberCell value={(page - 1) * pageSize + index + 1} />
                <StickyActionCell>
                  <DataTableActionGroup>
                    <DataTableIconAction label="查看订单" icon={Eye} onClick={() => openOrderDialog('view', row)} />
                    <DataTableIconAction label="编辑订单" icon={Pencil} onClick={() => openOrderDialog('edit', row)} />
                    <DataTableIconAction label="删除订单" icon={Trash2} destructive onClick={() => removeOrder(row)} />
                  </DataTableActionGroup>
                </StickyActionCell>
                {ORDER_COLUMNS.map((column) => (
                  <TableCell key={column.key} className={column.className}>{renderCell(row, column)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>

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
