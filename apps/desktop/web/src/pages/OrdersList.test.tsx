import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { ConfirmDialogContext } from '@/components/ui/confirm-dialog-context'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import OrdersList from '@/pages/OrdersList'

const listOrdersMock = vi.hoisted(() => vi.fn())
const listOrdersForExportMock = vi.hoisted(() => vi.fn())
const getOrderMock = vi.hoisted(() => vi.fn())
const createOrderMock = vi.hoisted(() => vi.fn())
const updateOrderMock = vi.hoisted(() => vi.fn())
const deleteOrderMock = vi.hoisted(() => vi.fn())
const exportOrdersCsvMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/orders', () => ({
  listOrders: listOrdersMock,
  listOrdersForExport: listOrdersForExportMock,
  getOrder: getOrderMock,
  createOrder: createOrderMock,
  updateOrder: updateOrderMock,
  deleteOrder: deleteOrderMock,
}))

vi.mock('@/pages/orders/order-export', async () => {
  const actual = await vi.importActual<typeof import('@/pages/orders/order-export')>('@/pages/orders/order-export')
  return {
    ...actual,
    exportOrdersCsv: exportOrdersCsvMock,
  }
})

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

function renderOrdersList(options?: { confirm?: () => Promise<boolean>; showToast?: ReturnType<typeof vi.fn> }) {
  const confirm = options?.confirm || vi.fn().mockResolvedValue(true)
  const showToast = options?.showToast || vi.fn()

  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <ConfirmDialogContext.Provider value={{ confirm }}>
          <OrdersList />
        </ConfirmDialogContext.Provider>
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )

  return { confirm, showToast }
}

function orderField(dialog: HTMLElement, key: string): HTMLInputElement | HTMLTextAreaElement {
  const field = dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#order-${key}`)
  if (!field) throw new Error(`missing order field: ${key}`)
  return field
}

describe('OrdersList', () => {
  beforeEach(() => {
    listOrdersMock.mockReset()
    listOrdersForExportMock.mockReset()
    getOrderMock.mockReset()
    createOrderMock.mockReset()
    updateOrderMock.mockReset()
    deleteOrderMock.mockReset()
    exportOrdersCsvMock.mockReset()
    listOrdersMock.mockResolvedValue({ rows: [ORDER_ROW], total: 11 })
    listOrdersForExportMock.mockResolvedValue([ORDER_ROW])
    getOrderMock.mockResolvedValue(ORDER_ROW)
    createOrderMock.mockResolvedValue(undefined)
    updateOrderMock.mockResolvedValue(undefined)
    deleteOrderMock.mockResolvedValue(undefined)
    exportOrdersCsvMock.mockResolvedValue('browser')
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

  it('validates required old order fields before creating', async () => {
    const user = userEvent.setup()
    renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '新建订单' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('运单号不能为空')).toBeInTheDocument()
    expect(screen.getByText('收货人不能为空')).toBeInTheDocument()
    expect(createOrderMock).not.toHaveBeenCalled()
  })

  it('creates orders through the API wrapper and refreshes the list', async () => {
    const user = userEvent.setup()
    const { showToast } = renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '新建订单' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(orderField(dialog, 'oddnumber'), 'YD20260701001')
    await user.type(orderField(dialog, 'consignee'), '王五')
    await user.type(orderField(dialog, 'address'), '北京市')
    await user.type(orderField(dialog, 'goodsname'), '设备')
    await user.type(orderField(dialog, 'number'), '2')
    await user.type(orderField(dialog, 'consignor'), '赵六')
    await user.type(orderField(dialog, 'freight'), '100')
    await user.type(orderField(dialog, 'sumfreight'), '120')
    await user.type(orderField(dialog, 'company'), '顺丰速运')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          oddnumber: 'YD20260701001',
          consignee: '王五',
          address: '北京市',
          receiptnum: 0,
        }),
      )
    })
    expect(showToast).toHaveBeenCalledWith('success', '创建订单成功！', { translate: false })
    expect(listOrdersMock).toHaveBeenCalledTimes(2)
  })

  it('loads detail for view and keeps the form readonly', async () => {
    const user = userEvent.setup()
    renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '查看订单' }))

    expect(await screen.findByText('查看运单')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(getOrderMock).toHaveBeenCalledWith(1)
    expect(orderField(dialog, 'oddnumber')).toBeDisabled()
    expect(within(dialog).queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('updates orders through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '编辑订单' }))
    expect(await screen.findByText('编辑运单')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    await user.clear(orderField(dialog, 'consignee'))
    await user.type(orderField(dialog, 'consignee'), '更新收货人')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(updateOrderMock).toHaveBeenCalledWith(1, expect.objectContaining({ consignee: '更新收货人' }))
    })
    expect(showToast).toHaveBeenCalledWith('success', '修改订单信息成功！', { translate: false })
  })

  it('confirms before deleting an order', async () => {
    const user = userEvent.setup()
    const { confirm, showToast } = renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '删除订单' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除订单', variant: 'destructive' }))
      expect(deleteOrderMock).toHaveBeenCalledWith(1)
    })
    expect(showToast).toHaveBeenCalledWith('success', '删除订单成功！', { translate: false })
  })

  it('does not delete when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    renderOrdersList({ confirm: vi.fn().mockResolvedValue(false) })

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '删除订单' }))

    await waitFor(() => {
      expect(deleteOrderMock).not.toHaveBeenCalled()
    })
  })

  it('exports the complete currently filtered result instead of the loaded page', async () => {
    const user = userEvent.setup()
    const { showToast } = renderOrdersList()

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

    await user.click(screen.getByRole('button', { name: '导出筛选结果' }))

    await waitFor(() => {
      expect(listOrdersForExportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          oddnumber: 'YD2026',
          consignor: '李四',
        }),
        11,
      )
      expect(exportOrdersCsvMock).toHaveBeenCalledWith([ORDER_ROW])
    })
    expect(showToast).toHaveBeenCalledWith('success', '订单 CSV 已开始下载。', { translate: false })
  })

  it('keeps filtered export disabled while the list is refreshing', async () => {
    const user = userEvent.setup()
    renderOrdersList()

    await screen.findByText('YD20260101001')
    listOrdersMock.mockImplementationOnce(() => new Promise(() => {}))
    await user.click(screen.getByRole('button', { name: '刷新' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '导出筛选结果' })).toBeDisabled()
    })
    expect(listOrdersForExportMock).not.toHaveBeenCalled()
  })

  it('disables filtered export when the current result is empty', async () => {
    listOrdersMock.mockResolvedValueOnce({ rows: [], total: 0 })
    const user = userEvent.setup()
    renderOrdersList()

    await screen.findByText('暂无订单')
    const exportButton = screen.getByRole('button', { name: '导出筛选结果' })
    expect(exportButton).toBeDisabled()
    await user.click(exportButton)

    expect(listOrdersForExportMock).not.toHaveBeenCalled()
    expect(exportOrdersCsvMock).not.toHaveBeenCalled()
  })

  it('shows an error toast when filtered export fails', async () => {
    listOrdersForExportMock.mockRejectedValueOnce(new Error('导出接口失败'))
    const user = userEvent.setup()
    const { showToast } = renderOrdersList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: '导出筛选结果' }))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('error', '导出接口失败', { translate: false })
    })
    expect(exportOrdersCsvMock).not.toHaveBeenCalled()
  })
})
