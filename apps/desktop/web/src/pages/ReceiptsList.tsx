import { RefreshCw, Search, Send, Undo2, Warehouse } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  RECEIPT_STATUS_OPTIONS,
  isReceiptActionComplete,
  listReceipts,
  receiptStatusMessage,
  receiptStatusPatch,
  updateReceiptStatus,
  updateReceiptStatuses,
  type LegacyReceipt,
  type ReceiptListFilters,
  type ReceiptListMode,
  type ReceiptStatusAction,
} from '@/api/receipts'
import {
  DataTableActionGroup,
  DataTableRowNumberCell,
  DataTableRowNumberHead,
  DataTableSelectionCell,
  DataTableSelectionHead,
  DataTableSurface,
  DataTableTextAction,
  StickyActionCell,
  StickyActionHead,
} from '@/components/layout/DataTableSurface'
import { FilterBar, FilterField, SelectFilterField } from '@/components/layout/FilterBar'
import { HeaderActionButton } from '@/components/layout/HeaderActionButton'
import { PageShell } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useMutationAction } from '@/lib/use-mutation-action'
import { usePaginatedResource } from '@/lib/use-paginated-resource'

interface ReceiptFilterDraft {
  oddnumber: string
  consignee: string
  consignor: string
  recoverystate: string
  issuestate: string
  poststate: string
  createAt: DateRangeValue
}

interface ReceiptColumn {
  key: keyof LegacyReceipt
  label: string
  className?: string
}

const PAGE_SIZE = 10
const ANY_VALUE = '__any__'

const MODE_META: Record<ReceiptListMode, { title: string; description: string }> = {
  all: {
    title: '全部回单',
    description: '兼容旧 /receipt/list，集中查看回收、发放、寄出状态并执行状态流转。',
  },
  pending: {
    title: '未回收回单',
    description: '兼容旧 /notrecovery/list，聚焦仍未回收的回单记录。',
  },
  recovered: {
    title: '已回收回单',
    description: '兼容旧 /recovery/list，查看已回收回单并继续处理发放、寄出状态。',
  },
}

const RECEIPT_COLUMNS: ReceiptColumn[] = [
  { key: 'oddnumber', label: '运单号', className: 'min-w-[140px] font-mono text-xs' },
  { key: 'billingAt', label: '开单时间', className: 'min-w-[120px]' },
  { key: 'recoverystate', label: '回收状态', className: 'min-w-[120px]' },
  { key: 'issuestate', label: '发放状态', className: 'min-w-[120px]' },
  { key: 'poststate', label: '寄出状态', className: 'min-w-[120px]' },
  { key: 'recoverynumber', label: '回单数量', className: 'min-w-[100px] text-right' },
  { key: 'consignor', label: '发货人', className: 'min-w-[100px]' },
  { key: 'consignee', label: '收货人', className: 'min-w-[100px]' },
  { key: 'goodsname', label: '货物名称', className: 'min-w-[100px]' },
  { key: 'goodsnumber', label: '货物数量', className: 'min-w-[100px]' },
]

function emptyFilters(): ReceiptFilterDraft {
  return {
    oddnumber: '',
    consignee: '',
    consignor: '',
    recoverystate: '',
    issuestate: '',
    poststate: '',
    createAt: { from: '', to: '' },
  }
}

function toAppliedFilters(draft: ReceiptFilterDraft): ReceiptListFilters {
  return {
    oddnumber: draft.oddnumber.trim(),
    consignee: draft.consignee.trim(),
    consignor: draft.consignor.trim(),
    recoverystate: draft.recoverystate,
    issuestate: draft.issuestate,
    poststate: draft.poststate,
    createAt: draft.createAt.from && draft.createAt.to ? [draft.createAt.from, draft.createAt.to] : undefined,
  }
}

function statusVariant(value: string) {
  return value.startsWith('已') ? 'default' : 'destructive'
}

function renderCell(row: LegacyReceipt, column: ReceiptColumn) {
  const value = row[column.key]
  if (column.key === 'recoverystate' || column.key === 'issuestate' || column.key === 'poststate') {
    return <Badge variant={statusVariant(String(value))}>{String(value || '-')}</Badge>
  }
  return value === '' || value == null ? '-' : String(value)
}

