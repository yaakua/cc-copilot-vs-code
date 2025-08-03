/**
 * Claude官方账号接口
 * 定义Claude官方服务账号的数据结构
 */
export interface ClaudeAccount {
  /** 账号UUID */
  accountUuid: string
  /** 邮箱地址 */
  emailAddress: string
  /** 组织UUID */
  organizationUuid: string
  /** 组织角色 */
  organizationRole: string
  /** 工作区角色（可选） */
  workspaceRole: string | null
  /** 组织名称 */
  organizationName: string
  /** 授权信息（可选） */
  authorization?: string
}

/**
 * 第三方服务账号接口
 * 定义第三方AI服务提供商账号的数据结构
 */
export interface ThirdPartyAccount {
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
 * 服务提供商类型
 * 支持Claude官方和第三方服务提供商
 */
export type ProviderType = 'claude_official' | 'third_party'

/**
 * 服务提供商接口
 * 定义AI服务提供商的配置结构
 */
export interface ServiceProvider {
  /** 提供商ID */
  id: string
  /** 提供商类型 */
  type: ProviderType
  /** 提供商名称 */
  name: string
  /** 账号列表 */
  accounts: ClaudeAccount[] | ThirdPartyAccount[]
  /** 活动账号ID */
  activeAccountId: string
  /** 是否使用代理 */
  useProxy: boolean
}

/**
 * 应用设置接口
 * 定义扩展的全局设置结构
 */
export interface AppSettings {
  /** 代理配置 */
  proxyConfig: {
    /** 是否启用代理 */
    enabled: boolean
    /** 代理URL */
    url: string
    /** 代理认证信息（可选） */
    auth?: {
      /** 用户名 */
      username: string
      /** 密码 */
      password: string
    }
  }
  /** API提供商列表（已废弃，保留向后兼容） */
  apiProviders: Array<{
    /** 提供商ID */
    id: string
    /** 提供商名称 */
    name: string
    /** 基础URL */
    baseUrl: string
    /** API密钥 */
    apiKey: string
  }>
  /** 活动提供商ID（已废弃，保留向后兼容） */
  activeProviderId: string
  /** 服务提供商列表 */
  serviceProviders: ServiceProvider[]
  /** 活动服务提供商ID */
  activeServiceProviderId: string
}

/**
 * 默认设置
 * 提供扩展的默认配置值
 */
export const defaultSettings: AppSettings = {
  proxyConfig: {
    enabled: false,
    url: 'http://127.0.0.1:1087'
  },
  apiProviders: [],
  activeProviderId: '',
  serviceProviders: [],
  activeServiceProviderId: ''
}