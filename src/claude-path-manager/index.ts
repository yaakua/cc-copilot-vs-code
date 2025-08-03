/**
 * Claude路径管理模块导出
 * 提供Claude CLI安装路径检测和管理的统一导出接口
 */

/** Claude路径管理器 - 负责检测和管理Claude CLI的安装路径 */
export { ClaudePathManager } from './claude-path-manager'

/** 安装发现器 - 负责在系统中发现Claude CLI的安装位置 */
export { InstallationDiscovery } from './installation-discovery'

/** 类型定义 - Claude路径管理相关的数据结构 */
export { ClaudePathResult, ClaudeInstallation, InstallationType } from './types'

/** 版本工具 - 处理Claude CLI版本比较和提取 */
export { compareVersions, extractVersion, getVersionSafely } from './version-utils'

/** 系统工具 - 提供文件系统和环境变量相关的工具函数 */
export { directoryExists, fileExists, getExpandedEnvironment } from './system-utils'

import { ClaudePathManager } from './claude-path-manager'

/**
 * Claude路径管理器单例实例
 * 提供全局访问的Claude路径管理器实例
 */
export const claudePathManager = ClaudePathManager.getInstance()