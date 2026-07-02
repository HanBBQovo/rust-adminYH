import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DataTableSurface, StickyActionCell, StickyActionHead } from '@/components/layout/DataTableSurface'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'

function renderTableSurface(props?: Partial<React.ComponentProps<typeof DataTableSurface>>) {
  render(
    <DataTableSurface
      title="数据列表"
      description="列表说明"
      emptyTitle="暂无数据"
      emptyDescription="稍后再试"
      isEmpty={false}
      {...props}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <StickyActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <StickyActionCell>操作按钮</StickyActionCell>
          </TableRow>
        </TableBody>
      </Table>
    </DataTableSurface>,
  )
}

describe('DataTableSurface', () => {
  it('renders the loading state without table content', () => {
    renderTableSurface({ loading: true })

    expect(screen.getByText('加载中')).toBeInTheDocument()
    expect(screen.queryByText('操作按钮')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument()
  })

  it('renders the error state and retries', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderTableSurface({ error: '加载失败', onRetry })

    expect(screen.getAllByText('加载失败')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state', () => {
    renderTableSurface({
      isEmpty: true,
      emptyActions: <button type="button">新建数据</button>,
    })

    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('稍后再试')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建数据' })).toBeInTheDocument()
    expect(screen.queryByText('操作按钮')).not.toBeInTheDocument()
  })

  it('renders table content and pagination', () => {
    renderTableSurface({
      pagination: {
        page: 1,
        pageSize: 10,
        total: 11,
        onPageChange: vi.fn(),
      },
    })

    expect(screen.getByText('操作按钮')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('1-10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下一页/ })).toBeInTheDocument()
  })

  it('centralizes sticky action column styling', () => {
    renderTableSurface()

    expect(screen.getByRole('columnheader', { name: '操作' })).toHaveClass(
      'sticky',
      'left-0',
      'z-10',
      'bg-background',
    )
    expect(screen.getByText('操作按钮').closest('td')).toHaveClass('sticky', 'left-0', 'z-10', 'bg-background')
  })
})
