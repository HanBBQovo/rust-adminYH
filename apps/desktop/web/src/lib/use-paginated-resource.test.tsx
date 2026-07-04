import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePaginatedResource } from '@/lib/use-paginated-resource'

describe('usePaginatedResource', () => {
  const fetcher = vi.fn()

  beforeEach(() => {
    fetcher.mockReset()
    fetcher.mockImplementation(async (query: { page: number; pageSize: number }) => ({
      rows: [`page-${query.page}`],
      total: 25,
    }))
  })

  it('loads the first page and exposes table pagination props', async () => {
    const { result } = renderHook(() =>
      usePaginatedResource({
        pageSize: 10,
        buildQuery: ({ page, pageSize }) => ({ page, pageSize }),
        fetcher,
      }),
    )

    expect(result.current.pagination).toBeUndefined()
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.rows).toEqual(['page-1']))
    expect(fetcher).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
    expect(result.current.rows).toEqual(['page-1'])
    expect(result.current.total).toBe(25)
    expect(result.current.pagination).toMatchObject({ page: 1, pageSize: 10, total: 25 })
  })

  it('keeps empty rows stable while the first request is loading', () => {
    fetcher.mockReturnValue(new Promise(() => undefined))
    const { rerender, result } = renderHook(
      ({ marker }) =>
        usePaginatedResource({
          pageSize: 10,
          queryDeps: [marker],
          buildQuery: ({ page, pageSize }) => ({ page, pageSize, marker }),
          fetcher,
        }),
      { initialProps: { marker: 'same-query' } },
    )

    const firstRows = result.current.rows
    rerender({ marker: 'same-query' })

    expect(result.current.rows).toBe(firstRows)
  })

  it('changes pages through the shared page setter', async () => {
    const { result } = renderHook(() =>
      usePaginatedResource({
        pageSize: 10,
        buildQuery: ({ page, pageSize }) => ({ page, pageSize }),
        fetcher,
      }),
    )
    await waitFor(() => expect(result.current.rows).toEqual(['page-1']))

    act(() => result.current.setPage(2))

    await waitFor(() => expect(result.current.rows).toEqual(['page-2']))
    expect(fetcher).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 })
  })

  it('rebuilds the query when external query dependencies change', async () => {
    const { rerender, result } = renderHook(
      ({ keyword }) =>
        usePaginatedResource({
          pageSize: 10,
          queryDeps: [keyword],
          buildQuery: ({ page, pageSize }) => ({ page, pageSize, keyword }),
          fetcher,
        }),
      { initialProps: { keyword: 'admin' } },
    )
    await waitFor(() => expect(result.current.rows).toEqual(['page-1']))
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, keyword: 'admin' })

    rerender({ keyword: 'operator' })

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, keyword: 'operator' })
  })

  it('refreshes the current page without changing pagination state', async () => {
    const { result } = renderHook(() =>
      usePaginatedResource({
        pageSize: 10,
        initialPage: 3,
        buildQuery: ({ page, pageSize }) => ({ page, pageSize }),
        fetcher,
      }),
    )
    await waitFor(() => expect(result.current.rows).toEqual(['page-3']))

    act(() => result.current.refresh())

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(fetcher).toHaveBeenLastCalledWith({ page: 3, pageSize: 10 })
  })
})
