import { useMemo, useState, type DependencyList } from 'react'

import type { PaginationProps } from '@/components/ui/pagination'
import { useResource, type ResourceState } from '@/lib/use-resource'

export interface PaginatedResourceQuery {
  page: number
  pageSize: number
}

export interface PaginatedResourceData<TRow> {
  rows: readonly TRow[]
  total: number
}

type PaginatedRows<TData> = TData extends PaginatedResourceData<infer TRow> ? readonly TRow[] : readonly never[]

const EMPTY_ROWS: readonly never[] = []

export interface UsePaginatedResourceOptions<
  TQuery extends PaginatedResourceQuery,
  TData extends PaginatedResourceData<unknown>,
> {
  pageSize: number
  initialPage?: number
  queryDeps?: DependencyList
  buildQuery: (params: PaginatedResourceQuery) => TQuery
  fetcher: (query: TQuery) => Promise<TData>
}

export interface PaginatedResourceState<
  TQuery extends PaginatedResourceQuery,
  TData extends PaginatedResourceData<unknown>,
> extends ResourceState<TData> {
  page: number
  pageSize: number
  setPage: (page: number) => void
  query: TQuery
  rows: PaginatedRows<TData>
  total: number
  pagination?: PaginationProps
}

export function usePaginatedResource<
  TQuery extends PaginatedResourceQuery,
  TData extends PaginatedResourceData<unknown>,
>({
  pageSize,
  initialPage = 1,
  queryDeps = [],
  buildQuery,
  fetcher,
}: UsePaginatedResourceOptions<TQuery, TData>): PaginatedResourceState<TQuery, TData> {
  const [page, setPage] = useState(initialPage)
  // buildQuery 通常由页面内联提供；依赖由 page/pageSize/queryDeps 显式声明。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = useMemo(() => buildQuery({ page, pageSize }), [page, pageSize, ...queryDeps])
  const resource = useResource(() => fetcher(query), [query])
  const rows = (resource.data?.rows ?? EMPTY_ROWS) as PaginatedRows<TData>
  const total = resource.data?.total ?? 0

  return {
    ...resource,
    page,
    pageSize,
    setPage,
    query,
    rows,
    total,
    pagination: resource.data ? { page, pageSize, total, onPageChange: setPage } : undefined,
  }
}
