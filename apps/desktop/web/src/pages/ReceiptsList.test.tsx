import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import ReceiptsList from '@/pages/ReceiptsList'

const listReceiptsMock = vi.hoisted(() => vi.fn())
const updateReceiptStatusMock = vi.hoisted(() => vi.fn())
const updateReceiptStatusesMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/receipts', () => ({
  RECEIPT_STATUS_OPTIONS: {
    recoverystate: ['已回收', '未回收'],
    issuestate: ['已接收', '已发放', '未发放'],
    poststate: ['已寄出', '未寄出'],
  },
  isReceiptActionComplete: (
    receipt: { recoverystate: string; issuestate: string; poststate: string },
    action: 'recovery' | 'issue' | 'post',
  ) => {
    if (action === 'recovery') return receipt.recoverystate === '已回收'
    if (action === 'issue') return receipt.issuestate === '已接收' || receipt.issuestate === '已发放'
    return receipt.poststate === '已寄出'
  },
  listReceipts: listReceiptsMock,
  receiptStatusMessage: (action: 'recovery' | 'issue' | 'post') => {
    if (action === 'recovery') return '回单回收成功！'
    if (action === 'issue') return '回单接收成功！'
    return '回单寄出成功！'
  },
  receiptStatusPatch: (action: 'recovery' | 'issue' | 'post') => {
    if (action === 'recovery') return { recoverystate: '已回收' }
    if (action === 'issue') return { issuestate: '已接收' }
    return { poststate: '已寄出' }
  },
  updateReceiptStatus: updateReceiptStatusMock,
  updateReceiptStatuses: updateReceiptStatusesMock,
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

const SECOND_RECEIPT_ROW = {
  ...RECEIPT_ROW,
  id: 2,
  oddnumber: 'YD20260101002',
  consignee: '王五',
  recoverynumber: 3,
}

const THIRD_RECEIPT_ROW = {
  ...RECEIPT_ROW,
  id: 3,
  oddnumber: 'YD20260101003',
  consignee: '赵六',
}

