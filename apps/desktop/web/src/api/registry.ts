import { apiRequest } from '@/api/client'

export type ResourceKey = 'orders' | 'receipts' | 'companies' | 'users' | 'roles' | 'menus'

export interface ResourceSummary {
  key: ResourceKey
  title: string
  description: string
  count: number
  status: 'ready' | 'building' | 'blocked'
  apiPath: string
  legacyPath: string
  owner: string
}

export async function listResourceSummaries(): Promise<ResourceSummary[]> {
  return apiRequest<ResourceSummary[]>('/admin/resources')
}
