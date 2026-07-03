import { nsKey } from '@/config'

export interface AppPreferences {
  siteName: string
  contact: string
  owner: string
  features: string[]
  compactMode: boolean
  animations: boolean
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  siteName: '宇涵物流订单系统',
  contact: 'admin@yuhang.local',
  owner: 'ops',
  features: ['audit-log', 'export'],
  compactMode: false,
  animations: true,
}

export const APP_PREFERENCES_CHANGED_EVENT = 'admin-yh:settings-preferences-changed'

const STORAGE_KEY = nsKey('settings-preferences')
const VALID_OWNERS = new Set(['ops', 'growth', 'support'])
const VALID_FEATURES = new Set(['audit-log', 'export', 'webhook', 'beta-panel'])

function clonePreferences(preferences: AppPreferences): AppPreferences {
  return {
    ...preferences,
    features: [...preferences.features],
  }
}

function defaultPreferences(): AppPreferences {
  return clonePreferences(DEFAULT_APP_PREFERENCES)
}

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function cleanOwner(value: unknown): string {
  if (typeof value === 'string' && VALID_OWNERS.has(value)) return value
  return DEFAULT_APP_PREFERENCES.owner
}

function cleanFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_APP_PREFERENCES.features]
  const deduped = value.filter((item): item is string => typeof item === 'string' && VALID_FEATURES.has(item))
  return Array.from(new Set(deduped))
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeAppPreferences(value: unknown): AppPreferences {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    siteName: cleanString(record.siteName, DEFAULT_APP_PREFERENCES.siteName),
    contact: cleanString(record.contact, DEFAULT_APP_PREFERENCES.contact),
    owner: cleanOwner(record.owner),
    features: cleanFeatures(record.features),
    compactMode: cleanBoolean(record.compactMode, DEFAULT_APP_PREFERENCES.compactMode),
    animations: cleanBoolean(record.animations, DEFAULT_APP_PREFERENCES.animations),
  }
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  return readAppPreferencesSnapshot()
}

export function readAppPreferencesSnapshot(): AppPreferences {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultPreferences()
  try {
    return normalizeAppPreferences(JSON.parse(raw))
  } catch {
    return defaultPreferences()
  }
}

function notifyAppPreferencesChanged(preferences: AppPreferences) {
  window.dispatchEvent(
    new CustomEvent<AppPreferences>(APP_PREFERENCES_CHANGED_EVENT, {
      detail: clonePreferences(preferences),
    }),
  )
}

export async function saveAppPreferences(values: AppPreferences): Promise<AppPreferences> {
  const preferences = normalizeAppPreferences(values)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  notifyAppPreferencesChanged(preferences)
  return preferences
}

export async function resetAppearancePreferences(current: AppPreferences): Promise<AppPreferences> {
  return saveAppPreferences({
    ...current,
    compactMode: DEFAULT_APP_PREFERENCES.compactMode,
    animations: DEFAULT_APP_PREFERENCES.animations,
  })
}

export function appPreferencesStorageKey(): string {
  return STORAGE_KEY
}
