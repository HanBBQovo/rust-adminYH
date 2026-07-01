import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildOrderListPayload, listOrders } from '@/api/orders'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('orders api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds old order list paging and filter payload', () => {
    expect(
      buildOrderListPayload({
        page: 3,
        pageSize: 10,
        oddnumber: ' YD202601 ',
        consignee: '',
        consignor: '张三',
        company: '顺丰',
        createAt: ['2026-01-01', '2026-01-31'],
      }),
    ).toEqual({
      offset: 20,
      size: 10,
      oddnumber: ' YD202601 ',
      consignor: '张三',
      company: '顺丰',
      createAt: ['2026-01-01', '2026-01-31'],
    })
  })

  it('posts to the old order list route and normalizes totalCount', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 1,
        list: [
          {
            id: 1,
            oddnumber: 'YD20260101001',
            billingAt: '2026-01-01',
            consignee: '张三',
          },
        ],
      }),
    )

    await expect(listOrders({ page: 2, pageSize: 10, oddnumber: 'YD2026' })).resolves.toEqual({
      rows: [
        {
          id: 1,
          oddnumber: 'YD20260101001',
          billingAt: '2026-01-01',
          consignee: '张三',
        },
      ],
      total: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/order/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 10, size: 10, oddnumber: 'YD2026' }),
      }),
    )
  })
})
