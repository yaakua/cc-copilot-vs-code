import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { 
  PluginConfig, 
  defaultPluginConfig, 
  CONFIG_CONSTANTS,
  ClaudeAccountConfig,
  ThirdPartyAccountConfig,
  ServiceProviderConfig,
  ServiceProviderType
} from './types'

/**
 * 统一配置管理器
 * 直接使用VSCode配置系统，简化所有配置操作
 * 替代所有现有的配置管理器类
 */
export class UnifiedConfigManager extends EventEmitter {
  private readonly configSection = CONFIG_CONSTANTS.CONFIGURATION_SECTION

  constructor() {
    super()
    this.setupConfigWatcher()
    this.setupInterceptorListener()
  }

  // =============================================================================
  // 基础配置操作
  // =============================================================================

  /**
   * 获取完整插件配置
   */
  getConfig(): PluginConfig {
    const config = vscode.workspace.getConfiguration(this.configSection)
    
    return {
      proxyConfig: config.get('proxyConfig', defaultPluginConfig.proxyConfig),
      serviceProviders: config.get('serviceProviders', defaultPluginConfig.serviceProviders),
      activeServiceProviderId: config.get('activeServiceProviderId', defaultPluginConfig.activeServiceProviderId)
    }
  }

  /**
   * 更新配置（部分或全部）
   */
  async updateConfig(updates: Partial<PluginConfig>): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configSection)
    
    for (const [key, value] of Object.entries(updates)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global)
    }
    
    this.emit('config:updated', updates)
  }

  /**
   * 监听配置变化
   */
  private setupConfigWatcher(): void {
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(this.configSection)) {
        this.emit('config:changed', this.getConfig())
      }
    })
  }

  // =============================================================================
  // 代理配置操作
  // =============================================================================

  /**
   * 获取代理配置
   */
  getProxyConfig() {
    return this.getConfig().proxyConfig
  }

  /**
   * 更新代理配置
   */
  async updateProxyConfig(proxyConfig: Partial<PluginConfig['proxyConfig']>): Promise<void> {
    const current = this.getProxyConfig()
    const updated = { ...current, ...proxyConfig }
    
    await this.updateConfig({ proxyConfig: updated })
    this.emit('proxy:updated', updated)
  }

  // =============================================================================
  // 服务提供商操作
  // =============================================================================

  /**
   * 获取所有服务提供商
   */
  getServiceProviders(): ServiceProviderConfig[] {
    return this.getConfig().serviceProviders
  }

  /**
   * 添加或更新服务提供商
   */
  async addOrUpdateServiceProvider(provider: ServiceProviderConfig): Promise<void> {
    const providers = this.getServiceProviders()
    const existingIndex = providers.findIndex(p => p.id === provider.id)

    if (existingIndex >= 0) {
      providers[existingIndex] = provider
    } else {
      providers.push(provider)
    }

    await this.updateConfig({ serviceProviders: providers })
    this.emit('serviceProvider:updated', provider)
  }

  /**
   * 删除服务提供商
   */
  async removeServiceProvider(providerId: string): Promise<void> {
    const providers = this.getServiceProviders().filter(p => p.id !== providerId)
    const config = this.getConfig()

    const updates: Partial<PluginConfig> = { serviceProviders: providers }
    
    // 如果删除的是当前活动提供商，清空活动提供商ID
    if (config.activeServiceProviderId === providerId) {
      updates.activeServiceProviderId = ''
    }

    await this.updateConfig(updates)
    this.emit('serviceProvider:removed', providerId)
  }

  /**
   * 获取当前活动的服务提供商
   */
  getActiveServiceProvider(): ServiceProviderConfig | null {
    const config = this.getConfig()
    if (!config.activeServiceProviderId) return null
    
    return config.serviceProviders.find(p => p.id === config.activeServiceProviderId) || null
  }

  /**
   * 设置活动服务提供商
   */
  async setActiveServiceProvider(providerId: string): Promise<void> {
    await this.updateConfig({ activeServiceProviderId: providerId })
    this.emit('serviceProvider:activated', providerId)
  }

  // =============================================================================
  // Claude账号操作
  // =============================================================================

  /**
   * 获取Claude提供商
   */
  private getClaudeProvider(): ServiceProviderConfig | null {
    return this.getServiceProviders().find(p => p.type === CONFIG_CONSTANTS.PROVIDER_TYPES.CLAUDE_OFFICIAL) || null
  }

  /**
   * 确保Claude提供商存在
   */
  private async ensureClaudeProvider(): Promise<ServiceProviderConfig> {
    let claudeProvider = this.getClaudeProvider()
    
    if (!claudeProvider) {
      claudeProvider = {
        id: CONFIG_CONSTANTS.CLAUDE_PROVIDER_ID,
        type: CONFIG_CONSTANTS.PROVIDER_TYPES.CLAUDE_OFFICIAL,
        name: 'Claude Official',
        accounts: [],
        activeAccountId: '',
        useProxy: true
      }
      await this.addOrUpdateServiceProvider(claudeProvider)
    }
    
    return claudeProvider
  }

  /**
   * 获取所有Claude账号
   */
  getClaudeAccounts(): ClaudeAccountConfig[] {
    const provider = this.getClaudeProvider()
    return provider ? provider.accounts as ClaudeAccountConfig[] : []
  }

  /**
   * 添加或更新Claude账号
   */
  async addOrUpdateClaudeAccount(account: ClaudeAccountConfig): Promise<void> {
    const provider = await this.ensureClaudeProvider()
    const accounts = provider.accounts as ClaudeAccountConfig[]
    
    const existingIndex = accounts.findIndex(acc => acc.emailAddress === account.emailAddress)
    
    if (existingIndex >= 0) {
      // 更新现有账号，保留已有的authorization
      accounts[existingIndex] = {
        ...account,
        authorization: accounts[existingIndex].authorization || account.authorization
      }
    } else {
      accounts.push(account)
    }

    // 如果没有活动账号，设置为当前账号
    if (!provider.activeAccountId && accounts.length > 0) {
      provider.activeAccountId = account.emailAddress
    }

    await this.addOrUpdateServiceProvider(provider)
    this.emit('claudeAccount:updated', account)
  }

  /**
   * 更新Claude账号的授权令牌
   */
  async updateClaudeAccountAuthorization(emailAddress: string, authorization: string): Promise<void> {
    const provider = this.getClaudeProvider()
    if (!provider) return

    const accounts = provider.accounts as ClaudeAccountConfig[]
    const account = accounts.find(acc => acc.emailAddress === emailAddress)
    
    if (account) {
      account.authorization = authorization
      await this.addOrUpdateServiceProvider(provider)
      this.emit('claudeAccount:authUpdated', { emailAddress, authorization })
    }
  }

  /**
   * 根据授权令牌查找Claude账号
   */
  findClaudeAccountByAuthorization(authorization: string): ClaudeAccountConfig | null {
    const accounts = this.getClaudeAccounts()
    return accounts.find(acc => acc.authorization === authorization) || null
  }

  /**
   * 设置活动Claude账号
   */
  async setActiveClaudeAccount(emailAddress: string): Promise<void> {
    const provider = this.getClaudeProvider()
    if (!provider) return

    provider.activeAccountId = emailAddress
    await this.addOrUpdateServiceProvider(provider)
    await this.setActiveServiceProvider(provider.id)
    this.emit('claudeAccount:activated', emailAddress)
  }

  /**
   * 获取当前活动的Claude账号
   */
  getCurrentActiveClaudeAccount(): ClaudeAccountConfig | null {
    const provider = this.getActiveServiceProvider()
    if (!provider || provider.type !== CONFIG_CONSTANTS.PROVIDER_TYPES.CLAUDE_OFFICIAL) {
      return null
    }

    const accounts = provider.accounts as ClaudeAccountConfig[]
    return accounts.find(acc => acc.emailAddress === provider.activeAccountId) || null
  }

  // =============================================================================
  // Claude账号发现和同步
  // =============================================================================

  /**
   * 从Claude CLI配置文件发现账号
   */
  async discoverClaudeAccountsFromCLI(): Promise<ClaudeAccountConfig[]> {
    try {
      const claudeConfigPath = path.join(os.homedir(), '.claude.json')
      
      if (!fs.existsSync(claudeConfigPath)) {
        console.log('Claude CLI config file not found')
        return []
      }

      const configData = fs.readFileSync(claudeConfigPath, 'utf-8')
      const config = JSON.parse(configData)

      if (config.oauthAccount) {
        const account: ClaudeAccountConfig = {
          accountUuid: config.oauthAccount.accountUuid || '',
          emailAddress: config.oauthAccount.emailAddress || '',
          organizationUuid: config.oauthAccount.organizationUuid || '',
          organizationRole: config.oauthAccount.organizationRole || 'member',
          workspaceRole: config.oauthAccount.workspaceRole || null,
          organizationName: config.oauthAccount.organizationName || 'Unknown',
          authorization: config.oauthAccount.authorization
        }
        
        console.log(`Discovered Claude account: ${account.emailAddress}`)
        return [account]
      }

      return []
    } catch (error) {
      console.warn('Failed to discover Claude accounts from CLI:', error)
      return []
    }
  }

  /**
   * 刷新Claude账号（从CLI发现并更新到配置）
   */
  async refreshClaudeAccounts(): Promise<ClaudeAccountConfig[]> {
    const discoveredAccounts = await this.discoverClaudeAccountsFromCLI()
    
    for (const account of discoveredAccounts) {
      await this.addOrUpdateClaudeAccount(account)
    }
    
    this.emit('claudeAccounts:refreshed', discoveredAccounts)
    return discoveredAccounts
  }

  // =============================================================================
  // 第三方账号操作
  // =============================================================================

  /**
   * 添加第三方账号
   */
  async addThirdPartyAccount(providerName: string, account: ThirdPartyAccountConfig): Promise<void> {
    const providerId = `third_party_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const provider: ServiceProviderConfig = {
      id: providerId,
      type: CONFIG_CONSTANTS.PROVIDER_TYPES.THIRD_PARTY,
      name: providerName,
      accounts: [account],
      activeAccountId: account.id,
      useProxy: true
    }

    await this.addOrUpdateServiceProvider(provider)
    this.emit('thirdPartyAccount:added', { provider, account })
  }

  // =============================================================================
  // 工具方法
  // =============================================================================

  /**
   * 当前提供商是否应该使用代理
   */
  shouldUseProxyForCurrentProvider(): boolean {
    const activeProvider = this.getActiveServiceProvider()
    return activeProvider ? activeProvider.useProxy : true
  }

  /**
   * 获取所有提供商选项（用于UI选择）
   */
  getAllProviderOptions(): Array<{id: string, label: string, description?: string}> {
    const providers = this.getServiceProviders()
    const options: Array<{id: string, label: string, description?: string}> = []

    providers.forEach(provider => {
      if (provider.type === CONFIG_CONSTANTS.PROVIDER_TYPES.CLAUDE_OFFICIAL) {
        const claudeAccounts = provider.accounts as ClaudeAccountConfig[]
        claudeAccounts.forEach(account => {
          options.push({
            id: `${provider.id}:${account.emailAddress}`,
            label: `Claude Official - ${account.emailAddress}`,
            description: account.organizationName
          })
        })
      } else {
        const thirdPartyAccounts = provider.accounts as ThirdPartyAccountConfig[]
        thirdPartyAccounts.forEach(account => {
          options.push({
            id: `${provider.id}:${account.id}`,
            label: `${provider.name} - ${account.name}`,
            description: account.baseUrl
          })
        })
      }
    })

    return options
  }

  /**
   * 通过复合ID设置活动提供商和账号
   */
  async setActiveProviderByCompositeId(compositeId: string): Promise<void> {
    if (!compositeId) return

    const [providerId, accountId] = compositeId.split(':')
    if (!providerId || !accountId) return

    const provider = this.getServiceProviders().find(p => p.id === providerId)
    if (!provider) return

    provider.activeAccountId = accountId
    await this.addOrUpdateServiceProvider(provider)
    await this.setActiveServiceProvider(providerId)
    this.emit('provider:activatedByComposite', { providerId, accountId })
  }

  // =============================================================================
  // 兼容性方法（用于现有代码迁移）
  // =============================================================================

  /**
   * 获取当前活动账号（兼容性方法）
   */
  getCurrentActiveAccount(): { provider: ServiceProviderConfig, account: any } | null {
    const provider = this.getActiveServiceProvider()
    if (!provider) return null

    let account = null
    if (provider.type === CONFIG_CONSTANTS.PROVIDER_TYPES.CLAUDE_OFFICIAL) {
      const accounts = provider.accounts as ClaudeAccountConfig[]
      account = accounts.find(acc => acc.emailAddress === provider.activeAccountId)
    } else {
      const accounts = provider.accounts as ThirdPartyAccountConfig[]
      account = accounts.find(acc => acc.id === provider.activeAccountId)
    }

    return account ? { provider, account } : null
  }

  /**
   * 设置活动账号（兼容性方法）
   */
  async setActiveAccount(providerId: string, accountId: string): Promise<void> {
    const provider = this.getServiceProviders().find(p => p.id === providerId)
    if (!provider) return

    provider.activeAccountId = accountId
    await this.addOrUpdateServiceProvider(provider)
    await this.setActiveServiceProvider(providerId)
    this.emit('activeAccount:changed', { providerId, accountId })
  }

  /**
   * 获取当前活动复合ID
   */
  getCurrentActiveCompositeId(): string {
    const provider = this.getActiveServiceProvider()
    if (!provider || !provider.activeAccountId) return ''
    
    return `${provider.id}:${provider.activeAccountId}`
  }

  /**
   * 创建第三方提供商（兼容性方法）
   */
  async createThirdPartyProvider(name: string, account: ThirdPartyAccountConfig): Promise<void> {
    await this.addThirdPartyAccount(name, account)
  }

  // =============================================================================
  // 拦截器通信监听
  // =============================================================================

  /**
   * 设置拦截器监听器
   * 监听拦截器的授权更新和账号发现通知
   */
  private setupInterceptorListener(): void {
    try {
      const tempDir = path.join(os.homedir(), '.cc-copilot-auth-updates')
      
      // 确保目录存在
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      // 监听授权更新文件
      fs.watch(tempDir, (eventType: string, filename: string | null) => {
        if (filename && eventType === 'rename' && filename.startsWith('auth_update_')) {
          this.handleInterceptorAuthUpdate(path.join(tempDir, filename))
        }
      })

      // 记录监听器以便清理（在实际使用中应该添加到disposal列表）
      console.log('✅ Interceptor authorization listener setup complete')
    } catch (error) {
      console.warn('⚠️ Failed to setup interceptor listener:', error)
    }
  }

  /**
   * 处理拦截器的授权更新通知
   */
  private async handleInterceptorAuthUpdate(filePath: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        return
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const updateData = JSON.parse(fileContent)

      if (updateData.type === 'AUTHORIZATION_UPDATE') {
        console.log(`📨 Received authorization update from interceptor for: ${updateData.emailAddress}`)
        
        // 更新配置中的授权令牌
        await this.updateClaudeAccountAuthorization(updateData.emailAddress, updateData.authorization)
        
        console.log(`✅ Authorization updated for: ${updateData.emailAddress}`)
        
      } else if (updateData.type === 'ACCOUNT_DISCOVERED') {
        console.log(`📨 Received account discovery from interceptor: ${updateData.account.emailAddress}`)
        
        // 添加或更新发现的账号
        await this.addOrUpdateClaudeAccount(updateData.account)
        
        console.log(`✅ Account added/updated: ${updateData.account.emailAddress}`)
        
      } else if (updateData.type === 'TOKEN_EXPIRED') {
        console.log(`⚠️ Received token expiration notification for: ${updateData.emailAddress}`)
        
        // 清空过期的授权令牌
        await this.updateClaudeAccountAuthorization(updateData.emailAddress, '')
        
        console.log(`🔄 Cleared expired token for: ${updateData.emailAddress}`)
      }

      // 删除处理完的文件
      fs.unlinkSync(filePath)
      
    } catch (error) {
      console.warn('❌ Failed to handle interceptor auth update:', error)
    }
  }
}