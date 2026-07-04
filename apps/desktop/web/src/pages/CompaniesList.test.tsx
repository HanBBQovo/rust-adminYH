import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '@/components/theme'
import { ConfirmDialogContext } from '@/components/ui/confirm-dialog-context'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import CompaniesList from '@/pages/CompaniesList'

const listCompaniesMock = vi.hoisted(() => vi.fn())
const getCompanyMock = vi.hoisted(() => vi.fn())
const createCompanyMock = vi.hoisted(() => vi.fn())
const updateCompanyMock = vi.hoisted(() => vi.fn())
const deleteCompanyMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/companies', () => ({
  listCompanies: listCompaniesMock,
  getCompany: getCompanyMock,
  createCompany: createCompanyMock,
  updateCompany: updateCompanyMock,
  deleteCompany: deleteCompanyMock,
}))

const COMPANY_ROW = {
  id: 1,
  name: '顺丰速运',
  Countorder: 2,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
}

function renderCompaniesList(options?: { confirm?: () => Promise<boolean>; showToast?: ReturnType<typeof vi.fn> }) {
  const confirm = options?.confirm || vi.fn().mockResolvedValue(true)
  const showToast = options?.showToast || vi.fn()

  render(
    <ThemeProvider>
      <GlobalToastContext.Provider value={{ showToast }}>
        <ConfirmDialogContext.Provider value={{ confirm }}>
          <CompaniesList />
        </ConfirmDialogContext.Provider>
      </GlobalToastContext.Provider>
    </ThemeProvider>,
  )

  return { confirm, showToast }
}

function companyNameField(dialog: HTMLElement): HTMLInputElement {
  const field = dialog.querySelector<HTMLInputElement>('#company-name')
  if (!field) throw new Error('missing company name field')
  return field
}

describe('CompaniesList', () => {
  beforeEach(() => {
    listCompaniesMock.mockReset()
    getCompanyMock.mockReset()
    createCompanyMock.mockReset()
    updateCompanyMock.mockReset()
    deleteCompanyMock.mockReset()
    listCompaniesMock.mockResolvedValue({ rows: [COMPANY_ROW], total: 11 })
    getCompanyMock.mockResolvedValue(COMPANY_ROW)
    createCompanyMock.mockResolvedValue(undefined)
    updateCompanyMock.mockResolvedValue(undefined)
    deleteCompanyMock.mockResolvedValue(undefined)
  })

  it('renders old company columns and loads the first page', async () => {
    renderCompaniesList()

    expect(await screen.findByText('顺丰速运')).toBeInTheDocument()
    expect(screen.getByText('订单数量')).toBeInTheDocument()
    expect(screen.getByText('2026-01-01T00:00:00Z')).toBeInTheDocument()
    expect(listCompaniesMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
  })

  it('paginates through the API wrapper', async () => {
    const user = userEvent.setup()
    renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: /下一页/ }))

    await waitFor(() => {
      expect(listCompaniesMock).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 })
    })
  })

  it('validates required old company name before creating', async () => {
    const user = userEvent.setup()
    renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '新建发货公司' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('发货公司不能为空！')).toBeInTheDocument()
    expect(createCompanyMock).not.toHaveBeenCalled()
  })

  it('creates companies through the API wrapper and refreshes the list', async () => {
    const user = userEvent.setup()
    const { showToast } = renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '新建发货公司' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(companyNameField(dialog), '跨越速运')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(createCompanyMock).toHaveBeenCalledWith({ name: '跨越速运' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '创建发货公司成功！', { translate: false })
    expect(listCompaniesMock).toHaveBeenCalledTimes(2)
  })

  it('loads detail for view and keeps the form readonly', async () => {
    const user = userEvent.setup()
    renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '查看发货公司' }))

    expect(await screen.findByText('查看发货公司')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    expect(getCompanyMock).toHaveBeenCalledWith(1)
    expect(companyNameField(dialog)).toBeDisabled()
    expect(within(dialog).queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('keeps the optimistic company row when detail loading fails', async () => {
    getCompanyMock.mockRejectedValueOnce(new Error('公司详情接口失败'))
    const user = userEvent.setup()
    const { showToast } = renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '查看发货公司' }))

    const dialog = await screen.findByRole('dialog')
    expect(companyNameField(dialog)).toHaveValue('顺丰速运')
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('error', '公司详情接口失败', { translate: false })
    })
    expect(dialog).toBeInTheDocument()
  })

  it('updates companies through the API wrapper', async () => {
    const user = userEvent.setup()
    const { showToast } = renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '编辑发货公司' }))
    expect(await screen.findByText('编辑发货公司')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    await user.clear(companyNameField(dialog))
    await user.type(companyNameField(dialog), '跨越物流')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(updateCompanyMock).toHaveBeenCalledWith(1, { name: '跨越物流' })
    })
    expect(showToast).toHaveBeenCalledWith('success', '修改发货公司成功！', { translate: false })
  })

  it('confirms before deleting a company', async () => {
    const user = userEvent.setup()
    const { confirm, showToast } = renderCompaniesList()

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '删除发货公司' }))

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除发货公司', variant: 'destructive' }))
      expect(deleteCompanyMock).toHaveBeenCalledWith(1)
    })
    expect(showToast).toHaveBeenCalledWith('success', '删除发货公司成功！', { translate: false })
  })

  it('does not delete when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    renderCompaniesList({ confirm: vi.fn().mockResolvedValue(false) })

    await screen.findByText('顺丰速运')
    await user.click(screen.getByRole('button', { name: '删除发货公司' }))

    await waitFor(() => {
      expect(deleteCompanyMock).not.toHaveBeenCalled()
    })
  })

  it('renders the empty state', async () => {
    listCompaniesMock.mockResolvedValueOnce({ rows: [], total: 0 })
    renderCompaniesList()

    expect(await screen.findByText('暂无发货公司')).toBeInTheDocument()
  })
})
