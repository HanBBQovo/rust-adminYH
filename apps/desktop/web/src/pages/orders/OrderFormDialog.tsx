import { useEffect, useState } from 'react'

import { searchMemoryOptions } from '@/api/memory'
import type { OrderMutationPayload } from '@/api/orders'
import { FormField, FormSection } from '@/components/layout/FormScaffold'
import { AutocompleteInput } from '@/components/ui/autocomplete-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createEmptyOrderForm,
  ORDER_FORM_FIELDS,
  orderToFormValues,
  validateOrderForm,
  type OrderFormMode,
  type OrderFormValues,
} from '@/pages/orders/order-form-config'

interface OrderFormDialogProps {
  mode: OrderFormMode
  open: boolean
  order?: { id: number } & OrderMutationPayload
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: OrderMutationPayload) => Promise<void>
}

const TITLE_BY_MODE: Record<OrderFormMode, string> = {
  create: '新建运单(*号代表必填)',
  edit: '编辑运单',
  view: '查看运单',
}

const MEMORY_FIELD_KEYS = new Set<keyof OrderFormValues>(['consignee', 'consignor'])

function normalizePayload(values: OrderFormValues): OrderMutationPayload {
  return {
    ...values,
    receiptnum: Number(values.receiptnum || 0),
  }
}

export function OrderFormDialog({
  mode,
  open,
  order,
  submitting = false,
  onOpenChange,
  onSubmit,
}: OrderFormDialogProps) {
  const [values, setValues] = useState<OrderFormValues>(() => createEmptyOrderForm())
  const [errors, setErrors] = useState<Partial<Record<keyof OrderFormValues, string>>>({})
  const readonly = mode === 'view'

  useEffect(() => {
    if (!open) return
    setValues(order ? orderToFormValues(order) : createEmptyOrderForm())
    setErrors({})
  }, [open, order])

  const updateValue = (key: keyof OrderFormValues, value: string | number) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const handleSubmit = async () => {
    const nextErrors = validateOrderForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    await onSubmit(normalizePayload(values))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{TITLE_BY_MODE[mode]}</DialogTitle>
          <DialogDescription>
            字段、选项和必填规则按旧 adminYh 运单弹窗迁移，提交统一走订单 API 封装。
          </DialogDescription>
        </DialogHeader>

        <FormSection>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ORDER_FORM_FIELDS.map((field) => {
              const value = values[field.key]
              const inputId = `order-${String(field.key)}`

              return (
                <FormField
                  key={field.key}
                  htmlFor={inputId}
                  label={field.label}
                  required={field.required}
                  error={errors[field.key]}
                >
                  {field.type === 'select' ? (
                    <Select
                      value={String(value ?? '')}
                      onValueChange={(nextValue) => updateValue(field.key, nextValue)}
                      disabled={readonly}
                    >
                      <SelectTrigger id={inputId}>
                        <SelectValue placeholder={field.placeholder || `请选择${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'textarea' ? (
                    <Textarea
                      id={inputId}
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      disabled={readonly}
                      onChange={(event) => updateValue(field.key, event.target.value)}
                    />
                  ) : MEMORY_FIELD_KEYS.has(field.key) ? (
                    <AutocompleteInput
                      id={inputId}
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      disabled={readonly}
                      loadOptions={searchMemoryOptions}
                      onValueChange={(nextValue) => updateValue(field.key, nextValue)}
                    />
                  ) : (
                    <Input
                      id={inputId}
                      type={field.type === 'date' ? 'date' : 'text'}
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      disabled={readonly}
                      onChange={(event) => updateValue(field.key, field.key === 'receiptnum' ? Number(event.target.value || 0) : event.target.value)}
                    />
                  )}
                </FormField>
              )
            })}
          </div>
        </FormSection>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {readonly ? '关闭' : '取消'}
          </Button>
          {!readonly ? (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中...' : '保存'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
