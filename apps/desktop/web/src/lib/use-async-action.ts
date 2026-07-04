import { useCallback, useRef, useState } from 'react'

export interface AsyncActionOptions<TResult> {
  errorMessage: string
  onSuccess?: (result: TResult) => void | Promise<void>
}

function errorToMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useAsyncAction() {
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const clearError = useCallback(() => setError(''), [])

  const runAction = useCallback(async <TResult,>(operation: () => Promise<TResult>, options: AsyncActionOptions<TResult>) => {
    if (pendingRef.current) return undefined
    pendingRef.current = true
    setError('')
    setPending(true)
    try {
      const result = await operation()
      await options.onSuccess?.(result)
      return result
    } catch (actionError) {
      setError(errorToMessage(actionError, options.errorMessage))
      return undefined
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }, [])

  return { pending, error, clearError, runAction }
}