export default function ReceiptsList() {
  const { showToast } = useGlobalToast()
  const { runMutation } = useMutationAction()
  const [mode, setMode] = useState<ReceiptListMode>('all')
  const [draft, setDraft] = useState<ReceiptFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<ReceiptListFilters>({})
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [batchUpdating, setBatchUpdating] = useState<ReceiptStatusAction | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const meta = MODE_META[mode]
  const { data, loading, error, refresh, page, pageSize, setPage, rows, pagination } = usePaginatedResource({
    pageSize: PAGE_SIZE,
    queryDeps: [mode, filters],
    buildQuery: ({ page, pageSize }) => ({ mode, page, pageSize, ...filters }),
    fetcher: listReceipts,
  })
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedRows = useMemo(() => rows.filter((row) => selectedSet.has(row.id)), [rows, selectedSet])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedSet.has(id))

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.includes(id))
      return next.length === current.length ? current : next
    })
  }, [visibleIds])

  const updateDraft = <K extends keyof ReceiptFilterDraft>(key: K, value: ReceiptFilterDraft[K]) => {
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
    setSelectedIds([])
  }

  const switchMode = (nextMode: string) => {
    setMode(nextMode as ReceiptListMode)
    setPage(1)
    setSelectedIds([])
  }

  const toggleRow = (rowId: number, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, rowId]))
      return current.filter((id) => id !== rowId)
    })
  }

  const toggleVisibleRows = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      visibleIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return Array.from(next)
    })
  }

  const patchStatus = async (row: LegacyReceipt, kind: ReceiptStatusAction) => {
    setUpdatingId(row.id)
    await runMutation(() => updateReceiptStatus(row.id, receiptStatusPatch(kind)), {
      successMessage: receiptStatusMessage(kind),
      errorMessage: '回单状态更新失败',
      onSuccess: refresh,
    })
    setUpdatingId(null)
  }

  const patchSelectedStatuses = async (kind: ReceiptStatusAction) => {
    if (!selectedRows.length) {
      showToast('error', '请先选择回单', { translate: false })
      return
    }

    setBatchUpdating(kind)
    let succeeded = false
    await runMutation(
      () =>
        updateReceiptStatuses(
          selectedRows.map((row) => row.id),
          receiptStatusPatch(kind),
        ),
      {
        successMessage: `${receiptStatusMessage(kind)}已批量更新 ${selectedRows.length} 条回单。`,
        errorMessage: '批量回单状态更新失败',
        onSuccess: () => {
          succeeded = true
          setSelectedIds([])
          refresh()
        },
      },
    )
    if (!succeeded) {
      refresh()
    }
    setBatchUpdating(null)
  }

  const batchDisabled = loading || batchUpdating !== null || selectedRows.length === 0

  const renderStateActions = (row: LegacyReceipt) => (
    <DataTableActionGroup>
      <DataTableTextAction
        label="回收"
        icon={Undo2}
        disabled={updatingId === row.id || isReceiptActionComplete(row, 'recovery')}
        onClick={() => patchStatus(row, 'recovery')}
      />
      <DataTableTextAction
        label="接收"
        icon={Warehouse}
        disabled={updatingId === row.id || isReceiptActionComplete(row, 'issue')}
        onClick={() => patchStatus(row, 'issue')}
      />
      <DataTableTextAction
        label="寄出"
        icon={Send}
        disabled={updatingId === row.id || isReceiptActionComplete(row, 'post')}
        onClick={() => patchStatus(row, 'post')}
      />
    </DataTableActionGroup>
  )

  return (
    <PageShell
      title="回单管理"
      description="按旧 adminYh 三个回单页面重建列表、筛选、分页和状态流转；接口统一走回单 API 封装。"
      width="full"
      actions={
        <HeaderActionButton
          type="button"
          variant="outline"
          icon={RefreshCw}
          iconClassName={loading ? 'animate-spin' : undefined}
          label="刷新"
          onClick={refresh}
          disabled={loading}
        />
      }
    >
      <Tabs value={mode} onValueChange={switchMode}>
        <TabsList>
          <TabsTrigger value="all">全部回单</TabsTrigger>
          <TabsTrigger value="pending">未回收</TabsTrigger>
          <TabsTrigger value="recovered">已回收</TabsTrigger>
        </TabsList>
      </Tabs>

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
          <Input aria-label="回单运单号" value={draft.oddnumber} placeholder="请输入运单号" onChange={(event) => updateDraft('oddnumber', event.target.value)} />
        </FilterField>
        <FilterField label="收货人">
          <Input aria-label="回单收货人" value={draft.consignee} placeholder="请输入收货人" onChange={(event) => updateDraft('consignee', event.target.value)} />
        </FilterField>
        <FilterField label="发货人">
          <Input aria-label="回单发货人" value={draft.consignor} placeholder="请输入发货人" onChange={(event) => updateDraft('consignor', event.target.value)} />
        </FilterField>
        <SelectFilterField
          label="回收状态"
          value={draft.recoverystate}
          allValue={ANY_VALUE}
          options={RECEIPT_STATUS_OPTIONS.recoverystate}
          onValueChange={(value) => updateDraft('recoverystate', value)}
        />
        <SelectFilterField
          label="发放状态"
          value={draft.issuestate}
          allValue={ANY_VALUE}
          options={RECEIPT_STATUS_OPTIONS.issuestate}
          onValueChange={(value) => updateDraft('issuestate', value)}
        />
        <SelectFilterField
          label="寄出状态"
          value={draft.poststate}
          allValue={ANY_VALUE}
          options={RECEIPT_STATUS_OPTIONS.poststate}
          onValueChange={(value) => updateDraft('poststate', value)}
        />
        <FilterField label="开单时间">
          <DateRangePicker value={draft.createAt} onChange={(value) => updateDraft('createAt', value)} />
        </FilterField>
      </FilterBar>

      <DataTableSurface
        title={meta.title}
        description={meta.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">已选 {selectedRows.length} 条</span>
            <DataTableTextAction
              label="批量回收"
              icon={Undo2}
              variant="outline"
              className="gap-2"
              iconClassName="h-4 w-4"
              disabled={batchDisabled}
              onClick={() => patchSelectedStatuses('recovery')}
            />
            <DataTableTextAction
              label="批量接收"
              icon={Warehouse}
              variant="outline"
              className="gap-2"
              iconClassName="h-4 w-4"
              disabled={batchDisabled}
              onClick={() => patchSelectedStatuses('issue')}
            />
            <DataTableTextAction
              label="批量寄出"
              icon={Send}
              variant="outline"
              className="gap-2"
              iconClassName="h-4 w-4"
              disabled={batchDisabled}
              onClick={() => patchSelectedStatuses('post')}
            />
          </div>
        }
        error={error}
        loading={loading && !data}
        isEmpty={!rows.length}
        emptyTitle="暂无回单"
        emptyDescription="调整筛选条件或切换回单状态后重新查询。"
        onRetry={refresh}
        pagination={pagination}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <DataTableSelectionHead
                checked={allVisibleSelected || (someVisibleSelected ? 'indeterminate' : false)}
                label="选择当前页回单"
                onCheckedChange={(value) => toggleVisibleRows(value === true)}
              />
              <DataTableRowNumberHead />
              <StickyActionHead className="min-w-[220px]">状态操作</StickyActionHead>
              {RECEIPT_COLUMNS.map((column) => (
                <TableHead key={column.key} className={column.className}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <DataTableSelectionCell
                  checked={selectedSet.has(row.id)}
                  label={`选择回单 ${row.oddnumber}`}
                  onCheckedChange={(value) => toggleRow(row.id, value === true)}
                />
                <DataTableRowNumberCell value={(page - 1) * pageSize + index + 1} />
                <StickyActionCell>{renderStateActions(row)}</StickyActionCell>
                {RECEIPT_COLUMNS.map((column) => (
                  <TableCell key={column.key} className={column.className}>{renderCell(row, column)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableSurface>
    </PageShell>
  )
}
