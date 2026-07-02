import { apiRequest } from '@/api/client'

export interface LegacyCompany {
  id: number
  name: string
  Countorder: number
  createAt: string
  updateAt: string
}

export interface CompanyListParams {
  page: number
  pageSize: number
}

export interface LegacyCompanyListResponse {
  list: LegacyCompany[]
  totalCount: number
}

export interface CompanyListResult {
  rows: LegacyCompany[]
  total: number
}

export interface CompanyMutationPayload {
  name: string
}

export function buildCompanyListPayload(params: CompanyListParams) {
  const page = Math.max(params.page, 1)
  const pageSize = Math.max(params.pageSize, 1)

  return {
    offset: (page - 1) * pageSize,
    size: pageSize,
  }
}

export async function listCompanies(params: CompanyListParams): Promise<CompanyListResult> {
  const data = await apiRequest<LegacyCompanyListResponse>('/company/list', {
    method: 'POST',
    body: JSON.stringify(buildCompanyListPayload(params)),
  })

  return {
    rows: data.list,
    total: data.totalCount,
  }
}

export async function getCompany(companyId: number): Promise<LegacyCompany | null> {
  const data = await apiRequest<LegacyCompany[]>(`/company/${companyId}`, {
    method: 'GET',
  })
  return data[0] ?? null
}

export async function createCompany(payload: CompanyMutationPayload): Promise<void> {
  await apiRequest<unknown>('/company', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateCompany(companyId: number, payload: CompanyMutationPayload): Promise<void> {
  await apiRequest<unknown>(`/company/${companyId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteCompany(companyId: number): Promise<void> {
  await apiRequest<unknown>(`/company/${companyId}`, {
    method: 'DELETE',
  })
}