const FOURTH_RECEIPT_ROW = {
  ...RECEIPT_ROW,
  id: 4,
  oddnumber: 'YD20260101004',
  consignee: '钱七',
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
    updateReceiptStatusesMock.mockReset()
    listReceiptsMock.mockResolvedValue({ rows: [RECEIPT_ROW, SECOND_RECEIPT_ROW], total: 11 })
    updateReceiptStatusMock.mockResolvedValue(undefined)
    updateReceiptStatusesMock.mockResolvedValue(undefined)
  })

  it('renders old receipt columns and loads all receipts first', async () => {
    renderReceiptsList()

    expect(await screen.findByText('YD20260101001')).toBeInTheDocument()
    expect(screen.getByText('YD20260101002')).toBeInTheDocument()
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

  it('resets pagination and selected rows when switching receipt modes', async () => {
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByLabelText('选择回单 YD20260101001'))
    expect(screen.getByText('已选 1 条')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith({ mode: 'all', page: 2, pageSize: 10 })
    })

    await user.click(screen.getByRole('tab', { name: '未回收' }))

    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith({ mode: 'pending', page: 1, pageSize: 10 })
    })
    expect(screen.getByText('已选 0 条')).toBeInTheDocument()
  })

  it('applies filters and keeps pagination through the API wrapper', async () => {
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.type(screen.getByLabelText('回单运单号'), 'YD2026')
    await user.type(screen.getByLabelText('回单收货人'), '张三')
    await user.click(screen.getByRole('combobox', { name: '回收状态' }))
    await user.click(await screen.findByRole('option', { name: '已回收' }))
    await user.click(screen.getByRole('combobox', { name: '发放状态' }))
    await user.click(await screen.findByRole('option', { name: '已接收' }))
    await user.click(screen.getByRole('combobox', { name: '寄出状态' }))
    await user.click(await screen.findByRole('option', { name: '未寄出' }))
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'all',
          page: 1,
          pageSize: 10,
          oddnumber: 'YD2026',
          consignee: '张三',
          recoverystate: '已回收',
          issuestate: '已接收',
          poststate: '未寄出',
        }),
      )
    })

    await user.click(screen.getByRole('combobox', { name: '回收状态' }))
    await user.click(await screen.findByRole('option', { name: '全部' }))
    await user.click(screen.getByRole('button', { name: '查询' }))

    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          recoverystate: '',
          issuestate: '已接收',
          poststate: '未寄出',
        }),
      )
    })
    expect(listReceiptsMock).not.toHaveBeenLastCalledWith(expect.objectContaining({ recoverystate: '__any__' }))

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'all',
          page: 2,
          pageSize: 10,
          oddnumber: 'YD2026',
          consignee: '张三',
          recoverystate: '',
          issuestate: '已接收',
          poststate: '未寄出',
        }),
      )
    })
  })

  it('resets filters, pagination, and selected rows together', async () => {
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.type(screen.getByLabelText('回单运单号'), 'YD2026')
    await user.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'all',
          page: 1,
          pageSize: 10,
          oddnumber: 'YD2026',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          oddnumber: 'YD2026',
        }),
      )
    })

    await user.click(screen.getByLabelText('选择回单 YD20260101001'))
    expect(screen.getByText('已选 1 条')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置' }))

    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith({ mode: 'all', page: 1, pageSize: 10 })
    })
    expect(screen.getByText('已选 0 条')).toBeInTheDocument()
  })

  it('updates recovery, issue, and post statuses then refreshes the list', async () => {
    const user = userEvent.setup()
    const { showToast } = renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getAllByRole('button', { name: '回收' })[0])
    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { recoverystate: '已回收' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '回单回收成功！', { translate: false })

    await user.click(screen.getAllByRole('button', { name: '接收' })[0])
    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { issuestate: '已接收' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '回单接收成功！', { translate: false })

    await user.click(screen.getAllByRole('button', { name: '寄出' })[0])
    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { poststate: '已寄出' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '回单寄出成功！', { translate: false })
    expect(listReceiptsMock).toHaveBeenCalledTimes(4)
  })

  it('disables receipt action buttons for current and legacy completed status values', async () => {
    listReceiptsMock.mockResolvedValueOnce({
      rows: [
        {
          ...RECEIPT_ROW,
          recoverystate: '已回收',
          issuestate: '已发放',
          poststate: '已寄出',
        },
      ],
      total: 1,
    })

    renderReceiptsList()

    await screen.findByText('YD20260101001')
    expect(screen.getByRole('button', { name: '回收' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '接收' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '寄出' })).toBeDisabled()
  })

  it('batch updates selected receipt statuses through the transaction API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByLabelText('选择回单 YD20260101001'))
    expect(screen.getByText('已选 1 条')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /批量接收/ }))
    await waitFor(() => {
      expect(updateReceiptStatusesMock).toHaveBeenCalledWith([1], { issuestate: '已接收' })
    })
    expect(updateReceiptStatusesMock).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('success', '回单接收成功！已批量更新 1 条回单。', { translate: false })

    await waitFor(() => {
      expect(screen.getByText('已选 0 条')).toBeInTheDocument()
    })
    await user.click(screen.getByLabelText('选择当前页回单'))
    expect(screen.getByText('已选 2 条')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /批量寄出/ }))
    await waitFor(() => {
      expect(updateReceiptStatusesMock).toHaveBeenCalledWith([1, 2], { poststate: '已寄出' })
    })
    expect(updateReceiptStatusesMock).toHaveBeenCalledTimes(2)
    expect(showToast).toHaveBeenCalledWith('success', '回单寄出成功！已批量更新 2 条回单。', { translate: false })
    expect(listReceiptsMock).toHaveBeenCalledTimes(3)
  })

  it('keeps batch selection scoped to the currently visible page', async () => {
    listReceiptsMock.mockImplementation(async (query: { page: number }) => ({
      rows: query.page === 2 ? [THIRD_RECEIPT_ROW, FOURTH_RECEIPT_ROW] : [RECEIPT_ROW, SECOND_RECEIPT_ROW],
      total: 22,
    }))
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.click(screen.getByLabelText('选择当前页回单'))
    expect(screen.getByText('已选 2 条')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    expect(await screen.findByText('YD20260101003')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('已选 0 条')).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText('选择当前页回单'))
    await user.click(screen.getByRole('button', { name: /批量接收/ }))

    await waitFor(() => {
      expect(updateReceiptStatusesMock).toHaveBeenCalledWith([3, 4], { issuestate: '已接收' })
    })
    expect(updateReceiptStatusesMock).not.toHaveBeenCalledWith([1, 2, 3, 4], expect.anything())
  })

  it('refreshes status updates with the current filters and page', async () => {
    const user = userEvent.setup()
    renderReceiptsList()

    await screen.findByText('YD20260101001')
    await user.type(screen.getByLabelText('回单运单号'), 'YD2026')
    await user.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          oddnumber: 'YD2026',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => {
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          oddnumber: 'YD2026',
        }),
      )
    })

    await user.click(screen.getAllByRole('button', { name: '回收' })[0])

    await waitFor(() => {
      expect(updateReceiptStatusMock).toHaveBeenCalledWith(1, { recoverystate: '已回收' })
      expect(listReceiptsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'all',
          page: 2,
          pageSize: 10,
          oddnumber: 'YD2026',
        }),
      )
    })
  })

  it('keeps selected rows on screen and reports batch failures', async () => {
    const user = userEvent.setup()
    const { showToast } = renderReceiptsList()
    updateReceiptStatusesMock.mockRejectedValueOnce(new Error('批量更新失败'))

    await screen.findByText('YD20260101001')
    await user.click(screen.getByLabelText('选择当前页回单'))
    await user.click(screen.getByRole('button', { name: /批量回收/ }))

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('error', '批量更新失败', { translate: false })
    })
    expect(updateReceiptStatusesMock).toHaveBeenCalledWith([1, 2], { recoverystate: '已回收' })
    expect(updateReceiptStatusesMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已选 2 条')).toBeInTheDocument()
    expect(listReceiptsMock).toHaveBeenCalledTimes(2)
  })

  it('shows update failures through the shared toast wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderReceiptsList()
    updateReceiptStatusMock.mockRejectedValueOnce(new Error('更新失败'))

    await screen.findByText('YD20260101001')
    await user.click(screen.getAllByRole('button', { name: '回收' })[0])

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
