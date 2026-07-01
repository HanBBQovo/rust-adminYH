import { apiRequest } from '@/api/client'

export interface LegacyOrder {
  id: number
  oddnumber: string
  billingAt: string
  consignee: string
  consigneephone: string
  address: string
  method: string
  goodsname: string
  number: string
  pack: string
  weight: string
  measurement: string
  cainsurance: string
  value: string
  insurance: string
  consignor: string
  consignorphone: string
  freight: string
  delivery: string
  sumfreight: string
  freightstate: string
  paynow: string
  paygo: string
  payback: string
  paymonth: string
  receiptnum: number
  company: string
  remarks: string
}

export interface OrderListFilters {
  oddnumber?: string
  consignee?: string
  consigneephone?: string
  consignor?: string
  consignorphone?: string
  number?: string
  company?: string
  createAt?: [string, string]
}

export interface OrderListParams extends OrderListFilters {
  page: number
  pageSize: number
}

export interface LegacyOrderListResponse {
  list: LegacyOrder[]
  totalCount: number
}

export interface OrderListResult {
  rows: LegacyOrder[]
  total: number
}

function cleanFilters(filters: OrderListFilters): OrderListFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (Array.isArray(value)) return value.some(Boolean)
      return String(value ?? '').trim() !== ''
    }),
  ) as OrderListFilters
}

export function buildOrderListPayload(params: OrderListParams) {
  const page = Math.max(params.page, 1)
  const pageSize = Math.max(params.pageSize, 1)
  const filters: OrderListFilters = {
    oddnumber: params.oddnumber,
    consignee: params.consignee,
    consigneephone: params.consigneephone,
    consignor: params.consignor,
    consignorphone: params.consignorphone,
    number: params.number,
    company: params.company,
    createAt: params.createAt,
  }

  return {
    offset: (page - 1) * pageSize,
    size: pageSize,
    ...cleanFilters(filters),
  }
}

export async function listOrders(params: OrderListParams): Promise<OrderListResult> {
  const data = await apiRequest<LegacyOrderListResponse>('/order/list', {
    method: 'POST',
    body: JSON.stringify(buildOrderListPayload(params)),
  })

  return {
    rows: data.list,
    total: data.totalCount,
  }
}
