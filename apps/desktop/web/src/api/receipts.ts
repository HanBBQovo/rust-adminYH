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

export const RECEIPT_STATUS = {
  recovery: {
    pending: '未回收',
    done: '已回收',
  },
  issue: {
    pending: '未发放',
    done: '已接收',
    legacyDone: '已发放',
  },
  post: {
    pending: '未寄出',
    done: '已寄出',
  },
} as const

export const RECEIPT_STATUS_OPTIONS = {
  recoverystate: [RECEIPT_STATUS.recovery.done, RECEIPT_STATUS.recovery.pending],
  issuestate: [RECEIPT_STATUS.issue.done, RECEIPT_STATUS.issue.legacyDone, RECEIPT_STATUS.issue.pending],
  poststate: [RECEIPT_STATUS.post.done, RECEIPT_STATUS.post.pending],
} as const

export type ReceiptStatusAction = 'recovery' | 'issue' | 'post'

export const RECEIPT_STATUS_ACTIONS: Record<
  ReceiptStatusAction,
  {
    payload: ReceiptStatusPayload
    successMessage: string
    doneValues: readonly string[]
  }
> = {
  recovery: {
    payload: { recoverystate: RECEIPT_STATUS.recovery.done },
    successMessage: '回单回收成功！',
    doneValues: [RECEIPT_STATUS.recovery.done],
  },
  issue: {
    payload: { issuestate: RECEIPT_STATUS.issue.done },
    successMessage: '回单接收成功！',
    doneValues: [RECEIPT_STATUS.issue.done, RECEIPT_STATUS.issue.legacyDone],
  },
  post: {
    payload: { poststate: RECEIPT_STATUS.post.done },
    successMessage: '回单寄出成功！',
    doneValues: [RECEIPT_STATUS.post.done],
  },
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

export function receiptStatusPatch(action: ReceiptStatusAction): ReceiptStatusPayload {
  return RECEIPT_STATUS_ACTIONS[action].payload
}

export function receiptStatusMessage(action: ReceiptStatusAction): string {
  return RECEIPT_STATUS_ACTIONS[action].successMessage
}

export function isReceiptActionComplete(receipt: Pick<LegacyReceipt, 'recoverystate' | 'issuestate' | 'poststate'>, action: ReceiptStatusAction): boolean {
  const currentValue =
    action === 'recovery' ? receipt.recoverystate : action === 'issue' ? receipt.issuestate : receipt.poststate

  return RECEIPT_STATUS_ACTIONS[action].doneValues.includes(currentValue)
}
