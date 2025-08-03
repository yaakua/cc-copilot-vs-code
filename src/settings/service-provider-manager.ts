import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { ServiceProvider, ThirdPartyAccount, ClaudeAccount } from './types'

export class ServiceProviderManager extends EventEmitter {
  constructor(
    private readonly configurationSection: string,
    private getServiceProviders: () => ServiceProvider[]
  ) {
    super()
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

  async createThirdPartyProvider(providerName: string, account: ThirdPartyAccount): Promise<ServiceProvider> {
    const providerId = `third_party_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const provider: ServiceProvider = {
      id: providerId,
      type: 'third_party',
      name: providerName,
      accounts: [account],
      activeAccountId: account.id,
      useProxy: true
    }

    await this.addServiceProvider(provider)
    return provider
  }

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
        useProxy: true
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

  getAllProviderOptions(): Array<{id: string, label: string, description?: string}> {
    const providers = this.getServiceProviders()
    const options: Array<{id: string, label: string, description?: string}> = []

    const claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')
    if (claudeProvider && claudeProvider.accounts.length > 0) {
      const claudeAccounts = claudeProvider.accounts as ClaudeAccount[]
      claudeAccounts.forEach(account => {
        options.push({
          id: `${claudeProvider.id}:${account.emailAddress}`,
          label: `Claude Official - ${account.emailAddress}`,
          description: account.organizationName
        })
      })
    }

    const thirdPartyProviders = providers.filter((p: ServiceProvider) => p.type === 'third_party')
    thirdPartyProviders.forEach(provider => {
      const thirdPartyAccounts = provider.accounts as ThirdPartyAccount[]
      thirdPartyAccounts.forEach(account => {
        options.push({
          id: `${provider.id}:${account.id}`,
          label: `${provider.name} - ${account.name}`,
          description: account.baseUrl
        })
      })
    })

    return options
  }

  async setActiveProviderByCompositeId(compositeId: string): Promise<void> {
    if (!compositeId) return

    const [providerId, accountId] = compositeId.split(':')
    if (providerId && accountId) {
      await this.setActiveAccount(providerId, accountId)
    }
  }

  getCurrentActiveCompositeId(): string {
    const activeProvider = this.getActiveServiceProvider()
    if (!activeProvider || !activeProvider.activeAccountId) {
      return ''
    }

    return `${activeProvider.id}:${activeProvider.activeAccountId}`
  }

  async setProviderProxyUsage(providerId: string, useProxy: boolean): Promise<void> {
    const providers = this.getServiceProviders()
    const provider = providers.find((p: ServiceProvider) => p.id === providerId)

    if (provider) {
      provider.useProxy = useProxy
      await this.addServiceProvider(provider)
      this.emit('provider-proxy:changed', { providerId, useProxy })
    }
  }

  shouldUseProxyForCurrentProvider(): boolean {
    const activeProvider = this.getActiveServiceProvider()
    if (!activeProvider) {
      return true
    }
    return activeProvider.useProxy
  }
}