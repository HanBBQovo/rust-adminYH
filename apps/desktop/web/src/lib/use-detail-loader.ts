import { useCallback, useEffect, useRef, useState } from 'react'

import { useGlobalToast } from '@/components/ui/use-global-toast'

function errorToMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export interface DetailLoaderOptions<TDetail> {
  fallbackMessage: string
  onLoaded: (detail: TDetail) => void
}

export function useDetailLoader() {
  const { showToast } = useGlobalToast()
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [])

  const resetDetail = useCallback(() => {
    requestIdRef.current += 1
    setLoading(false)
  }, [])

  const loadDetail = useCallback(
    async <TDetail,>(fetcher: () => Promise<TDetail | null | undefined>, options: DetailLoaderOptions<TDetail>) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      setLoading(true)
      try {
        const detail = await fetcher()
        if (mountedRef.current && requestIdRef.current === requestId && detail) {
          options.onLoaded(detail)
        }
        return detail ?? undefined
      } catch (error) {
        if (mountedRef.current && requestIdRef.current === requestId) {
          showToast('error', errorToMessage(error, options.fallbackMessage), { translate: false })
        }
        return undefined
      } finally {
        if (mountedRef.current && requestIdRef.current === requestId) {
          setLoading(false)
        }
      }
    },
    [showToast],
  )

  return { loading, loadDetail, resetDetail }
}
