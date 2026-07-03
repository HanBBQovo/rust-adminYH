import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RECEIPT_STATUS,
  RECEIPT_STATUS_OPTIONS,
  buildReceiptListPayload,
  isReceiptActionComplete,
  listReceipts,
  receiptStatusMessage,
  receiptStatusPatch,
  updateReceiptStatus,
  updateReceiptStatuses,
} from '@/api/receipts'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('receipts api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds old receipt list paging and filter payload', () => {
    expect(
      buildReceiptListPayload({
        mode: 'all',
        page: 2,
        pageSize: 10,
        oddnumber: ' YD202601 ',
        consignee: '',
        consignor: '张三',
        recoverystate: '未回收',
        issuestate: '已接收',
        poststate: '',
        createAt: ['2026-01-01', '2026-01-31'],
      }),
    ).toEqual({
      offset: 10,
      size: 10,
      oddnumber: ' YD202601 ',
      consignor: '张三',
      recoverystate: '未回收',
      issuestate: '已接收',
      createAt: ['2026-01-01', '2026-01-31'],
    })
  })

  it.each(['已接收', '已发放'] as const)(
    'keeps issue status filter %s unnormalized for backend alias matching',
    (issuestate) => {
      expect(
        buildReceiptListPayload({
          mode: 'all',
          page: 1,
          pageSize: 20,
          issuestate,
        }),
      ).toEqual({
        offset: 0,
        size: 20,
        issuestate,
      })
    },
  )

  it.each([
    ['all', '/api/receipt/list'],
    ['pending', '/api/notrecovery/list'],
    ['recovered', '/api/recovery/list'],
  ] as const)('posts %s lists to the old receipt route', async (mode, path) => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 1,
        list: [
          {
            id: 1,
            oddnumber: 'YD20260101001',
            billingAt: '2026-01-01',
            recoverystate: '未回收',
            issuestate: '未发放',
            poststate: '未寄出',
            recoverynumber: 1,
            consignor: '李四',
            consignee: '张三',
            goodsname: '设备',
            goodsnumber: '2',
          },
        ],
      }),
    )

    await expect(listReceipts({ mode, page: 3, pageSize: 20, oddnumber: 'YD2026' })).resolves.toEqual({
      rows: [
        {
          id: 1,
          oddnumber: 'YD20260101001',
          billingAt: '2026-01-01',
          recoverystate: '未回收',
          issuestate: '未发放',
          poststate: '未寄出',
          recoverynumber: 1,
          consignor: '李四',
          consignee: '张三',
          goodsname: '设备',
          goodsnumber: '2',
        },
      ],
      total: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      path,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 40, size: 20, oddnumber: 'YD2026' }),
      }),
    )
  })

  it('patches receipt statuses and keeps the old 已接收 compatibility value', async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse({}))

    await expect(
      updateReceiptStatus(7, {
        recoverystate: '已回收',
        issuestate: '已接收',
        poststate: '已寄出',
      }),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/receipt/7',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          recoverystate: '已回收',
          issuestate: '已接收',
          poststate: '已寄出',
        }),
      }),
    )
  })

  it('centralizes receipt status values, action payloads, and legacy done aliases', () => {
    expect(RECEIPT_STATUS_OPTIONS).toEqual({
      recoverystate: [RECEIPT_STATUS.recovery.done, RECEIPT_STATUS.recovery.pending],
      issuestate: [RECEIPT_STATUS.issue.done, RECEIPT_STATUS.issue.legacyDone, RECEIPT_STATUS.issue.pending],
      poststate: [RECEIPT_STATUS.post.done, RECEIPT_STATUS.post.pending],
    })

    expect(receiptStatusPatch('recovery')).toEqual({ recoverystate: '已回收' })
    expect(receiptStatusPatch('issue')).toEqual({ issuestate: '已接收' })
    expect(receiptStatusPatch('post')).toEqual({ poststate: '已寄出' })
    expect(receiptStatusMessage('issue')).toBe('回单接收成功！')

    expect(
      isReceiptActionComplete(
        { recoverystate: '未回收', issuestate: '已发放', poststate: '未寄出' },
        'issue',
      ),
    ).toBe(true)
  })

  it('batch patches selected receipt statuses through the transaction route wrapper', async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse({}))

    await expect(updateReceiptStatuses([7, 8], { issuestate: '已接收' })).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/receipt/batch/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ receiptIds: [7, 8], issuestate: '已接收' }),
      }),
    )
  })

  it('keeps empty batch status updates local without calling the backend', async () => {
    await expect(updateReceiptStatuses([], { issuestate: '已接收' })).resolves.toBeUndefined()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
