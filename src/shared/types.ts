/**
 * 会话接口
 * 定义Claude会话的数据结构
 */
export interface Session {
  /** 会话唯一标识符 */
  id: string;
  /** 会话名称 */
  name: string;
  /** 所属项目ID */
  projectId: string;
  /** 创建时间（ISO字符串） */
  createdAt: string;
  /** 最后活动时间（ISO字符串） */
  lastActiveAt: string;
  /** Claude CLI会话ID（可选） */
  claudeSessionId?: string;
  /** 是否为临时会话 */
  isTemporary: boolean;
  /** 是否正在加载中（可选） */
  isLoading?: boolean;
  /** 会话文件路径（可选） */
  filePath?: string;
}

/**
 * 项目接口
 * 定义工作区项目的数据结构
 */
export interface Project {
  /** 项目唯一标识符 */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目路径 */
  path: string;
  /** 创建时间（ISO字符串） */
  createdAt: string;
  /** 项目下的会话列表 */
  sessions: Session[];
}

/**
 * Claude检测结果接口
 * 定义Claude CLI检测结果的数据结构
 */
export interface ClaudeDetectionResult {
  /** 是否已安装 */
  isInstalled: boolean
  /** 版本号（可选） */
  version?: string
  /** 安装路径（可选） */
  path?: string
  /** 错误信息（可选） */
  error?: string
  /** 检测时间戳 */
  timestamp: number
}

/**
 * Claude频道信息接口
 * 定义Claude服务频道的配置信息
 */
export interface ClaudeChannelInfo {
  /** 模型名称 */
  model: string
  /** API基础URL（可选） */
  apiBaseUrl?: string
  /** 频道名称（可选） */
  channelName?: string
  /** 信息时间戳 */
  timestamp: number
}