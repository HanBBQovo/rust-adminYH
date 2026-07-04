import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterBar, FilterField, SelectFilterField } from '@/components/layout/FilterBar'

describe('FilterBar', () => {
  it('renders actions and the reset affordance through the shared layout', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()

    render(
      <FilterBar onReset={onReset} actions={<button type="button">查询</button>}>
        <FilterField label="运单号">
          <input aria-label="运单号" />
        </FilterField>
      </FilterBar>,
    )

    expect(screen.getByText('运单号')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查询' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重置' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('centralizes select filter labels, all option mapping, and aria names', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    const { rerender } = render(
      <SelectFilterField
        label="回收状态"
        value=""
        allValue="__any__"
        options={['已回收', '未回收']}
        onValueChange={onValueChange}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: '回收状态' }))
    await user.click(await screen.findByRole('option', { name: '已回收' }))

    expect(onValueChange).toHaveBeenCalledWith('已回收')

    rerender(
      <SelectFilterField
        label="回收状态"
        value="已回收"
        allValue="__any__"
        options={['已回收', '未回收']}
        onValueChange={onValueChange}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: '回收状态' }))
    await user.click(await screen.findByRole('option', { name: '全部' }))

    expect(onValueChange).toHaveBeenCalledWith('')
  })
})
