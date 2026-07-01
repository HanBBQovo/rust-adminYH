import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildOrderListPayload, createOrder, deleteOrder, getOrder, listOrders, updateOrder } from '@/api/orders'

const fetchMock = vi.fn()

const ORDER_PAYLOAD = {
  oddnumber: 'YD20260701001',
  billingAt: '2026-07-01',
  consignee: '张三',
  consigneephone: '13800000000',
  address: '上海市',
  method: '送货',
  goodsname: '设备',
  number: '2',
  pack: '木箱',
  weight: '20',
  measurement: '1',
  cainsurance: '否',
  value: '',
  insurance: '',
  consignor: '李四',
  consignorphone: '13900000000',
  freight: '100',
  delivery: '20',
  sumfreight: '120',
  freightstate: '现付',
  paynow: '120',
  paygo: '',
  payback: '',
  paymonth: '',
  receiptnum: 1,
  company: '顺丰速运',
  remarks: '',
}

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

  it('wraps old order detail and mutation routes', async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ id: 7, ...ORDER_PAYLOAD }))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))

    await expect(getOrder(7)).resolves.toEqual({ id: 7, ...ORDER_PAYLOAD })
    await expect(createOrder(ORDER_PAYLOAD)).resolves.toBeUndefined()
    await expect(updateOrder(7, ORDER_PAYLOAD)).resolves.toBeUndefined()
    await expect(deleteOrder(7)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/order/7', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/order',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(ORDER_PAYLOAD) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/order/7',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(ORDER_PAYLOAD) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/order/7', expect.objectContaining({ method: 'DELETE' }))
  })
})
