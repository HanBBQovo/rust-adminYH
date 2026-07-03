import { apiRequest } from '@/api/client'
import type { SelectOption } from '@/components/ui/option-types'

export interface LegacyMemoryRecord {
  value: string
}

export interface LegacyMemoryResponse {
  data: LegacyMemoryRecord[]
}

function normalizeMemoryRecords(payload: LegacyMemoryRecord[] | LegacyMemoryResponse | null | undefined): LegacyMemoryRecord[] {
  const records = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(records)) return []

  const seen = new Set<string>()
  return records
    .map((record) => String(record?.value ?? '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
    .map((value) => ({ value }))
}

export async function listMemoryRecords(): Promise<LegacyMemoryRecord[]> {
  const data = await apiRequest<LegacyMemoryRecord[] | LegacyMemoryResponse>('/memory/list', {
    method: 'POST',
    body: JSON.stringify({}),
  })

  return normalizeMemoryRecords(data)
}

export async function searchMemoryOptions(query: string): Promise<SelectOption[]> {
  const keyword = query.trim().toLowerCase()
  const records = await listMemoryRecords()

  return records
    .filter((record) => !keyword || record.value.toLowerCase().includes(keyword))
    .slice(0, 20)
    .map((record) => ({
      value: record.value,
      label: record.value,
      description: '旧订单记忆词条',
    }))
}
