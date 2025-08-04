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

// =============================================================================
// 统一配置类型定义
// 所有插件配置项都基于VSCode配置，包括账号信息
// =============================================================================

/**
 * Claude官方账号配置
 */
export interface ClaudeAccountConfig {
  /** 账号UUID */
  accountUuid: string
  /** 邮箱地址 */
  emailAddress: string
  /** 组织UUID */
  organizationUuid: string
  /** 组织角色 */
  organizationRole: string
  /** 工作区角色（可选） */
  workspaceRole?: string
  /** 组织名称 */
  organizationName: string
  /** 授权令牌（从拦截器获取并保存到配置） */
  authorization?: string
}

/**
 * 第三方账号配置
 */
export interface ThirdPartyAccountConfig {
  /** 账号ID */
  id: string
  /** 账号名称 */
  name: string
  /** API密钥 */
  apiKey: string
  /** 基础URL */
  baseUrl: string
  /** 描述信息（可选） */
  description?: string
}

/**
 * 代理配置
 */
export interface ProxyConfig {
  /** 是否启用代理 */
  enabled: boolean
  /** 代理URL */
  url: string
  /** 代理认证信息（可选） */
  auth?: {
    username: string
    password: string
  }
}

/**
 * 服务提供商类型
 */
export type ServiceProviderType = 'claude_official' | 'third_party'

/**
 * 服务提供商配置
 */
export interface ServiceProviderConfig {
  /** 提供商ID */
  id: string
  /** 提供商类型 */
  type: ServiceProviderType
  /** 提供商名称 */
  name: string
  /** 账号列表 */
  accounts: ClaudeAccountConfig[] | ThirdPartyAccountConfig[]
  /** 当前活动账号ID */
  activeAccountId: string
  /** 是否使用代理 */
  useProxy: boolean
}

/**
 * 插件完整配置
 * 所有配置项都存储在VSCode设置中
 */
export interface PluginConfig {
  /** 代理配置 */
  proxyConfig: ProxyConfig
  /** 服务提供商列表 */
  serviceProviders: ServiceProviderConfig[]
  /** 当前活动的服务提供商ID */
  activeServiceProviderId: string
}

/**
 * 默认插件配置
 */
export const defaultPluginConfig: PluginConfig = {
  proxyConfig: {
    enabled: false,
    url: 'http://127.0.0.1:1087'
  },
  serviceProviders: [],
  activeServiceProviderId: ''
}

/**
 * 配置常量
 */
export const CONFIG_CONSTANTS = {
  /** VSCode配置段名称 */
  CONFIGURATION_SECTION: 'ccCopilot',
  
  /** 服务提供商类型 */
  PROVIDER_TYPES: {
    CLAUDE_OFFICIAL: 'claude_official' as const,
    THIRD_PARTY: 'third_party' as const
  },
  
  /** 默认Claude提供商ID */
  CLAUDE_PROVIDER_ID: 'claude_official'
} as const