import { useCallback, useState } from 'react'

import type { ConfirmOptions } from '@/components/ui/confirm-dialog-context'
import { useConfirm } from '@/components/ui/use-confirm'
import { useGlobalToast } from '@/components/ui/use-global-toast'

type MutationMessage<TResult> = string | ((result: TResult) => string)

export interface MutationActionOptions<TResult> {
  successMessage?: MutationMessage<TResult>
  errorMessage: string
  onSuccess?: (result: TResult) => void | Promise<void>
}

export interface ConfirmedMutationActionOptions<TResult> extends MutationActionOptions<TResult> {
  confirm: ConfirmOptions
}

function resolveMessage<TResult>(message: MutationMessage<TResult>, result: TResult) {
  return typeof message === 'function' ? message(result) : message
}

function errorToMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useMutationAction() {
  const confirm = useConfirm()
  const { showToast } = useGlobalToast()
  const [pending, setPending] = useState(false)

  const runMutation = useCallback(
    async <TResult,>(operation: () => Promise<TResult>, options: MutationActionOptions<TResult>) => {
      setPending(true)
      try {
        const result = await operation()
        if (options.successMessage) {
          showToast('success', resolveMessage(options.successMessage, result), { translate: false })
        }
        await options.onSuccess?.(result)
        return result
      } catch (error) {
        showToast('error', errorToMessage(error, options.errorMessage), { translate: false })
        return undefined
      } finally {
        setPending(false)
      }
    },
    [showToast],
  )

  const runConfirmedMutation = useCallback(
    async <TResult,>(operation: () => Promise<TResult>, options: ConfirmedMutationActionOptions<TResult>) => {
      const confirmed = await confirm(options.confirm)
      if (!confirmed) return undefined
      return runMutation(operation, options)
    },
    [confirm, runMutation],
  )

  return { pending, runMutation, runConfirmedMutation }
}
