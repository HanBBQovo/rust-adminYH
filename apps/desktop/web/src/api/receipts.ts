import { apiRequest } from '@/api/client'

export type ReceiptListMode = 'all' | 'pending' | 'recovered'

export interface LegacyReceipt {
  id: number
  oddnumber: string
  billingAt: string
  recoverystate: string
  issuestate: string
  poststate: string
  recoverynumber: number
  consignor: string
  consignee: string
  goodsname: string
  goodsnumber: string
}

export interface ReceiptListFilters {
  oddnumber?: string
  consignee?: string
  consignor?: string
  recoverystate?: string
  issuestate?: string
  poststate?: string
  createAt?: [string, string]
}

export interface ReceiptListParams extends ReceiptListFilters {
  mode: ReceiptListMode
  page: number
  pageSize: number
}

export interface LegacyReceiptListResponse {
  list: LegacyReceipt[]
  totalCount: number
}

export interface ReceiptListResult {
  rows: LegacyReceipt[]
  total: number
}

export interface ReceiptStatusPayload {
  recoverystate?: string
  issuestate?: string
  poststate?: string
}

const RECEIPT_LIST_PATHS: Record<ReceiptListMode, string> = {
  all: '/receipt/list',
  pending: '/notrecovery/list',
  recovered: '/recovery/list',
}

function cleanFilters(filters: ReceiptListFilters): ReceiptListFilters {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (Array.isArray(value)) return value.some(Boolean)
      return String(value ?? '').trim() !== ''
    }),
  ) as ReceiptListFilters
}

export function buildReceiptListPayload(params: ReceiptListParams) {
  const page = Math.max(params.page, 1)
  const pageSize = Math.max(params.pageSize, 1)
  const filters: ReceiptListFilters = {
    oddnumber: params.oddnumber,
    consignee: params.consignee,
    consignor: params.consignor,
    recoverystate: params.recoverystate,
    issuestate: params.issuestate,
    poststate: params.poststate,
    createAt: params.createAt,
  }

  return {
    offset: (page - 1) * pageSize,
    size: pageSize,
    ...cleanFilters(filters),
  }
}

export async function listReceipts(params: ReceiptListParams): Promise<ReceiptListResult> {
  const data = await apiRequest<LegacyReceiptListResponse>(RECEIPT_LIST_PATHS[params.mode], {
    method: 'POST',
    body: JSON.stringify(buildReceiptListPayload(params)),
  })

  return {
    rows: data.list,
    total: data.totalCount,
  }
}

export async function updateReceiptStatus(receiptId: number, payload: ReceiptStatusPayload): Promise<void> {
  await apiRequest<unknown>(`/receipt/${receiptId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateReceiptStatuses(receiptIds: number[], payload: ReceiptStatusPayload): Promise<void> {
  await Promise.all(receiptIds.map((receiptId) => updateReceiptStatus(receiptId, payload)))
}
