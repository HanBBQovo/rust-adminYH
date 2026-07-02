import type { LegacyOrder } from '@/api/orders'

export interface OrderColumn {
  key: keyof LegacyOrder
  label: string
  className?: string
}

export const ORDER_COLUMNS: OrderColumn[] = [
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

export function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildOrdersCsv(rows: LegacyOrder[]): string {
  const header = ORDER_COLUMNS.map((column) => column.label).join(',')
  const body = rows
    .map((row) => ORDER_COLUMNS.map((column) => csvEscape(row[column.key])).join(','))
    .join('\n')

  return `\ufeff${header}\n${body}`
}

export function orderExportFilename(now = new Date()): string {
  return `orders-${now.toISOString().slice(0, 10)}.csv`
}

export function downloadOrdersCsv(rows: LegacyOrder[], options?: { now?: Date }) {
  const blob = new Blob([buildOrdersCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = orderExportFilename(options?.now)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
