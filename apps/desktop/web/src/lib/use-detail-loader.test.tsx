import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { GlobalToastContext } from '@/components/ui/global-toast-context'
import { useDetailLoader } from '@/lib/use-detail-loader'

function createWrapper(showToast = vi.fn()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <GlobalToastContext.Provider value={{ showToast }}>{children}</GlobalToastContext.Provider>
  }

  return { Wrapper, showToast }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('useDetailLoader', () => {
  it('loads a detail record and calls the success callback', async () => {
    const { Wrapper, showToast } = createWrapper()
    const onLoaded = vi.fn()
    const { result } = renderHook(() => useDetailLoader(), { wrapper: Wrapper })

    let loaded: { id: number; name: string } | undefined
    await act(async () => {
      loaded = await result.current.loadDetail(() => Promise.resolve({ id: 1, name: '顺丰速运' }), {
        fallbackMessage: '详情加载失败',
        onLoaded,
      })
    })

    expect(loaded).toEqual({ id: 1, name: '顺丰速运' })
    expect(onLoaded).toHaveBeenCalledWith({ id: 1, name: '顺丰速运' })
    expect(showToast).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })

  it('ignores empty detail responses without replacing the optimistic row', async () => {
    const { Wrapper, showToast } = createWrapper()
    const onLoaded = vi.fn()
    const { result } = renderHook(() => useDetailLoader(), { wrapper: Wrapper })

    let loaded: { id: number } | undefined
    await act(async () => {
      loaded = await result.current.loadDetail(() => Promise.resolve(null), {
        fallbackMessage: '详情加载失败',
        onLoaded,
      })
    })

    expect(loaded).toBeUndefined()
    expect(onLoaded).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('normalizes detail errors through the shared error toast', async () => {
    const { Wrapper, showToast } = createWrapper()
    const onLoaded = vi.fn()
    const { result } = renderHook(() => useDetailLoader(), { wrapper: Wrapper })

    let loaded: { id: number } | undefined
    await act(async () => {
      loaded = await result.current.loadDetail(() => Promise.reject(new Error('旧接口失败')), {
        fallbackMessage: '详情加载失败',
        onLoaded,
      })
    })

    expect(loaded).toBeUndefined()
    expect(onLoaded).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('error', '旧接口失败', { translate: false })
  })

  it('uses the fallback message for non-error rejections', async () => {
    const { Wrapper, showToast } = createWrapper()
    const { result } = renderHook(() => useDetailLoader(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.loadDetail(() => Promise.reject('failed'), {
        fallbackMessage: '用户详情加载失败',
        onLoaded: vi.fn(),
      })
    })

    expect(showToast).toHaveBeenCalledWith('error', '用户详情加载失败', { translate: false })
  })

  it('keeps only the latest detail response when requests resolve out of order', async () => {
    const first = deferred<{ id: number; name: string }>()
    const second = deferred<{ id: number; name: string }>()
    const { Wrapper } = createWrapper()
    const onLoaded = vi.fn()
    const { result } = renderHook(() => useDetailLoader(), { wrapper: Wrapper })

    await act(async () => {
      void result.current.loadDetail(() => first.promise, {
        fallbackMessage: '详情加载失败',
        onLoaded,
      })
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      void result.current.loadDetail(() => second.promise, {
        fallbackMessage: '详情加载失败',
        onLoaded,
      })
    })

    await act(async () => {
      first.resolve({ id: 1, name: '旧详情' })
      await first.promise
    })

    expect(onLoaded).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(true)

    await act(async () => {
      second.resolve({ id: 2, name: '新详情' })
      await second.promise
    })

    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(onLoaded).toHaveBeenCalledWith({ id: 2, name: '新详情' })
    expect(result.current.loading).toBe(false)
  })

  it('ignores stale responses after resetDetail is called', async () => {
    const detail = deferred<{ id: number; name: string }>()
    const { Wrapper, showToast } = createWrapper()
    const onLoaded = vi.fn()
    const { result } = renderHook(() => useDetailLoader(), { wrapper: Wrapper })

    await act(async () => {
      void result.current.loadDetail(() => detail.promise, {
        fallbackMessage: '详情加载失败',
        onLoaded,
      })
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      result.current.resetDetail()
    })
    expect(result.current.loading).toBe(false)

    await act(async () => {
      detail.resolve({ id: 1, name: '关闭后返回' })
      await detail.promise
    })

    expect(onLoaded).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })
})
