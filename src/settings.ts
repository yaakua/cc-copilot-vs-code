import * as vscode from 'vscode'
import { EventEmitter } from 'events'

// Claude官方账号信息
export interface ClaudeAccount {
  accountUuid: string
  emailAddress: string
  organizationUuid: string
  organizationRole: string
  workspaceRole: string | null
  organizationName: string
  authorization?: string // 存储从请求中拦截到的 authorization 头
}

// 第三方服务账号信息  
export interface ThirdPartyAccount {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  description?: string
}

// 服务提供方类型
export type ProviderType = 'claude_official' | 'third_party'

// 服务提供方配置
export interface ServiceProvider {
  id: string
  type: ProviderType
  name: string
  accounts: ClaudeAccount[] | ThirdPartyAccount[]
  activeAccountId: string // 当前激活的账号ID
  useProxy: boolean // 是否使用代理，默认true使用全局代理配置
}

export interface AppSettings {
  proxyConfig: {
    enabled: boolean
    url: string
    auth?: {
      username: string
      password: string
    }
  }
  // 废弃的字段，保持兼容性
  apiProviders: Array<{
    id: string
    name: string
    baseUrl: string
    apiKey: string
  }>
  activeProviderId: string

  // 新的服务提供方架构
  serviceProviders: ServiceProvider[]
  activeServiceProviderId: string // 当前激活的服务提供方ID

  terminal: {
    fontSize: number
    fontFamily: string
    theme: 'dark' | 'light'
    skipPermissions: boolean
  }

}

const defaultSettings: AppSettings = {
  proxyConfig: {
    enabled: false,
    url: 'http://127.0.0.1:1087'
  },
  // 保持兼容性的废弃字段
  apiProviders: [],
  activeProviderId: '',
  // 新的服务提供方架构
  serviceProviders: [],
  activeServiceProviderId: '',
  terminal: {
    fontSize: 14,
    fontFamily: 'Monaco, Consolas, monospace',
    theme: 'dark',
    skipPermissions: true
  },
}

export class SettingsManager extends EventEmitter {
  private context: vscode.ExtensionContext
  private readonly configurationSection = 'claudeCompanion'

