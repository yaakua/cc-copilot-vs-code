/**
 * 设置管理模块导出
 * 提供扩展设置和配置管理的统一导出接口
 */

/** 设置管理器 - 统一管理扩展的所有设置和配置 */
export { SettingsManager } from './settings-manager'

/** 配置管理器 - 处理扩展配置文件的读写操作 */
export { ConfigManager } from './config-manager'

/** 服务提供商管理器 - 管理AI服务提供商的配置和状态 */
export { ServiceProviderManager } from './service-provider-manager'

/** Claude账号管理器 - 管理Claude相关账号的发现和配置 */
export { ClaudeAccountManager } from './claude-account-manager'

/** 导出所有类型定义 */
export * from './types'