import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getDashboardSummary,
  legacyCompanySumsToTrend,
  legacyHeaderToStats,
  legacyReceiptSumsToTasks,
} from '@/api/dashboard'

const fetchMock = vi.fn()

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('dashboard legacy chart api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_USE_MOCKS', '0')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('maps old chart header records into workspace stats', () => {
    expect(
      legacyHeaderToStats([
        {
          amount: 'ordercount',
          title: '订单总数：',
          tips: '全部订单',
          subtitle: '订单',
          number1: '12',
          number2: 0,
        },
        {
          amount: 'orderfreight',
          title: '运费总额：',
          tips: '',
          subtitle: '运费',
          number1: 3050.5,
          number2: 0,
        },
      ]),
    ).toEqual([
      {
        key: 'orders',
        label: '订单总数',
        value: 12,
        note: '全部订单',
      },
      {
        key: 'freight',
        label: '运费合计',
        value: 3050.5,
        unit: '¥',
        note: '运费',
      },
    ])
  })

  it('joins old company freight and receipt summaries by company name', () => {
    expect(
      legacyCompanySumsToTrend(
        [
          { id: 1, name: '甲公司', sumfreight: '100' },
          { id: 2, name: '乙公司', sumfreight: 250 },
        ],
        [{ id: 1, name: '甲公司', sumReceipt: '3' }],
      ),
    ).toEqual([
      { date: '甲公司', freight: 100, receipts: 3 },
      { date: '乙公司', freight: 250, receipts: 0 },
    ])
  })

  it('creates stable workspace tasks from old receipt summaries', () => {
    expect(
      legacyReceiptSumsToTasks([
        { id: 7, name: '甲公司', sumReceipt: '2' },
        { id: 8, name: '乙公司', sumReceipt: 0 },
      ]),
    ).toEqual([
      {
        id: 'receipt-7',
        title: '甲公司 回单数量 2',
        owner: '财务',
        status: 'warning',
        updatedAt: '本期',
      },
      {
        id: 'receipt-8',
        title: '乙公司 回单数量 0',
        owner: '财务',
        status: 'normal',
        updatedAt: '本期',
      },
    ])
  })

  it('loads dashboard summary from the old chart endpoint set', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        jsonResponse([
          {
            amount: 'ordercount',
            title: '订单总数：',
            tips: '全部订单',
            subtitle: '订单',
            number1: 2,
            number2: 0,
          },
        ]),
      )
      .mockImplementationOnce(() => jsonResponse([{ id: 1, name: '甲公司', sumfreight: 880 }]))
      .mockImplementationOnce(() => jsonResponse([{ id: 1, name: '甲公司', sumReceipt: 4 }]))

    const summary = await getDashboardSummary('30d')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/chart/headerList',
      '/api/chart/company/order/sumfreight',
      '/api/chart/company/receipt/sumreceipt',
    ])
    expect(summary).toEqual({
      stats: [
        {
          key: 'orders',
          label: '订单总数',
          value: 2,
          note: '全部订单',
        },
      ],
      freightTrend: [{ date: '甲公司', freight: 880, receipts: 4 }],
      pendingTasks: [
        {
          id: 'receipt-1',
          title: '甲公司 回单数量 4',
          owner: '财务',
          status: 'warning',
          updatedAt: '本期',
        },
      ],
    })
  })

  it('always uses legacy chart endpoints instead of development fallback data', async () => {
    vi.stubEnv('VITE_USE_MOCKS', '1')
    fetchMock
      .mockImplementationOnce(() => jsonResponse([]))
      .mockImplementationOnce(() => jsonResponse([]))
      .mockImplementationOnce(() => jsonResponse([]))

    const summary = await getDashboardSummary('7d')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/chart/headerList',
      '/api/chart/company/order/sumfreight',
      '/api/chart/company/receipt/sumreceipt',
    ])
    expect(summary).toEqual({
      stats: [],
      freightTrend: [],
      pendingTasks: [
        {
          id: 'receipt-empty',
          title: '暂无回单数据',
          owner: '财务',
          status: 'normal',
          updatedAt: '今日',
        },
      ],
    })
  })
})
