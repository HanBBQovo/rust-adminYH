import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import ReceiptsList from '@/pages/ReceiptsList'

const listReceiptsMock = vi.hoisted(() => vi.fn())
const updateReceiptStatusMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/receipts', () => ({
  listReceipts: listReceiptsMock,
  updateReceiptStatus: updateReceiptStatusMock,
}))

const RECEIPT_ROW = {
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
}

function renderReceiptsList(options?: { showToast?: ReturnType<typeof vi.fn> }) {
  const showToast = options?.showToast || vi.fn()

  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <ReceiptsList />
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )

  return { showToast }
}

describe('ReceiptsList', () => {
  beforeEach(() => {
    listReceiptsMock.mockReset()
    updateReceiptStatusMock.mockReset()
    listReceiptsMock.mockResolvedValue({ rows: [RECEIPT_ROW], total: 11 })
    updateReceiptStatusMock.mockResolvedValue(undefined)
  })

  it('renders old receipt columns and loads all receipts first', async () => {
    renderReceiptsList()

    expect(await screen.findByText('YD20260101001')).toBeInTheDocument()
    expect(screen.getAllByText('回收状态').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('发放状态').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('寄出状态').length).toBeGreaterThanOrEqual(1)
    expect(listReceiptsMock).toHaveBeenCalledWith({ mode: 'all', page: 1, pageSize: 10 })
  })

  it('switches between the three old receipt list routes', async () => {
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('tab', { name: '未回收' }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith({ mode: 'pending', page: 1, pageSize: 10 })
    })

    await user.click(screen.getByRole('tab', { name: '已回收' }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith({ mode: 'recovered', page: 1, pageSize: 10 })
    })
  })

  it('applies filters and keeps pagination through the API wrapper', async () => {
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.type(screen.getByLabelText('回单运单号'), 'YD2026')
    await user.type(screen.getByLabelText('回单收货人'), '张三')
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'all',
          page: 1,
          pageSize: 10,
          oddnumber: 'YD2026',
          consignee: '张三',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'all',
          page: 2,
          pageSize: 10,
          oddnumber: 'YD2026',
          consignee: '张三',
        }),
      )
    })
  })

  it('updates recovery, issue, and post statuses then refreshes the list', async () => {
    const user = userEvent.setup()
    const { showToast } = renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: /回收/ }))
    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { recoverystate: '已回收' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '回单回收成功！', { translate: false })

    await user.click(screen.getByRole('button', { name: /接收/ }))
    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { issuestate: '已接收' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '回单接收成功！', { translate: false })

    await user.click(screen.getByRole('button', { name: /寄出/ }))
    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { poststate: '已寄出' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '回单寄出成功！', { translate: false })
    expect(listReceiptsMock).toHaveBeenCalledTimes(4)
  })

  it('shows update failures through the shared toast wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderReceiptsList()
    updateReceiptStatusMock.mockRejectedValueOnce(new Error('更新失败'))

    await screen.findByText('YD20260101001')
    await user.click(screen.getByRole('button', { name: /回收/ }))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('error', '更新失败', { translate: false })
    })
  })

  it('renders the empty state', async () => {
    listReceiptsMock.mockResolvedValueOnce({ rows: [], total: 0 })
    renderReceiptsList()

    expect(await screen.findByText('暂无回单')).toBeInTheDocument()
  })
})
