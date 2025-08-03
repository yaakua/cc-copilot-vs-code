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
    const providers = this.getServiceProviders()
    let claudeProvider = providers.find((p: ServiceProvider) => p.type === 'claude_official')

    if (!claudeProvider) {
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
    const updatedAccounts = [...existingAccounts]

    accounts.forEach(newAccount => {
      const existingIndex = updatedAccounts.findIndex(existing =>
        existing.emailAddress === newAccount.emailAddress
      )

      if (existingIndex >= 0) {
        updatedAccounts[existingIndex] = {
          ...newAccount,
          authorization: updatedAccounts[existingIndex].authorization || newAccount.authorization
        }
      } else {
        updatedAccounts.push(newAccount)
      }
    })

    claudeProvider.accounts = updatedAccounts

    if (!accounts.find(acc => acc.emailAddress === claudeProvider!.activeAccountId)) {
      claudeProvider.activeAccountId = accounts.length > 0 ? accounts[0].emailAddress : ''
    }

    await this.addServiceProvider(claudeProvider)
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
      console.log('开始发现Claude账号...')

      const configAccounts = await this.readClaudeAccountsFromConfig()
      if (configAccounts.length > 0) {
        console.log(`从.claude.json发现 ${configAccounts.length} 个账号:`, configAccounts.map(a => a.emailAddress))
        discoveredAccounts.push(...configAccounts)
      }

      const storedAccounts = await this.discoverAccountsFromExtensionStorage()
      if (storedAccounts.length > 0) {
        console.log(`从扩展存储发现 ${storedAccounts.length} 个账号:`, storedAccounts.map(a => a.emailAddress))
        storedAccounts.forEach(storedAccount => {
          const existing = discoveredAccounts.find(acc => acc.emailAddress === storedAccount.emailAddress)
          if (!existing) {
            discoveredAccounts.push(storedAccount)
          } else {
            if (storedAccount.authorization && !existing.authorization) {
              existing.authorization = storedAccount.authorization
              console.log(`更新账号 ${existing.emailAddress} 的token`)
            }
          }
        })
      }

      await this.saveAccountsToExtensionStorage(discoveredAccounts)

      console.log(`总共发现 ${discoveredAccounts.length} 个Claude账号`)
      
      return discoveredAccounts
    } catch (error) {
      console.warn('自动发现Claude账号失败:', error)
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
    const os = require('os')
    const fs = require('fs').promises
    const path = require('path')

    try {
      const tempDir = path.join(os.tmpdir(), 'cc-copilot')
      if (!await this.pathExists(tempDir)) {
        return
      }

      const files = await fs.readdir(tempDir)
      const accountFiles = files.filter((file: string) => file.startsWith('account_') && file.endsWith('.json'))

      if (accountFiles.length === 0) {
        return
      }

      const currentAccounts = await this.discoverAccountsFromExtensionStorage()
      let hasNewAccounts = false

      for (const accountFile of accountFiles) {
        try {
          const filePath = path.join(tempDir, accountFile)
          const accountData = await fs.readFile(filePath, 'utf-8')
          const account: ClaudeAccount = JSON.parse(accountData)

          const existing = currentAccounts.find(acc => acc.emailAddress === account.emailAddress)
          if (!existing) {
            currentAccounts.push(account)
            hasNewAccounts = true
            console.log(`发现新的Claude账号: ${account.emailAddress}`)
          } else if (account.authorization && account.authorization !== existing.authorization) {
            existing.authorization = account.authorization
            hasNewAccounts = true
            console.log(`更新Claude账号token: ${account.emailAddress}`)
          }

          await fs.unlink(filePath)
        } catch (error) {
          console.warn(`处理账号文件失败: ${accountFile}`, error)
        }
      }

      if (hasNewAccounts) {
        await this.saveAccountsToExtensionStorage(currentAccounts)
        await this.updateClaudeAccounts(currentAccounts)
        this.emit('claude-accounts:discovered', currentAccounts)
      }
    } catch (error) {
      console.warn('处理拦截器发现的账号失败:', error)
    }
  }

  async saveDiscoveredAccount(account: ClaudeAccount): Promise<void> {
    try {
      const currentAccounts = await this.discoverAccountsFromExtensionStorage()
      const existingIndex = currentAccounts.findIndex(acc => acc.emailAddress === account.emailAddress)

      if (existingIndex >= 0) {
        currentAccounts[existingIndex] = { ...currentAccounts[existingIndex], ...account }
      } else {
        currentAccounts.push(account)
      }

      await this.saveAccountsToExtensionStorage(currentAccounts)
      await this.updateClaudeAccounts(currentAccounts)
      
      this.emit('claude-accounts:discovered', currentAccounts)
    } catch (error) {
      console.warn('保存发现的账号失败:', error)
    }
  }
}