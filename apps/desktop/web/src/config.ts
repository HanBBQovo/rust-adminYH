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
 * API 基础路径。开发期默认走 Vite `/api` 代理;Tauri 打包后可通过
 * VITE_API_BASE_URL 指向本地或内网 Rust HTTP 服务。
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/** 生成带命名空间前缀的存储键,例如 nsKey('last-page') => 'app:last-page'。 */
export function nsKey(name: string): string {
  return `${STORAGE_NAMESPACE}:${name}`
}
