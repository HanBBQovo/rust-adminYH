/**
 * 应用级常量的唯一来源 —— 派生新项目时,优先只改这个文件。
 *
 * localStorage 键、自定义事件名统一加 `app:` 前缀,避免与第三方脚本冲突,
 * 也方便在 DevTools 里一眼筛出本应用写入的存储。
 */

/** 品牌名;同时出现在侧栏、登录页、document.title(见 index.html)。 */
export const BRAND_NAME = '宇涵物流订单系统'

/** 产品副标题;用于登录页和桌面壳窗口标题等弱品牌场景。 */
export const PRODUCT_SUBTITLE = 'Rust + Tauri 企业管理端'

/** localStorage / 自定义事件的命名空间前缀。 */
export const STORAGE_NAMESPACE = 'admin-yh'

/**
 * 桌面生产默认连接本机 Rust API。Tauri 生产包没有 Vite `/api` 代理,
 * 所以不能在 production 继续使用相对 `/api`。
 */
export const DEFAULT_DESKTOP_API_BASE_URL = 'http://127.0.0.1:16824/api'

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '') || '/'
}

export function resolveApiBaseUrl(env: Pick<ImportMetaEnv, 'PROD' | 'VITE_API_BASE_URL'>): string {
  const configuredBaseUrl = env.VITE_API_BASE_URL?.trim()
  if (configuredBaseUrl) return trimTrailingSlashes(configuredBaseUrl)
  return env.PROD ? DEFAULT_DESKTOP_API_BASE_URL : '/api'
}

/**
 * API 基础路径。开发期默认走 Vite `/api` 代理;Tauri 生产包默认访问
 * `http://127.0.0.1:16824/api`,也可在打包时用 VITE_API_BASE_URL 指向内网 API。
 */
export const API_BASE_URL = resolveApiBaseUrl(import.meta.env)

/** 生成带命名空间前缀的存储键,例如 nsKey('last-page') => 'app:last-page'。 */
export function nsKey(name: string): string {
  return `${STORAGE_NAMESPACE}:${name}`
}