  constructor(context: vscode.ExtensionContext) {
    super()
    this.context = context
    
    // 监听配置变更
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(this.configurationSection)) {
        this.emit('settings:updated', this.getSettings())
      }
    })
  }

  getSettings(): AppSettings {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    
    // 从VSCode配置中获取，如果不存在则使用默认值
    return {
      proxyConfig: config.get('proxyConfig', defaultSettings.proxyConfig),
      apiProviders: config.get('apiProviders', defaultSettings.apiProviders),
      activeProviderId: config.get('activeProviderId', defaultSettings.activeProviderId),
      serviceProviders: config.get('serviceProviders', defaultSettings.serviceProviders),
      activeServiceProviderId: config.get('activeServiceProviderId', defaultSettings.activeServiceProviderId),
      terminal: config.get('terminal', defaultSettings.terminal)
    }
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    
    for (const [key, value] of Object.entries(settings)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global)
    }
    
    this.emit('settings:updated', settings)
  }

  getProxyConfig() {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    return config.get('proxyConfig', defaultSettings.proxyConfig)
  }

  async updateProxyConfig(proxyConfig: Partial<AppSettings['proxyConfig']>): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    const current = this.getProxyConfig()
    const updated = { ...current, ...proxyConfig }
    
    await config.update('proxyConfig', updated, vscode.ConfigurationTarget.Global)
    this.emit('proxy:config-updated', updated)
  }

  getActiveProvider() {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    const providerId = config.get('activeProviderId', '')
    const providers = config.get('apiProviders', [])
    return providers.find((p: any) => p.id === providerId)
  }

  async setActiveProvider(providerId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    await config.update('activeProviderId', providerId, vscode.ConfigurationTarget.Global)
    this.emit('provider:changed', providerId)
  }

  // 新的服务提供方管理方法
  getServiceProviders(): ServiceProvider[] {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    return config.get('serviceProviders', [])
  }

  async addServiceProvider(provider: ServiceProvider): Promise<void> {
    const providers = this.getServiceProviders()
    const existingIndex = providers.findIndex((p: ServiceProvider) => p.id === provider.id)

    if (existingIndex >= 0) {
      providers[existingIndex] = provider
    } else {
      providers.push(provider)
    }

    const config = vscode.workspace.getConfiguration(this.configurationSection)
    await config.update('serviceProviders', providers, vscode.ConfigurationTarget.Global)
    this.emit('service-providers:updated', providers)
  }

  async removeServiceProvider(providerId: string): Promise<void> {
    const providers = this.getServiceProviders().filter((p: ServiceProvider) => p.id !== providerId)
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    
    await config.update('serviceProviders', providers, vscode.ConfigurationTarget.Global)

    // 如果删除的是当前活动的提供方，清空活动ID
    const currentActiveId = config.get('activeServiceProviderId', '')
    if (currentActiveId === providerId) {
      await config.update('activeServiceProviderId', '', vscode.ConfigurationTarget.Global)
    }

    this.emit('service-providers:updated', providers)
  }

  getActiveServiceProvider(): ServiceProvider | undefined {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    const providerId = config.get('activeServiceProviderId', '')
    const providers = this.getServiceProviders()
    return providers.find((p: ServiceProvider) => p.id === providerId)
  }

  async setActiveServiceProvider(providerId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    await config.update('activeServiceProviderId', providerId, vscode.ConfigurationTarget.Global)
    this.emit('active-service-provider:changed', providerId)
  }

  // Claude官方账号管理
  async updateClaudeAccounts(accounts: ClaudeAccount[]): Promise<void> {
    const providers = this.getServiceProviders()
    let claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')

    if (!claudeProvider) {
      claudeProvider = {
        id: 'claude_official',
        type: 'claude_official',
        name: 'Claude Official',
        accounts: [],
        activeAccountId: '',
        useProxy: true // 默认使用代理
      }
    }

    // 保留所有现有账号，只新增不存在的账号
    const existingAccounts = claudeProvider.accounts as ClaudeAccount[]
    const updatedAccounts = [...existingAccounts]

    // 添加新账号（不存在的账号）
    accounts.forEach(newAccount => {
      const existingIndex = updatedAccounts.findIndex(existing =>
        existing.emailAddress === newAccount.emailAddress
      )

      if (existingIndex >= 0) {
        // 更新现有账号的基本信息，保留authorization
        updatedAccounts[existingIndex] = {
          ...newAccount,
          authorization: updatedAccounts[existingIndex].authorization || newAccount.authorization
        }
      } else {
        // 添加新账号
        updatedAccounts.push(newAccount)
      }
    })

    claudeProvider.accounts = updatedAccounts

    // 如果当前活动账号不存在了，清空或设置为第一个
    if (!accounts.find(acc => acc.emailAddress === claudeProvider!.activeAccountId)) {
      claudeProvider.activeAccountId = accounts.length > 0 ? accounts[0].emailAddress : ''
    }

    await this.addServiceProvider(claudeProvider)
  }

  // 第三方账号管理
  async addThirdPartyAccount(providerId: string, account: ThirdPartyAccount): Promise<void> {
    const providers = this.getServiceProviders()
    let provider = providers.find((p: ServiceProvider) => p.id === providerId)

    if (!provider) {
      provider = {
        id: providerId,
        type: 'third_party',
        name: account.name,
        accounts: [],
        activeAccountId: '',
        useProxy: true // 默认使用代理
      }
    }

    const accounts = provider.accounts as ThirdPartyAccount[]
    const existingIndex = accounts.findIndex(acc => acc.id === account.id)

    if (existingIndex >= 0) {
      accounts[existingIndex] = account
    } else {
      accounts.push(account)
    }

    if (!provider.activeAccountId && accounts.length > 0) {
      provider.activeAccountId = accounts[0].id
    }

    await this.addServiceProvider(provider)
  }

  async removeThirdPartyAccount(providerId: string, accountId: string): Promise<void> {
    const providers = this.getServiceProviders()
    const provider = providers.find((p: ServiceProvider) => p.id === providerId)

    if (!provider) return

    const accounts = provider.accounts as ThirdPartyAccount[]
    provider.accounts = accounts.filter(acc => acc.id !== accountId)

    // 如果删除的是当前活动账号，设置为第一个或清空
    if (provider.activeAccountId === accountId) {
      provider.activeAccountId = provider.accounts.length > 0 ? (provider.accounts[0] as ThirdPartyAccount).id : ''
    }

    await this.addServiceProvider(provider)
  }

  async setActiveAccount(providerId: string, accountId: string): Promise<void> {
    const providers = this.getServiceProviders()
    const provider = providers.find((p: ServiceProvider) => p.id === providerId)

    if (provider) {
      provider.activeAccountId = accountId
      await this.addServiceProvider(provider)
      await this.setActiveServiceProvider(providerId)
      this.emit('active-account:changed', { providerId, accountId })
    }
  }

  getCurrentActiveAccount(): { provider: ServiceProvider, account: ClaudeAccount | ThirdPartyAccount } | null {
    const activeProvider = this.getActiveServiceProvider()
    if (!activeProvider || !activeProvider.activeAccountId) {
      return null
    }

    let account: ClaudeAccount | ThirdPartyAccount | undefined
    if (activeProvider.type === 'claude_official') {
      const claudeAccounts = activeProvider.accounts as ClaudeAccount[]
      account = claudeAccounts.find(acc => acc.emailAddress === activeProvider.activeAccountId)
    } else {
      const thirdPartyAccounts = activeProvider.accounts as ThirdPartyAccount[]
      account = thirdPartyAccounts.find(acc => acc.id === activeProvider.activeAccountId)
    }

    if (!account) return null

    return { provider: activeProvider, account }
  }

  // 设置服务提供方的代理使用状态
  async setProviderProxyUsage(providerId: string, useProxy: boolean): Promise<void> {
    const providers = this.getServiceProviders()
    const provider = providers.find((p: ServiceProvider) => p.id === providerId)

    if (provider) {
      provider.useProxy = useProxy
      await this.addServiceProvider(provider)
      this.emit('provider-proxy:changed', { providerId, useProxy })
    }
  }

  // 获取当前活动服务提供方的代理使用状态
  shouldUseProxyForCurrentProvider(): boolean {
    const activeProvider = this.getActiveServiceProvider()
    if (!activeProvider) {
      return true // 默认使用代理
    }
    return activeProvider.useProxy
  }

  // 刷新Claude账号（重新读取.claude.json文件）
  async refreshClaudeAccounts(): Promise<ClaudeAccount[]> {
    const accounts = await this.readClaudeAccountsFromConfig()
    await this.updateClaudeAccounts(accounts)
    return accounts
  }

  // 更新Claude账号的authorization值
  async updateClaudeAccountAuthorization(emailAddress: string, authorization: string): Promise<void> {
    const providers = this.getServiceProviders()
    const claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')

    if (!claudeProvider) return

    const accounts = claudeProvider.accounts as ClaudeAccount[]
    const account = accounts.find(acc => acc.emailAddress === emailAddress)

    if (account) {
      account.authorization = authorization
      await this.addServiceProvider(claudeProvider)
      this.emit('claude-account-auth:updated', { emailAddress, authorization })
    }
  }

  // 根据authorization值查找Claude账号
  findClaudeAccountByAuthorization(authorization: string): ClaudeAccount | null {
    const providers = this.getServiceProviders()
    const claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')

    if (!claudeProvider) return null

    const accounts = claudeProvider.accounts as ClaudeAccount[]
    return accounts.find(acc => acc.authorization === authorization) || null
  }


  // 获取终端配置
  getTerminalConfig() {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    return config.get('terminal', defaultSettings.terminal)
  }

  // 更新终端配置
  async updateTerminalConfig(terminalConfig: Partial<AppSettings['terminal']>): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    const current = this.getTerminalConfig()
    const updated = { ...current, ...terminalConfig }
    
    await config.update('terminal', updated, vscode.ConfigurationTarget.Global)
    this.emit('terminal:config-updated', updated)
  }

  // 获取是否跳过权限检查
  getSkipPermissions(): boolean {
    const terminalConfig = this.getTerminalConfig()
    return terminalConfig.skipPermissions
  }

  // 设置是否跳过权限检查
  async setSkipPermissions(skipPermissions: boolean): Promise<void> {
    await this.updateTerminalConfig({ skipPermissions })
  }

  // 读取Claude配置文件
  private async readClaudeAccountsFromConfig(): Promise<ClaudeAccount[]> {
    const os = require('os')
    const fs = require('fs').promises
    const path = require('path')

    try {
      const claudeConfigPath = path.join(os.homedir(), '.claude.json')
      const configData = await fs.readFile(claudeConfigPath, 'utf-8')
      const config = JSON.parse(configData)

      if (config.oauthAccount) {
        return [config.oauthAccount as ClaudeAccount]
      }

      return []
    } catch (error) {
      console.warn('无法读取Claude配置文件:', error)
      return []
    }
  }
}