import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { AppSettings, defaultSettings } from './types'

export class ConfigManager extends EventEmitter {
  constructor(private readonly configurationSection: string) {
    super()

    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(this.configurationSection)) {
        this.emit('settings:updated', this.getSettings())
      }
    })
  }

  getSettings(): AppSettings {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    
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

  getTerminalConfig() {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    return config.get('terminal', defaultSettings.terminal)
  }

  async updateTerminalConfig(terminalConfig: Partial<AppSettings['terminal']>): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.configurationSection)
    const current = this.getTerminalConfig()
    const updated = { ...current, ...terminalConfig }
    
    await config.update('terminal', updated, vscode.ConfigurationTarget.Global)
    this.emit('terminal:config-updated', updated)
  }

  getSkipPermissions(): boolean {
    const terminalConfig = this.getTerminalConfig()
    return terminalConfig.skipPermissions
  }

  async setSkipPermissions(skipPermissions: boolean): Promise<void> {
    await this.updateTerminalConfig({ skipPermissions })
  }
}