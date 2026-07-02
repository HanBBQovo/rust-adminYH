import { describe, expect, it } from 'vitest'

import { DEFAULT_DESKTOP_API_BASE_URL, resolveApiBaseUrl } from '@/config'

describe('app config', () => {
  it('uses the Vite proxy path during development', () => {
    expect(resolveApiBaseUrl({ PROD: false } as ImportMetaEnv)).toBe('/api')
  })

  it('uses an explicit local Rust API endpoint for production desktop builds', () => {
    expect(resolveApiBaseUrl({ PROD: true } as ImportMetaEnv)).toBe(DEFAULT_DESKTOP_API_BASE_URL)
  })

  it('honors and normalizes VITE_API_BASE_URL overrides', () => {
    expect(
      resolveApiBaseUrl({
        PROD: true,
        VITE_API_BASE_URL: 'https://admin-api.example.com/api/',
      } as ImportMetaEnv),
    ).toBe('https://admin-api.example.com/api')
  })
})
