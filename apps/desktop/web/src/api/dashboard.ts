import { apiRequest } from '@/api/client'

export type DashboardRange = '7d' | '30d'

export interface DashboardStat {
  key: string
  label: string
  value: number
  unit?: string
  note: string
}

export interface FreightPoint {
  date: string
  freight: number
  receipts: number
}

export interface PendingTask {
  id: string
  title: string
  owner: string
  status: 'normal' | 'warning' | 'danger'
  updatedAt: string
}

export interface DashboardSummary {
  stats: DashboardStat[]
  freightTrend: FreightPoint[]
  pendingTasks: PendingTask[]
}

export interface LegacyChartHeaderItem {
  amount: string
  title: string
  tips: string
  subtitle: string
  number1: number | string
  number2: number | string
}

export interface LegacyCompanyOrderSum {
  id: number
  name: string
  sumfreight: number | string
}

export interface LegacyCompanyReceiptSum {
  id: number
  name: string
  sumReceipt: number | string
}

const LEGACY_HEADER_META: Record<string, { key: string; label: string; unit?: string }> = {
  ordercount: { key: 'orders', label: '订单总数' },
  orderfreight: { key: 'freight', label: '运费合计', unit: '¥' },
  companycount: { key: 'companies', label: '发货公司' },
  receiptcount: { key: 'receipts', label: '回单总数' },
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanTitle(value: string): string {
  return value.replace(/[：:]\s*$/, '').trim()
}

export function legacyHeaderToStats(headers: LegacyChartHeaderItem[]): DashboardStat[] {
  return headers.map((item) => {
    const meta = LEGACY_HEADER_META[item.amount] ?? {
      key: item.amount,
      label: cleanTitle(item.title) || item.amount,
    }

    return {
      key: meta.key,
      label: meta.label,
      value: toNumber(item.number1),
      unit: meta.unit,
      note: item.tips || item.subtitle || cleanTitle(item.title),
    }
  })
}

export function legacyCompanySumsToTrend(
  freightRows: LegacyCompanyOrderSum[],
  receiptRows: LegacyCompanyReceiptSum[],
): FreightPoint[] {
  const receiptByCompany = new Map(receiptRows.map((row) => [row.name, toNumber(row.sumReceipt)]))

  return freightRows.map((row) => ({
    date: row.name,
    freight: toNumber(row.sumfreight),
    receipts: receiptByCompany.get(row.name) ?? 0,
  }))
}

export function legacyReceiptSumsToTasks(rows: LegacyCompanyReceiptSum[]): PendingTask[] {
  if (!rows.length) {
    return [
      {
        id: 'receipt-empty',
        title: '暂无回单数据',
        owner: '财务',
        status: 'normal',
        updatedAt: '今日',
      },
    ]
  }

  return rows.slice(0, 4).map((row) => {
    const receiptCount = toNumber(row.sumReceipt)

    return {
      id: `receipt-${row.id}`,
      title: `${row.name} 回单数量 ${receiptCount}`,
      owner: '财务',
      status: receiptCount > 0 ? 'warning' : 'normal',
      updatedAt: '本期',
    }
  })
}

async function getLegacyDashboardSummary(): Promise<DashboardSummary> {
  const [headers, freightRows, receiptRows] = await Promise.all([
    apiRequest<LegacyChartHeaderItem[]>('/chart/headerList'),
    apiRequest<LegacyCompanyOrderSum[]>('/chart/company/order/sumfreight'),
    apiRequest<LegacyCompanyReceiptSum[]>('/chart/company/receipt/sumreceipt'),
  ])

  return {
    stats: legacyHeaderToStats(headers),
    freightTrend: legacyCompanySumsToTrend(freightRows, receiptRows),
    pendingTasks: legacyReceiptSumsToTasks(receiptRows),
  }
}

export async function getDashboardSummary(range: DashboardRange): Promise<DashboardSummary> {
  void range
  return getLegacyDashboardSummary()
}
