/**
 * 会话管理模块导出
 * 提供Claude会话和项目管理的统一导出接口
 */

/** 会话管理器 - 统一管理Claude会话的创建、删除和状态维护 */
export { SessionManager } from './session-manager'

/** 存储管理器 - 处理会话数据的持久化存储 */
export { StorageManager } from './storage-manager'

/** 项目管理器 - 管理工作区项目和会话的组织结构 */
export { ProjectManager } from './project-manager'

/** 会话数据管理器 - 处理会话数据的CRUD操作 */
export { SessionDataManager } from './session-data-manager'

/** Claude同步管理器 - 与Claude CLI本地数据进行同步 */
export { ClaudeSyncManager } from './claude-sync-manager'

/** 导出所有类型定义 */
export * from './types'