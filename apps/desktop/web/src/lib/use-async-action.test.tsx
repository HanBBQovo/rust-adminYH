import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAsyncAction } from '@/lib/use-async-action'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('useAsyncAction', () => {
  it('runs an async action with local pending state and success callback', async () => {
    const operation = deferred<string>()
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useAsyncAction())

    let actionResult = Promise.resolve<string | undefined>(undefined)
    await act(async () => {
      actionResult = result.current.runAction(() => operation.promise, {
        errorMessage: '登录失败',
        onSuccess,
      })
    })

    expect(result.current.pending).toBe(true)
    expect(result.current.error).toBe('')

    await act(async () => {
      operation.resolve('session')
      await actionResult
    })

    expect(await actionResult).toBe('session')
    expect(onSuccess).toHaveBeenCalledWith('session')
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.error).toBe('')
  })

  it('stores action errors locally without calling the success callback', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useAsyncAction())

    let actionResult: string | undefined
    await act(async () => {
      actionResult = await result.current.runAction(() => Promise.reject(new Error('密码错误')), {
        errorMessage: '登录失败',
        onSuccess,
      })
    })

    expect(actionResult).toBeUndefined()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.error).toBe('密码错误')
    expect(result.current.pending).toBe(false)
  })

  it('does not start another action while one is already pending', async () => {
    const operation = deferred<string>()
    const secondOperation = vi.fn().mockResolvedValue('second')
    const { result } = renderHook(() => useAsyncAction())

    await act(async () => {
      void result.current.runAction(() => operation.promise, {
        errorMessage: '登录失败',
      })
    })

    let secondResult: string | undefined
    await act(async () => {
      secondResult = await result.current.runAction(secondOperation, {
        errorMessage: '登录失败',
      })
    })

    expect(secondResult).toBeUndefined()
    expect(secondOperation).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(true)

    await act(async () => {
      operation.resolve('first')
      await operation.promise
    })

    expect(result.current.pending).toBe(false)
  })

  it('uses fallback messages for non-error rejections and can clear the error', async () => {
    const { result } = renderHook(() => useAsyncAction())

    await act(async () => {
      await result.current.runAction(() => Promise.reject('failed'), {
        errorMessage: '登录失败',
      })
    })

    expect(result.current.error).toBe('登录失败')

    await act(async () => {
      result.current.clearError()
    })

    expect(result.current.error).toBe('')
  })
})
