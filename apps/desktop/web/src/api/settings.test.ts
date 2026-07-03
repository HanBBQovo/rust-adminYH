import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  APP_PREFERENCES_CHANGED_EVENT,
  DEFAULT_APP_PREFERENCES,
  appPreferencesStorageKey,
  loadAppPreferences,
  normalizeAppPreferences,
  resetAppearancePreferences,
  saveAppPreferences,
} from '@/api/settings'

describe('settings preferences api', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('loads default preferences from the namespaced settings store', async () => {
    await expect(loadAppPreferences()).resolves.toEqual(DEFAULT_APP_PREFERENCES)
    expect(appPreferencesStorageKey()).toBe('admin-yh:settings-preferences')
  })

  it('saves and reloads normalized non-sensitive app preferences', async () => {
    const saved = await saveAppPreferences({
      siteName: '  新后台  ',
      contact: ' ops@example.com ',
      owner: 'growth',
      features: ['webhook', 'export', 'webhook'],
      compactMode: true,
      animations: false,
    })

    expect(saved).toEqual({
      siteName: '新后台',
      contact: 'ops@example.com',
      owner: 'growth',
      features: ['webhook', 'export'],
      compactMode: true,
      animations: false,
    })
    await expect(loadAppPreferences()).resolves.toEqual(saved)
    expect(JSON.parse(window.localStorage.getItem(appPreferencesStorageKey()) || '{}')).not.toHaveProperty('password')
  })

  it('falls back to defaults when the stored payload is malformed', async () => {
    window.localStorage.setItem(appPreferencesStorageKey(), '{broken')

    await expect(loadAppPreferences()).resolves.toEqual(DEFAULT_APP_PREFERENCES)
  })

  it('normalizes unknown owners, features, booleans, and blank strings', () => {
    expect(
      normalizeAppPreferences({
        siteName: ' ',
        contact: '',
        owner: 'root',
        features: ['audit-log', 'shell', 123, 'audit-log'],
        compactMode: 'yes',
        animations: false,
      }),
    ).toEqual({
      ...DEFAULT_APP_PREFERENCES,
      features: ['audit-log'],
      animations: false,
    })
  })

  it('resets appearance flags without losing saved general preferences', async () => {
    const saved = await resetAppearancePreferences({
      siteName: '运营后台',
      contact: 'support@example.com',
      owner: 'support',
      features: ['beta-panel'],
      compactMode: true,
      animations: false,
    })

    expect(saved).toEqual({
      siteName: '运营后台',
      contact: 'support@example.com',
      owner: 'support',
      features: ['beta-panel'],
      compactMode: false,
      animations: true,
    })
    await expect(loadAppPreferences()).resolves.toEqual(saved)
  })

  it('notifies the app shell when preferences change', async () => {
    const listener = vi.fn()
    window.addEventListener(APP_PREFERENCES_CHANGED_EVENT, listener)

    const saved = await saveAppPreferences({
      siteName: '运营后台',
      contact: 'ops@example.com',
      owner: 'ops',
      features: ['export'],
      compactMode: true,
      animations: false,
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual(saved)
    window.removeEventListener(APP_PREFERENCES_CHANGED_EVENT, listener)
  })
})
