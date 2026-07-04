import { useCallback, useState } from 'react'

import { useDetailLoader } from '@/lib/use-detail-loader'

export interface DetailDialogOptions<TSeed, TDetail, TMode extends string, TEmpty extends null | undefined, TLoaded = TDetail> {
  createMode: TMode
  emptyDetail: TEmpty
  fallbackMessage: string
  loadDetail: (seed: TSeed) => Promise<TLoaded | null | undefined>
  mapLoaded?: (detail: TLoaded, seed: TSeed) => TDetail
  seedDetail?: (seed: TSeed) => TDetail
}

export function useDetailDialog<
  TSeed,
  TDetail,
  TMode extends string,
  TEmpty extends null | undefined = undefined,
  TLoaded = TDetail,
>({
  createMode,
  emptyDetail,
  fallbackMessage,
  loadDetail: loadDetailRecord,
  mapLoaded,
  seedDetail,
}: DetailDialogOptions<TSeed, TDetail, TMode, TEmpty, TLoaded>) {
  const { loading, loadDetail, resetDetail } = useDetailLoader()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TMode>(createMode)
  const [detail, setDetail] = useState<TDetail | TEmpty>(emptyDetail)

  const clearDetail = useCallback(() => {
    resetDetail()
    setDetail(emptyDetail)
  }, [emptyDetail, resetDetail])

  const openCreate = useCallback(() => {
    clearDetail()
    setMode(createMode)
    setOpen(true)
  }, [clearDetail, createMode])

  const close = useCallback(() => {
    clearDetail()
    setOpen(false)
  }, [clearDetail])

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        close()
        return
      }
      setOpen(true)
    },
    [close],
  )

  const openDetail = useCallback(
    async (nextMode: TMode, seed: TSeed) => {
      setMode(nextMode)
      setDetail(seedDetail ? seedDetail(seed) : (seed as unknown as TDetail))
      setOpen(true)
      await loadDetail(() => loadDetailRecord(seed), {
        fallbackMessage,
        onLoaded: (loaded) => setDetail(mapLoaded ? mapLoaded(loaded, seed) : (loaded as unknown as TDetail)),
      })
    },
    [fallbackMessage, loadDetail, loadDetailRecord, mapLoaded, seedDetail],
  )

  return {
    close,
    detail,
    loading,
    mode,
    onOpenChange,
    open,
    openCreate,
    openDetail,
    setDetail,
  }
}
