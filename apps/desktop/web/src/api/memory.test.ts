import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listMemoryRecords, searchMemoryOptions } from '@/api/memory'

const fetchMock = vi.fn()

function dataOnlyResponse(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('memory api', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads old data-only memory records through the api wrapper', async () => {
    fetchMock.mockImplementationOnce(() =>
      dataOnlyResponse([{ value: '张三' }, { value: ' 李四 ' }, { value: '张三' }, { value: '' }]),
    )

    await expect(listMemoryRecords()).resolves.toEqual([{ value: '张三' }, { value: '李四' }])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/memory/list',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
  })

  it('keeps compatibility with envelope-wrapped memory payloads', async () => {
    fetchMock.mockImplementationOnce(() => dataOnlyResponse({ data: [{ value: '王五' }] }))

    await expect(listMemoryRecords()).resolves.toEqual([{ value: '王五' }])
  })

  it('filters memory values into reusable select options', async () => {
    fetchMock.mockImplementationOnce(() =>
      dataOnlyResponse([{ value: '上海收货人' }, { value: '杭州发货人' }, { value: '上海筛选收货人' }]),
    )

    await expect(searchMemoryOptions('上海')).resolves.toEqual([
      { value: '上海收货人', label: '上海收货人', description: '旧订单记忆词条' },
      { value: '上海筛选收货人', label: '上海筛选收货人', description: '旧订单记忆词条' },
    ])
  })
})
