import { RefreshCw, Search, Send, Undo2, Warehouse } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  listReceipts,
  updateReceiptStatus,
  updateReceiptStatuses,
  type LegacyReceipt,
  type ReceiptListFilters,
  type ReceiptListMode,
  type ReceiptListParams,
  type ReceiptStatusPayload,
} from '@/api/receipts'
import { DataTableSurface, StickyActionCell, StickyActionHead } from '@/components/layout/DataTableSurface'
import { FilterBar, FilterField } from '@/components/layout/FilterBar'
import { PageShell } from '@/components/layout/PageScaffold'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-range-picker'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGlobalToast } from '@/components/ui/use-global-toast'
import { useResource } from '@/lib/use-resource'

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
const EMPTY_ROWS: LegacyReceipt[] = []

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

function statePatch(kind: 'recovery' | 'issue' | 'post'): ReceiptStatusPayload {
  if (kind === 'recovery') return { recoverystate: '已回收' }
  if (kind === 'issue') return { issuestate: '已接收' }
  return { poststate: '已寄出' }
}

function stateMessage(kind: 'recovery' | 'issue' | 'post') {
  if (kind === 'recovery') return '回单回收成功！'
  if (kind === 'issue') return '回单接收成功！'
  return '回单寄出成功！'
}

export default function ReceiptsList() {
  const { showToast } = useGlobalToast()
  const [mode, setMode] = useState<ReceiptListMode>('all')
  const [draft, setDraft] = useState<ReceiptFilterDraft>(() => emptyFilters())
  const [filters, setFilters] = useState<ReceiptListFilters>({})
  const [page, setPage] = useState(1)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [batchUpdating, setBatchUpdating] = useState<'recovery' | 'issue' | 'post' | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const meta = MODE_META[mode]
  const query = useMemo<ReceiptListParams>(() => ({ mode, page, pageSize: PAGE_SIZE, ...filters }), [filters, mode, page])
  const { data, loading, error, refresh } = useResource(() => listReceipts(query), [query])
  const rows = data?.rows ?? EMPTY_ROWS
  const total = data?.total ?? 0
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedRows = useMemo(() => rows.filter((row) => selectedSet.has(row.id)), [rows, selectedSet])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
  const someVisibleSelected = visibleIds.some((id) => selectedSet.has(id))

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => visibleIds.includes(id)))
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

  const patchStatus = async (row: LegacyReceipt, kind: 'recovery' | 'issue' | 'post') => {
    setUpdatingId(row.id)
    try {
      await updateReceiptStatus(row.id, statePatch(kind))
      showToast('success', stateMessage(kind), { translate: false })
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '回单状态更新失败', { translate: false })
    } finally {
      setUpdatingId(null)
    }
  }

  const patchSelectedStatuses = async (kind: 'recovery' | 'issue' | 'post') => {
    if (!selectedRows.length) {
      showToast('error', '请先选择回单', { translate: false })
      return
    }

    setBatchUpdating(kind)
    try {
      await updateReceiptStatuses(
        selectedRows.map((row) => row.id),
        statePatch(kind),
      )
      showToast('success', `${stateMessage(kind)}已批量更新 ${selectedRows.length} 条回单。`, { translate: false })
      setSelectedIds([])
      refresh()
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '批量回单状态更新失败', { translate: false })
      refresh()
    } finally {
      setBatchUpdating(null)
    }
  }

  const batchDisabled = loading || batchUpdating !== null || selectedRows.length === 0

  const renderStateActions = (row: LegacyReceipt) => (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1"
        disabled={updatingId === row.id || row.recoverystate === '已回收'}
        onClick={() => patchStatus(row, 'recovery')}
      >
        <Undo2 className="h-3.5 w-3.5" />
        回收
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1"
        disabled={updatingId === row.id || row.issuestate === '已接收' || row.issuestate === '已发放'}
        onClick={() => patchStatus(row, 'issue')}
      >
        <Warehouse className="h-3.5 w-3.5" />
        接收
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1"
        disabled={updatingId === row.id || row.poststate === '已寄出'}
        onClick={() => patchStatus(row, 'post')}
      >
        <Send className="h-3.5 w-3.5" />
        寄出
      </Button>
    </div>
  )

  return (
    <PageShell
      title="回单管理"
      description="按旧 adminYh 三个回单页面重建列表、筛选、分页和状态流转；接口统一走回单 API 封装。"
      width="full"
      actions={
        <Button type="button" variant="outline" className="gap-2" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          刷新
        </Button>
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
        <FilterField label="回收状态">
          <Select value={draft.recoverystate || ANY_VALUE} onValueChange={(value) => updateDraft('recoverystate', value === ANY_VALUE ? '' : value)}>
            <SelectTrigger aria-label="回收状态">
              <SelectValue placeholder="请选择回收状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>全部</SelectItem>
              <SelectItem value="已回收">已回收</SelectItem>
              <SelectItem value="未回收">未回收</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="发放状态">
          <Select value={draft.issuestate || ANY_VALUE} onValueChange={(value) => updateDraft('issuestate', value === ANY_VALUE ? '' : value)}>
            <SelectTrigger aria-label="发放状态">
              <SelectValue placeholder="请选择发放状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>全部</SelectItem>
              <SelectItem value="已接收">已接收</SelectItem>
              <SelectItem value="已发放">已发放</SelectItem>
              <SelectItem value="未发放">未发放</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="寄出状态">
          <Select value={draft.poststate || ANY_VALUE} onValueChange={(value) => updateDraft('poststate', value === ANY_VALUE ? '' : value)}>
            <SelectTrigger aria-label="寄出状态">
              <SelectValue placeholder="请选择寄出状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>全部</SelectItem>
              <SelectItem value="已寄出">已寄出</SelectItem>
              <SelectItem value="未寄出">未寄出</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
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
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={batchDisabled} onClick={() => patchSelectedStatuses('recovery')}>
              <Undo2 className="h-4 w-4" />
              批量回收
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={batchDisabled} onClick={() => patchSelectedStatuses('issue')}>
              <Warehouse className="h-4 w-4" />
              批量接收
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={batchDisabled} onClick={() => patchSelectedStatuses('post')}>
              <Send className="h-4 w-4" />
              批量寄出
            </Button>
          </div>
        }
        error={error}
        loading={loading && !data}
        isEmpty={!rows.length}
        emptyTitle="暂无回单"
        emptyDescription="调整筛选条件或切换回单状态后重新查询。"
        onRetry={refresh}
        pagination={data ? { page, pageSize: PAGE_SIZE, total, onPageChange: setPage } : undefined}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allVisibleSelected || (someVisibleSelected ? 'indeterminate' : false)}
                  aria-label="选择当前页回单"
                  onCheckedChange={(value) => toggleVisibleRows(Boolean(value))}
                />
              </TableHead>
              <TableHead className="w-14 text-right">序号</TableHead>
              <StickyActionHead className="min-w-[220px]">状态操作</StickyActionHead>
              {RECEIPT_COLUMNS.map((column) => (
                <TableHead key={column.key} className={column.className}>{column.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedSet.has(row.id)}
                    aria-label={`选择回单 ${row.oddnumber}`}
                    onCheckedChange={(value) => toggleRow(row.id, Boolean(value))}
                  />
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</TableCell>
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
