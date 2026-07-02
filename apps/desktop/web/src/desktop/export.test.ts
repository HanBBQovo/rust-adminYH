import { beforeEach, describe, expect, it, vi } from 'vitest'

import { saveOrdersCsvWithDesktopDialog } from '@/desktop/export'

describe('desktop export bridge', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, '__TAURI__')
  })

  it('returns false outside Tauri so browser download can be used', async () => {
    await expect(saveOrdersCsvWithDesktopDialog({ filename: 'orders.csv', contents: 'csv' })).resolves.toBe(false)
  })

  it('invokes the desktop command when Tauri core is available', async () => {
    const invoke = vi.fn().mockResolvedValue(true)
    window.__TAURI__ = { core: { invoke } }

    await expect(saveOrdersCsvWithDesktopDialog({ filename: 'orders.csv', contents: 'csv' })).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledWith('export_orders_csv', {
      filename: 'orders.csv',
      contents: 'csv',
    })
  })

  it('supports the older global invoke shape injected by Tauri', async () => {
    const invoke = vi.fn().mockResolvedValue(false)
    window.__TAURI__ = { invoke }

    await expect(saveOrdersCsvWithDesktopDialog({ filename: 'orders.csv', contents: 'csv' })).resolves.toBe(false)
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
