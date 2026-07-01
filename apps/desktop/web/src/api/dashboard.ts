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

const FALLBACK_SUMMARY: Record<DashboardRange, DashboardSummary> = {
  '7d': {
    stats: [
      { key: 'orders', label: '运单总数', value: 1268, note: '近 7 天新增 86 单' },
      { key: 'freight', label: '运费合计', value: 184250, unit: '¥', note: '含现付、到付、月结' },
      { key: 'companies', label: '发货公司', value: 42, note: '活跃公司 31 家' },
      { key: 'receipts', label: '待回收回单', value: 73, note: '需跟进 12 单' },
    ],
    freightTrend: [
      { date: 'D1', freight: 21800, receipts: 16 },
      { date: 'D2', freight: 24600, receipts: 19 },
      { date: 'D3', freight: 23120, receipts: 17 },
      { date: 'D4', freight: 28740, receipts: 22 },
      { date: 'D5', freight: 26300, receipts: 18 },
      { date: 'D6', freight: 30180, receipts: 25 },
      { date: 'D7', freight: 29510, receipts: 23 },
    ],
    pendingTasks: [
      { id: 'R-1024', title: '回单未回收', owner: '客服组', status: 'warning', updatedAt: '2026-07-01 09:20' },
      { id: 'O-9821', title: '运单缺少发货公司', owner: '运营组', status: 'danger', updatedAt: '2026-07-01 08:45' },
      { id: 'C-031', title: '公司资料待补全', owner: '财务组', status: 'normal', updatedAt: '2026-06-30 18:12' },
    ],
  },
  '30d': {
    stats: [
      { key: 'orders', label: '运单总数', value: 4915, note: '近 30 天新增 384 单' },
      { key: 'freight', label: '运费合计', value: 792140, unit: '¥', note: '环比增长 6.8%' },
      { key: 'companies', label: '发货公司', value: 58, note: '活跃公司 46 家' },
      { key: 'receipts', label: '待回收回单', value: 211, note: '超期 34 单' },
    ],
    freightTrend: Array.from({ length: 30 }, (_, index) => ({
      date: `${index + 1}日`,
      freight: Math.round(24500 + Math.sin(index / 3) * 3800 + index * 120),
      receipts: Math.round(17 + Math.cos(index / 4) * 5),
    })),
    pendingTasks: [
      { id: 'R-1024', title: '回单未回收', owner: '客服组', status: 'warning', updatedAt: '2026-07-01 09:20' },
      { id: 'O-9821', title: '运单缺少发货公司', owner: '运营组', status: 'danger', updatedAt: '2026-07-01 08:45' },
      { id: 'C-031', title: '公司资料待补全', owner: '财务组', status: 'normal', updatedAt: '2026-06-30 18:12' },
    ],
  },
}

export async function getDashboardSummary(range: DashboardRange): Promise<DashboardSummary> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== '0') {
    return new Promise((resolve) => window.setTimeout(() => resolve(FALLBACK_SUMMARY[range]), 240))
  }
  return apiRequest<DashboardSummary>(`/chart/dashboard?range=${range}`)
}
