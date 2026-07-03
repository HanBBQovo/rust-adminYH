import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import type { SelectOption } from '@/components/ui/option-types'
import { cn } from '@/lib/utils'

export interface AutocompleteInputProps {
  id?: string
  value: string
  onValueChange: (value: string, option: SelectOption | null) => void
  loadOptions: (query: string) => Promise<SelectOption[]>
  placeholder?: string
  disabled?: boolean
  emptyText?: string
  loadingText?: string
  className?: string
}

export function AutocompleteInput({
  id,
  value,
  onValueChange,
  loadOptions,
  placeholder,
  disabled = false,
  emptyText = '没有匹配选项，可继续手动输入',
  loadingText = '加载记忆词条...',
  className,
}: AutocompleteInputProps) {
  const generatedId = useId()
  const inputId = id || generatedId
  const listboxId = `${inputId}-options`
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<SelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!open || disabled) return

    let cancelled = false
    setLoading(true)
    setError('')

    loadOptions(value)
      .then((result) => {
        if (!cancelled) setOptions(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '记忆词条加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [disabled, loadOptions, open, value])

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  const selectOption = (option: SelectOption) => {
    onValueChange(option.value, option)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        id={inputId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && !disabled}
        aria-controls={listboxId}
        className={className}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          closeTimer.current = window.setTimeout(() => setOpen(false), 120)
        }}
        onChange={(event) => {
          onValueChange(event.target.value, null)
          setOpen(true)
        }}
      />
      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            'absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-y-auto rounded-md border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg outline-none',
            'dark:border-white/[0.08] dark:bg-popover dark:shadow-[0_28px_48px_-30px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.03)]',
          )}
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {loadingText}
            </div>
          ) : null}
          {!loading && error ? <div className="px-3 py-4 text-center text-sm text-muted-foreground">{error}</div> : null}
          {!loading && !error && !options.length ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyText}</div>
          ) : null}
          {!loading && !error && options.length
            ? options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description ? <span className="block truncate text-xs text-muted-foreground">{option.description}</span> : null}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}
