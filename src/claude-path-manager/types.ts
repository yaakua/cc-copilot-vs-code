/**
 * Claude路径检测结果接口
 * 定义Claude CLI路径检测操作的返回结果
 */
export interface ClaudePathResult {
  /** 是否找到Claude CLI */
  isFound: boolean
  /** Claude CLI的路径（如果找到） */
  path?: string
  /** Claude CLI的版本（如果检测到） */
  version?: string
  /** 错误信息（如果检测失败） */
  error?: string
  /** 检测时间戳 */
  timestamp: number
}

/**
 * 安装类型枚举
 * 定义Claude CLI的不同安装类型
 */
export enum InstallationType {
  /** 系统安装 - 通过包管理器或官方安装程序安装 */
  System = 'system',
  /** 自定义安装 - 用户手动指定的路径 */
  Custom = 'custom'
}

/**
 * Claude安装信息接口
 * 定义Claude CLI安装的详细信息
 */
export interface ClaudeInstallation {
  /** Claude CLI的完整路径 */
  path: string
  /** 版本信息（如果可获取） */
  version?: string
  /** 安装来源描述 */
  source: string
  /** 安装类型 */
  installationType: InstallationType
}