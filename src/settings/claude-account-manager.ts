import * as vscode from 'vscode'
import { EventEmitter } from 'events'
import { ClaudeAccount, ServiceProvider } from './types'

export class ClaudeAccountManager extends EventEmitter {
  constructor(
    private context: vscode.ExtensionContext,
    private getServiceProviders: () => ServiceProvider[],
    private addServiceProvider: (provider: ServiceProvider) => Promise<void>
  ) {
    super()
  }

  async updateClaudeAccounts(accounts: ClaudeAccount[]): Promise<void> {
    console.log(`🔄 Updating Claude accounts with ${accounts.length} accounts`)
    
    const providers = this.getServiceProviders()
    let claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')

    if (!claudeProvider) {
      console.log(`➕ Creating new Claude Official provider`)
      claudeProvider = {
        id: 'claude_official',
        type: 'claude_official',
        name: 'Claude Official',
        accounts: [],
        activeAccountId: '',
        useProxy: true
      }
    }

    const existingAccounts = claudeProvider.accounts as ClaudeAccount[]
    console.log(`📋 Found ${existingAccounts.length} existing accounts in settings`)
    
    // 创建一个新的账号列表，优先保留现有的token信息
    const updatedAccounts: ClaudeAccount[] = []

    accounts.forEach(newAccount => {
      const existing = existingAccounts.find(acc => acc.emailAddress === newAccount.emailAddress)

      if (existing) {
        // 合并账号信息，优先保留已有的token
        const mergedAccount = {
          ...newAccount,
          authorization: existing.authorization || newAccount.authorization
        }
        updatedAccounts.push(mergedAccount)
        console.log(`🔄 更新现有账号: ${newAccount.emailAddress} (token: ${!!mergedAccount.authorization})`)
      } else {
        // 新账号，直接添加
        updatedAccounts.push(newAccount)
        console.log(`➕ 添加新账号: ${newAccount.emailAddress} (token: ${!!newAccount.authorization})`)
      }
    })

    // 检查是否有现有账号不在新列表中（保留这些账号的token信息）
    existingAccounts.forEach(existing => {
      const found = accounts.find(acc => acc.emailAddress === existing.emailAddress)
      if (!found && existing.authorization) {
        // 保留有token的现有账号，即使它们不在新的发现列表中
        updatedAccounts.push(existing)
        console.log(`🔒 保留有token的现有账号: ${existing.emailAddress}`)
      }
    })

    claudeProvider.accounts = updatedAccounts

    // 确保活动账号ID仍然有效
    if (claudeProvider.activeAccountId) {
      const activeAccountExists = updatedAccounts.find(acc => acc.emailAddress === claudeProvider.activeAccountId)
      if (!activeAccountExists && updatedAccounts.length > 0) {
        claudeProvider.activeAccountId = updatedAccounts[0].emailAddress
        console.log(`🎯 重置活动账号为: ${claudeProvider.activeAccountId}`)
      }
    } else if (updatedAccounts.length > 0) {
      claudeProvider.activeAccountId = updatedAccounts[0].emailAddress
      console.log(`🎯 设置默认活动账号为: ${claudeProvider.activeAccountId}`)
    }

    await this.addServiceProvider(claudeProvider)
    console.log(`✅ Claude accounts updated successfully`)
  }

  async refreshClaudeAccounts(): Promise<ClaudeAccount[]> {
    const accounts = await this.discoverClaudeAccounts()
    await this.updateClaudeAccounts(accounts)
    return accounts
  }

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

  findClaudeAccountByAuthorization(authorization: string): ClaudeAccount | null {
    const providers = this.getServiceProviders()
    const claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')

    if (!claudeProvider) return null

    const accounts = claudeProvider.accounts as ClaudeAccount[]
    return accounts.find(acc => acc.authorization === authorization) || null
  }

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

