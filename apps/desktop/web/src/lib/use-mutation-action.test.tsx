import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmDialogContext } from '@/components/ui/confirm-dialog-context'
import { GlobalToastContext } from '@/components/ui/global-toast-context'
import { useMutationAction } from '@/lib/use-mutation-action'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function createWrapper(options?: { confirm?: ReturnType<typeof vi.fn>; showToast?: ReturnType<typeof vi.fn> }) {
  const confirm = options?.confirm ?? vi.fn().mockResolvedValue(true)
  const showToast = options?.showToast ?? vi.fn()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <GlobalToastContext.Provider value={{ showToast }}>
        <ConfirmDialogContext.Provider value={{ confirm }}>{children}</ConfirmDialogContext.Provider>
      </GlobalToastContext.Provider>
    )
  }

  return { Wrapper, confirm, showToast }
}

describe('useMutationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs a mutation with shared pending state, success toast, and success callback', async () => {
    const operation = deferred<string>()
    const onSuccess = vi.fn()
    const { Wrapper, showToast } = createWrapper()
    const { result } = renderHook(() => useMutationAction(), { wrapper: Wrapper })

    let mutationResult = Promise.resolve<string | undefined>(undefined)
    await act(async () => {
      mutationResult = result.current.runMutation(() => operation.promise, {
        successMessage: (value) => `完成 ${value}`,
        errorMessage: '保存失败',
        onSuccess,
      })
    })

    expect(result.current.pending).toBe(true)

    await act(async () => {
      operation.resolve('created')
      await mutationResult
    })

    expect(await mutationResult!).toBe('created')
    expect(showToast).toHaveBeenCalledWith('success', '完成 created', { translate: false })
    expect(onSuccess).toHaveBeenCalledWith('created')
    await waitFor(() => expect(result.current.pending).toBe(false))
  })

  it('normalizes mutation errors through the shared error toast and clears pending', async () => {
    const { Wrapper, showToast } = createWrapper()
    const { result } = renderHook(() => useMutationAction(), { wrapper: Wrapper })

    let mutationResult: string | undefined
    await act(async () => {
      mutationResult = await result.current.runMutation(() => Promise.reject(new Error('旧接口失败')), {
        successMessage: '保存成功',
        errorMessage: '保存失败',
      })
    })

    expect(mutationResult).toBeUndefined()
    expect(showToast).toHaveBeenCalledWith('error', '旧接口失败', { translate: false })
    expect(result.current.pending).toBe(false)
  })

  it('does not run confirmed mutations when the user cancels', async () => {
    const operation = vi.fn().mockResolvedValue(undefined)
    const { Wrapper, confirm, showToast } = createWrapper({ confirm: vi.fn().mockResolvedValue(false) })
    const { result } = renderHook(() => useMutationAction(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.runConfirmedMutation(operation, {
        confirm: { title: '删除发货公司', variant: 'destructive' },
        successMessage: '删除成功',
        errorMessage: '删除失败',
      })
    })

    expect(confirm).toHaveBeenCalledWith({ title: '删除发货公司', variant: 'destructive' })
    expect(operation).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it('runs confirmed mutations after confirmation succeeds', async () => {
    const operation = vi.fn().mockResolvedValue(undefined)
    const { Wrapper, confirm, showToast } = createWrapper()
    const { result } = renderHook(() => useMutationAction(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.runConfirmedMutation(operation, {
        confirm: { title: '删除订单', confirmText: '删除', variant: 'destructive' },
        successMessage: '删除成功',
        errorMessage: '删除失败',
      })
    })

    expect(confirm).toHaveBeenCalledWith({ title: '删除订单', confirmText: '删除', variant: 'destructive' })
    expect(operation).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('success', '删除成功', { translate: false })
    expect(result.current.pending).toBe(false)
  })
})
