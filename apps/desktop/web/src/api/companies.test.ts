import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildCompanyListPayload,
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  updateCompany,
} from '@/api/companies'

const fetchMock = vi.fn()

const COMPANY_ROW = {
  id: 1,
  name: '顺丰速运',
  Countorder: 2,
  createAt: '2026-01-01T00:00:00Z',
  updateAt: '2026-01-02T00:00:00Z',
}

function jsonResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('companies api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds old company list paging payload', () => {
    expect(buildCompanyListPayload({ page: 3, pageSize: 20 })).toEqual({
      offset: 40,
      size: 20,
    })
  })

  it('posts to the old company list route and keeps Countorder', async () => {
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        totalCount: 1,
        list: [COMPANY_ROW],
      }),
    )

    await expect(listCompanies({ page: 2, pageSize: 10 })).resolves.toEqual({
      rows: [COMPANY_ROW],
      total: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/company/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ offset: 10, size: 10 }),
      }),
    )
  })

  it('unwraps old company detail array and mutation routes', async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse([COMPANY_ROW]))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))
      .mockImplementationOnce(() => jsonResponse({}))

    await expect(getCompany(1)).resolves.toEqual(COMPANY_ROW)
    await expect(createCompany({ name: '跨越速运' })).resolves.toBeUndefined()
    await expect(updateCompany(1, { name: '跨越物流' })).resolves.toBeUndefined()
    await expect(deleteCompany(1)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/company/1', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/company',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '跨越速运' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/company/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: '跨越物流' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/company/1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('returns null when old company detail array is empty', async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse([]))

    await expect(getCompany(99)).resolves.toBeNull()
  })
})
