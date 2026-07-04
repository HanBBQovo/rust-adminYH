import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { GlobalToastContext } from '@/components/ui/global-toast-context'
import { useDetailDialog } from '@/lib/use-detail-dialog'

type DialogMode = 'create' | 'edit' | 'view'

interface SeedRow {
  id: number
  name: string
  roleId?: number
}

interface DetailRow {
  id: number
  name: string
  roleName?: string
  loaded?: boolean
}

function createWrapper(showToast = vi.fn()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <GlobalToastContext.Provider value={{ showToast }}>{children}</GlobalToastContext.Provider>
  }

  return { Wrapper, showToast }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function renderDetailDialog(loadDetail = vi.fn<() => Promise<DetailRow | null>>()) {
  const { Wrapper, showToast } = createWrapper()
  const hook = renderHook(
    () =>
      useDetailDialog<SeedRow, DetailRow, DialogMode, null>({
        createMode: 'create',
        emptyDetail: null,
        fallbackMessage: '详情加载失败',
        loadDetail,
        seedDetail: (seed) => ({
          id: seed.id,
          name: seed.name,
          roleName: seed.roleId ? `角色 ${seed.roleId}` : '',
        }),
      }),
    { wrapper: Wrapper },
  )

  return { ...hook, loadDetail, showToast }
}

describe('useDetailDialog', () => {
  it('opens create mode with an empty detail without loading a row', () => {
    const { result, loadDetail } = renderDetailDialog()

    act(() => {
      void result.current.openDetail('view', { id: 1, name: '旧详情', roleId: 2 })
    })
    act(() => {
      result.current.openCreate()
    })

    expect(result.current.open).toBe(true)
    expect(result.current.mode).toBe('create')
    expect(result.current.detail).toBeNull()
    expect(loadDetail).toHaveBeenCalledTimes(1)
  })

  it('seeds the selected row before replacing it with loaded detail', async () => {
    const detail = deferred<DetailRow>()
    const loadDetail = vi.fn(() => detail.promise)
    const { result } = renderDetailDialog(loadDetail)

    await act(async () => {
      void result.current.openDetail('edit', { id: 7, name: '列表行', roleId: 3 })
    })

    expect(result.current.open).toBe(true)
    expect(result.current.mode).toBe('edit')
    expect(result.current.detail).toEqual({ id: 7, name: '列表行', roleName: '角色 3' })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      detail.resolve({ id: 7, name: '接口详情', roleName: '管理员', loaded: true })
      await detail.promise
    })

    expect(result.current.detail).toEqual({ id: 7, name: '接口详情', roleName: '管理员', loaded: true })
    expect(result.current.loading).toBe(false)
  })

  it('keeps the seeded row open and shows the legacy fallback toast when loading fails', async () => {
    const loadDetail = vi.fn(() => Promise.reject('failed'))
    const { result, showToast } = renderDetailDialog(loadDetail)

    await act(async () => {
      await result.current.openDetail('view', { id: 8, name: '列表行' })
    })

    expect(result.current.open).toBe(true)
    expect(result.current.detail).toEqual({ id: 8, name: '列表行', roleName: '' })
    expect(showToast).toHaveBeenCalledWith('error', '详情加载失败', { translate: false })
  })

  it('clears detail on close and ignores stale detail responses', async () => {
    const detail = deferred<DetailRow>()
    const loadDetail = vi.fn(() => detail.promise)
    const { result } = renderDetailDialog(loadDetail)

    await act(async () => {
      void result.current.openDetail('edit', { id: 9, name: '关闭前' })
    })

    act(() => {
      result.current.onOpenChange(false)
    })

    expect(result.current.open).toBe(false)
    expect(result.current.detail).toBeNull()
    expect(result.current.loading).toBe(false)

    await act(async () => {
      detail.resolve({ id: 9, name: '关闭后返回', loaded: true })
      await detail.promise
    })

    expect(result.current.open).toBe(false)
    expect(result.current.detail).toBeNull()
  })

  it('maps loaded detail before storing it for pages with transformed API shapes', async () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(
      () =>
        useDetailDialog<SeedRow, DetailRow, 'create' | 'edit', null, { id: number; label: string }>({
          createMode: 'create',
          emptyDetail: null,
          fallbackMessage: '菜单详情加载失败',
          loadDetail: (seed) => Promise.resolve({ id: seed.id, label: `${seed.name} API` }),
          mapLoaded: (detail) => ({ id: detail.id, name: detail.label, loaded: true }),
        }),
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.openDetail('edit', { id: 10, name: '菜单' })
    })

    expect(result.current.detail).toEqual({ id: 10, name: '菜单 API', loaded: true })
  })
})
