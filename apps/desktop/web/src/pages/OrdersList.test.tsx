import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import OrdersList from '@/pages/OrdersList'

const listOrdersMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/orders', () => ({
  listOrders: listOrdersMock,
}))

const ORDER_ROW = {
  id: 1,
  oddnumber: 'YD20260101001',
  billingAt: '2026-01-01',
  consignee: '张三',
  consigneephone: '13800000000',
  address: '上海市',
  method: '送货',
  goodsname: '设备',
  number: '2',
  pack: '木箱',
  weight: '20',
  measurement: '1',
  cainsurance: '是',
  value: '1000',
  insurance: '10',
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
  remarks: '测试订单',
}

function renderOrdersList() {
  render(
    <ThemeProvider>
      <OrdersList />
    </ThemeProvider>,
  )
}

describe('OrdersList', () => {
  beforeEach(() => {
    listOrdersMock.mockReset()
    listOrdersMock.mockResolvedValue({ rows: [ORDER_ROW], total: 11 })
  })

  it('renders old order columns and loads the first page', async () => {
    renderOrdersList()

    expect(await screen.findByText('YD20260101001')).toBeInTheDocument()
    expect(screen.getByText('合计运费(元)')).toBeInTheDocument()
    expect(screen.getByText('顺丰速运')).toBeInTheDocument()
    expect(listOrdersMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
  })

  it('applies filters through the API wrapper and paginates', async () => {
    const user = userEvent.setup()
    renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.type(screen.getByLabelText('运单号'), 'YD2026')
    await user.type(screen.getByLabelText('发货人'), '李四')
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listOrdersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          oddnumber: 'YD2026',
          consignor: '李四',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listOrdersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          oddnumber: 'YD2026',
          consignor: '李四',
        }),
      )
    })
  })
})
