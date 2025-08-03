import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { AppSettings, ServiceProvider, ClaudeAccount, ThirdPartyAccount } from './types'
import { ConfigManager } from './config-manager'
import { ServiceProviderManager } from './service-provider-manager'
import { ClaudeAccountManager } from './claude-account-manager'

export class SettingsManager extends EventEmitter {
  private context: vscode.ExtensionContext
  private readonly configurationSection = 'ccCopilot'
  private configManager: ConfigManager
  private serviceProviderManager: ServiceProviderManager
  private claudeAccountManager: ClaudeAccountManager

  constructor(context: vscode.ExtensionContext) {
    super()
    this.context = context

    this.configManager = new ConfigManager(this.configurationSection)
    this.serviceProviderManager = new ServiceProviderManager(
      this.configurationSection, 
      () => this.getServiceProviders()
    )
    this.claudeAccountManager = new ClaudeAccountManager(
      context,
      () => this.getServiceProviders(),
      (provider: ServiceProvider) => this.serviceProviderManager.addServiceProvider(provider)
    )

    this.setupEventForwarding()
  }

  private setupEventForwarding() {
    this.configManager.on('settings:updated', (settings) => this.emit('settings:updated', settings))
    this.configManager.on('proxy:config-updated', (config) => this.emit('proxy:config-updated', config))
    this.configManager.on('provider:changed', (providerId) => this.emit('provider:changed', providerId))

    this.serviceProviderManager.on('service-providers:updated', (providers) => this.emit('service-providers:updated', providers))
    this.serviceProviderManager.on('active-service-provider:changed', (providerId) => this.emit('active-service-provider:changed', providerId))
    this.serviceProviderManager.on('active-account:changed', (data) => this.emit('active-account:changed', data))
    this.serviceProviderManager.on('provider-proxy:changed', (data) => this.emit('provider-proxy:changed', data))

    this.claudeAccountManager.on('claude-account-auth:updated', (data) => this.emit('claude-account-auth:updated', data))
    this.claudeAccountManager.on('claude-accounts:discovered', (accounts) => this.emit('claude-accounts:discovered', accounts))
  }

  // Config Manager methods
  getSettings(): AppSettings {
    return this.configManager.getSettings()
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    return this.configManager.updateSettings(settings)
  }

  getProxyConfig() {
    return this.configManager.getProxyConfig()
  }

  async updateProxyConfig(proxyConfig: Partial<AppSettings['proxyConfig']>): Promise<void> {
    return this.configManager.updateProxyConfig(proxyConfig)
  }

  getActiveProvider() {
    return this.configManager.getActiveProvider()
  }

  async setActiveProvider(providerId: string): Promise<void> {
    return this.configManager.setActiveProvider(providerId)
  }


  // Service Provider Manager methods
  getServiceProviders(): ServiceProvider[] {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    return config.get('serviceProviders', [])
  }

  async addServiceProvider(provider: ServiceProvider): Promise<void> {
    return this.serviceProviderManager.addServiceProvider(provider)
  }

  async removeServiceProvider(providerId: string): Promise<void> {
    return this.serviceProviderManager.removeServiceProvider(providerId)
  }

  getActiveServiceProvider(): ServiceProvider | undefined {
    return this.serviceProviderManager.getActiveServiceProvider()
  }

  async setActiveServiceProvider(providerId: string): Promise<void> {
    return this.serviceProviderManager.setActiveServiceProvider(providerId)
  }

  async createThirdPartyProvider(providerName: string, account: ThirdPartyAccount): Promise<ServiceProvider> {
    return this.serviceProviderManager.createThirdPartyProvider(providerName, account)
  }

  async addThirdPartyAccount(providerId: string, account: ThirdPartyAccount): Promise<void> {
    return this.serviceProviderManager.addThirdPartyAccount(providerId, account)
  }

  async removeThirdPartyAccount(providerId: string, accountId: string): Promise<void> {
    return this.serviceProviderManager.removeThirdPartyAccount(providerId, accountId)
  }

  async setActiveAccount(providerId: string, accountId: string): Promise<void> {
    return this.serviceProviderManager.setActiveAccount(providerId, accountId)
  }

  getCurrentActiveAccount(): { provider: ServiceProvider, account: ClaudeAccount | ThirdPartyAccount } | null {
    return this.serviceProviderManager.getCurrentActiveAccount()
  }

  getAllProviderOptions(): Array<{id: string, label: string, description?: string}> {
    return this.serviceProviderManager.getAllProviderOptions()
  }

  async setActiveProviderByCompositeId(compositeId: string): Promise<void> {
    return this.serviceProviderManager.setActiveProviderByCompositeId(compositeId)
  }

  getCurrentActiveCompositeId(): string {
    return this.serviceProviderManager.getCurrentActiveCompositeId()
  }

  async setProviderProxyUsage(providerId: string, useProxy: boolean): Promise<void> {
    return this.serviceProviderManager.setProviderProxyUsage(providerId, useProxy)
  }

  shouldUseProxyForCurrentProvider(): boolean {
    return this.serviceProviderManager.shouldUseProxyForCurrentProvider()
  }

  // Claude Account Manager methods
  async updateClaudeAccounts(accounts: ClaudeAccount[]): Promise<void> {
    return this.claudeAccountManager.updateClaudeAccounts(accounts)
  }

  async refreshClaudeAccounts(): Promise<ClaudeAccount[]> {
    return this.claudeAccountManager.refreshClaudeAccounts()
  }

  async updateClaudeAccountAuthorization(emailAddress: string, authorization: string): Promise<void> {
    return this.claudeAccountManager.updateClaudeAccountAuthorization(emailAddress, authorization)
  }

  findClaudeAccountByAuthorization(authorization: string): ClaudeAccount | null {
    return this.claudeAccountManager.findClaudeAccountByAuthorization(authorization)
  }

  async discoverClaudeAccounts(): Promise<ClaudeAccount[]> {
    return this.claudeAccountManager.discoverClaudeAccounts()
  }

  async processInterceptorDiscoveredAccounts(): Promise<void> {
    return this.claudeAccountManager.processInterceptorDiscoveredAccounts()
  }

  async saveDiscoveredAccount(account: ClaudeAccount): Promise<void> {
    return this.claudeAccountManager.saveDiscoveredAccount(account)
  }
}