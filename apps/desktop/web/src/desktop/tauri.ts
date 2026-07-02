export interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

export interface TauriGlobalApi {
  core?: TauriCoreApi
  invoke?: TauriCoreApi['invoke']
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobalApi
  }
}

export function getTauriCore(): TauriCoreApi | null {
  const tauri = window.__TAURI__
  if (!tauri) return null
  if (tauri.core?.invoke) return tauri.core
  if (tauri.invoke) return { invoke: tauri.invoke }
  return null
}

export function isTauriRuntime(): boolean {
  return getTauriCore() !== null
}
