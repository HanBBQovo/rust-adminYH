import { describe, expect, it } from 'vitest'

import { RESOURCE_REGISTRY } from '@/api/registry'

describe('resource registry', () => {
  it('marks implemented primary modules as ready', () => {
    const readyKeys = ['orders', 'receipts', 'companies', 'users', 'roles', 'menus']

    for (const key of readyKeys) {
      expect(RESOURCE_REGISTRY.find((resource) => resource.key === key)?.status).toBe('ready')
    }
  })
})