  async discoverClaudeAccounts(): Promise<ClaudeAccount[]> {
    const discoveredAccounts: ClaudeAccount[] = []
    
    try {
      console.log('🔍 开始发现Claude账号...')

      // 1. 优先读取VSCode设置中的账号数据（包含token信息）
      const providers = this.getServiceProviders()
      const claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')
      
      if (claudeProvider && claudeProvider.accounts) {
        const settingsAccounts = claudeProvider.accounts as ClaudeAccount[]
        console.log(`📁 从VSCode设置发现 ${settingsAccounts.length} 个账号:`, settingsAccounts.map(a => a.emailAddress))
        discoveredAccounts.push(...settingsAccounts)
      }

      // 2. 读取Claude CLI目录中的最新账号信息
      const configAccounts = await this.readClaudeAccountsFromConfig()
      if (configAccounts.length > 0) {
        console.log(`📂 从.claude.json发现 ${configAccounts.length} 个账号:`, configAccounts.map(a => a.emailAddress))
        
        // 与现有账号合并，保留token信息
        configAccounts.forEach(configAccount => {
          const existing = discoveredAccounts.find(acc => acc.emailAddress === configAccount.emailAddress)
          if (!existing) {
            // 新账号，直接添加
            discoveredAccounts.push(configAccount)
            console.log(`➕ 添加新账号: ${configAccount.emailAddress}`)
          } else {
            // 现有账号，更新基础信息但保留token
            const updatedAccount = {
              ...configAccount,
              authorization: existing.authorization || configAccount.authorization
            }
            const existingIndex = discoveredAccounts.findIndex(acc => acc.emailAddress === configAccount.emailAddress)
            discoveredAccounts[existingIndex] = updatedAccount
            console.log(`🔄 更新账号信息: ${configAccount.emailAddress}`)
          }
        })
      }

      // 3. 读取从拦截器临时存储中的账号信息（主要包含新获取的token）
      const storedAccounts = await this.discoverAccountsFromExtensionStorage()
      if (storedAccounts.length > 0) {
        console.log(`💾 从扩展存储发现 ${storedAccounts.length} 个账号:`, storedAccounts.map(a => a.emailAddress))
        storedAccounts.forEach(storedAccount => {
          const existing = discoveredAccounts.find(acc => acc.emailAddress === storedAccount.emailAddress)
          if (!existing) {
            discoveredAccounts.push(storedAccount)
            console.log(`➕ 从存储添加新账号: ${storedAccount.emailAddress}`)
          } else {
            // 更新token信息
            if (storedAccount.authorization && storedAccount.authorization !== existing.authorization) {
              existing.authorization = storedAccount.authorization
              console.log(`🔑 更新账号 ${existing.emailAddress} 的token`)
            }
          }
        })
      }

      // 4. 清理扩展存储，因为数据已经合并到VSCode设置中
      await this.saveAccountsToExtensionStorage([])

      console.log(`✅ 总共发现 ${discoveredAccounts.length} 个Claude账号`)
      
      return discoveredAccounts
    } catch (error) {
      console.warn('❌ 自动发现Claude账号失败:', error)
      return discoveredAccounts
    }
  }

  private async discoverAccountsFromExtensionStorage(): Promise<ClaudeAccount[]> {
    try {
      const storedAccounts = this.context.globalState.get<ClaudeAccount[]>('discoveredClaudeAccounts', [])
      return storedAccounts
    } catch (error) {
      console.warn('从扩展存储读取账号失败:', error)
      return []
    }
  }

  private async saveAccountsToExtensionStorage(accounts: ClaudeAccount[]): Promise<void> {
    try {
      await this.context.globalState.update('discoveredClaudeAccounts', accounts)
    } catch (error) {
      console.warn('保存账号到扩展存储失败:', error)
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    const fs = require('fs').promises
    try {
      await fs.access(path)
      return true
    } catch {
      return false
    }
  }

  async processInterceptorDiscoveredAccounts(): Promise<void> {
    // 由于现在拦截器直接通过IPC更新VSCode设置，这个方法主要用于兼容性
    // 实际的账号更新已经通过拦截器的IPC通信机制完成
    console.log('🔄 Processing interceptor discovered accounts (via IPC)...')
    
    try {
      // 触发一次账号刷新，确保最新的数据被加载
      await this.refreshClaudeAccounts()
      console.log('✅ Interceptor account processing completed')
    } catch (error) {
      console.warn('⚠️ 处理拦截器发现的账号失败:', error)
    }
  }

  async saveDiscoveredAccount(account: ClaudeAccount): Promise<void> {
    try {
      console.log(`💾 Saving discovered account: ${account.emailAddress}`)
      
      // 直接更新当前的账号列表
      const providers = this.getServiceProviders()
      const claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')
      
      if (claudeProvider) {
        const accounts = claudeProvider.accounts as ClaudeAccount[]
        const existingIndex = accounts.findIndex(acc => acc.emailAddress === account.emailAddress)

        if (existingIndex >= 0) {
          // 更新现有账号，保留已有的authorization
          accounts[existingIndex] = { 
            ...accounts[existingIndex], 
            ...account,
            authorization: accounts[existingIndex].authorization || account.authorization
          }
          console.log(`🔄 Updated existing account: ${account.emailAddress}`)
        } else {
          // 添加新账号
          accounts.push(account)
          console.log(`➕ Added new account: ${account.emailAddress}`)
        }

        await this.addServiceProvider(claudeProvider)
        this.emit('claude-accounts:discovered', accounts)
      } else {
        // 创建新的provider
        await this.updateClaudeAccounts([account])
        this.emit('claude-accounts:discovered', [account])
      }
      
      console.log(`✅ Account saved successfully: ${account.emailAddress}`)
    } catch (error) {
      console.warn('❌ 保存发现的账号失败:', error)
    }
  }
}